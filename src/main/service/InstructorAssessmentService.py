"""
InstructorAssessmentService - Manages instructor-side assessment operations

Handles:
- Creating and managing assessments
- Uploading and managing students
- Batch question generation coordination
- Batch evaluation coordination
- Progress monitoring across all students
- Results aggregation and reporting

Uses DynamoDB for data storage.
"""

from __future__ import annotations
import logging
import os
import json
import uuid
import boto3
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from src.main.service.InstructorAssessmentCatalog import InstructorAssessmentCatalog
from src.main.service.InstructorAssessmentEnrollment import InstructorAssessmentEnrollment
from src.main.service.InstructorAssessmentProgressAggregator import InstructorAssessmentProgressAggregator
from src.main.service.InstructorAssessmentResultsAggregator import InstructorAssessmentResultsAggregator

logger = logging.getLogger(__name__)


class InstructorAssessmentServiceError(Exception):
    """Custom exception for instructor assessment service errors"""
    pass


class DecimalEncoder(json.JSONEncoder):
    """Helper to convert Decimal to int/float for JSON serialization"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)


class InstructorAssessmentService:
    """Service for managing instructor assessment operations"""
    
    def __init__(self):
        """Initialize service with DynamoDB connection"""
        self.region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
        self.table_name = os.getenv("DYNAMODB_ASSESSMENT_TABLE", "oral_assessments")
        
        try:
            # Initialize DynamoDB
            self.dynamodb = boto3.resource('dynamodb', region_name=self.region)
            self.table = self.dynamodb.Table(self.table_name)
            self.catalog = InstructorAssessmentCatalog(table=self.table)
            self.enrollment = InstructorAssessmentEnrollment(
                table=self.table,
                assessment_exists=self.catalog.get_assessment,
            )
            self.progress_aggregator = InstructorAssessmentProgressAggregator(
                table=self.table,
                get_students=self.enrollment.get_assessment_students,
            )
            self.results_aggregator = InstructorAssessmentResultsAggregator(
                table=self.table,
                get_students=self.enrollment.get_assessment_students,
            )
            
            logger.info(f"Connected to DynamoDB table: {self.table_name}")
        except Exception as e:
            raise InstructorAssessmentServiceError(f"Failed to connect to DynamoDB: {e}")
    
    def _convert_decimals(self, obj: Any) -> Any:
        """Recursively convert Decimal objects to int/float"""
        if isinstance(obj, list):
            return [self._convert_decimals(i) for i in obj]
        elif isinstance(obj, dict):
            return {k: self._convert_decimals(v) for k, v in obj.items()}
        elif isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return obj
    
    def create_assessment(
        self,
        title: str,
        course: str,
        description: str,
        due_date: str,
        total_questions: int,
        time_limit: Optional[int] = None,
        owner_user_id: Optional[str] = None,
        access_mode: str = "open",
        scheduled_window_start: Optional[str] = None,
        scheduled_window_end: Optional[str] = None,
        auto_evaluate: bool = False,
        rubric: Optional[str] = None,
        answer_mode: str = "oral",
        preparation_time: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Create a new assessment.

        Args:
            title: Assessment title
            course: Course name/code
            description: Assessment description
            due_date: Due date (ISO format)
            total_questions: Number of questions to generate
            time_limit: Time limit per question in minutes (optional)
            auto_evaluate: Trigger evaluation automatically when all students submit
            rubric: Custom grading rubric injected into the evaluation prompt

        Returns:
            Created assessment data
        """
        try:
            assessment_id = str(uuid.uuid4())
            created_at = datetime.now(timezone.utc).isoformat()

            assessment = {
                'PK': f"ASSESSMENT#{assessment_id}",
                'SK': 'METADATA',
                'GSI1PK': 'ASSESSMENT',
                'GSI1SK': created_at,
                'id': assessment_id,
                'createdBy': owner_user_id,
                'title': title,
                'course': course,
                'description': description,
                'dueDate': due_date,
                'totalQuestions': total_questions,
                'timeLimit': (time_limit * 60) if time_limit is not None else None,
                'accessMode': access_mode,
                'scheduledWindowStart': scheduled_window_start,
                'scheduledWindowEnd': scheduled_window_end,
                'autoEvaluate': auto_evaluate,
                'rubric': rubric,
                'answerMode': answer_mode,
                'preparationTime': preparation_time,
                'status': 'draft',
                'createdAt': created_at,
                'updatedAt': created_at
            }
            
            self.table.put_item(Item=assessment)
            
            logger.info(f"Created assessment: {assessment_id}")
            return self._convert_decimals(assessment)
            
        except Exception as e:
            logger.error(f"Failed to create assessment: {e}")
            raise InstructorAssessmentServiceError(f"Failed to create assessment: {e}")
    
    def list_assessments(self, owner_user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List all assessments.
        
        Returns:
            List of assessments ordered by creation date (newest first)
        """
        try:
            assessments = self.catalog.list_assessments(owner_user_id=owner_user_id)
            
            logger.info(f"Retrieved {len(assessments)} assessments")
            return assessments
            
        except Exception as e:
            logger.error(f"Failed to list assessments: {e}")
            raise InstructorAssessmentServiceError(f"Failed to list assessments: {e}")
    
    def get_assessment(self, assessment_id: str) -> Dict[str, Any]:
        """
        Get assessment by ID.
        
        Args:
            assessment_id: Assessment identifier
        
        Returns:
            Assessment data
        
        Raises:
            InstructorAssessmentServiceError: If assessment not found
        """
        try:
            return self.catalog.get_assessment(assessment_id)
        except ValueError as e:
            raise InstructorAssessmentServiceError(str(e))
        except InstructorAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to get assessment: {e}")
            raise InstructorAssessmentServiceError(f"Failed to get assessment: {e}")
    
    def upload_students(
        self,
        assessment_id: str,
        students: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Upload students to an assessment (bulk enrollment).
        
        Args:
            assessment_id: Assessment identifier
            students: List of student data (name, email, studentId, code)
        
        Returns:
            Upload confirmation with count
        """
        try:
            result = self.enrollment.upload_students(assessment_id, students)
            logger.info(f"Uploaded {len(students)} students to assessment {assessment_id}")
            return result
        except ValueError as e:
            raise InstructorAssessmentServiceError(str(e))
        except InstructorAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to upload students: {e}")
            raise InstructorAssessmentServiceError(f"Failed to upload students: {e}")
    
    def update_brief(self, assessment_id: str, brief: str) -> Dict[str, Any]:
        """
        Update the assignment brief for an assessment.
        The brief must be at least 50 characters and cannot be changed once
        question generation has started (status != 'draft').
        """
        if len(brief.strip()) < 50:
            raise InstructorAssessmentServiceError(
                "Assignment brief must be at least 50 characters"
            )
        assessment = self.get_assessment(assessment_id)
        if assessment.get("status") not in ("draft", "scheduled"):
            raise InstructorAssessmentServiceError(
                "Brief can only be edited while assessment is in draft or scheduled status"
            )
        updated_at = datetime.now(timezone.utc).isoformat()
        self.table.update_item(
            Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"},
            UpdateExpression="SET assignmentBrief = :brief, updatedAt = :ua",
            ExpressionAttributeValues={
                ":brief": brief,
                ":ua": updated_at,
            },
        )
        logger.info(f"Updated brief for assessment {assessment_id} ({len(brief)} chars)")
        return self.get_assessment(assessment_id)

    def update_schedule(
        self,
        assessment_id: str,
        access_mode: str,
        scheduled_window_start: Optional[str] = None,
        scheduled_window_end: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Update assessment access mode and scheduling window."""
        try:
            # Validate
            if access_mode not in ("open", "scheduled"):
                raise InstructorAssessmentServiceError("accessMode must be 'open' or 'scheduled'")
            if access_mode == "scheduled" and (not scheduled_window_start or not scheduled_window_end):
                raise InstructorAssessmentServiceError("scheduledWindowStart and scheduledWindowEnd are required for scheduled mode")

            updated_at = datetime.now(timezone.utc).isoformat()
            self.table.update_item(
                Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"},
                UpdateExpression="SET accessMode = :am, scheduledWindowStart = :ws, scheduledWindowEnd = :we, updatedAt = :ua",
                ExpressionAttributeValues={
                    ":am": access_mode,
                    ":ws": scheduled_window_start,
                    ":we": scheduled_window_end,
                    ":ua": updated_at,
                },
            )
            logger.info(f"Updated schedule for assessment {assessment_id}: mode={access_mode}")
            return self.get_assessment(assessment_id)
        except InstructorAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to update schedule: {e}")
            raise InstructorAssessmentServiceError(f"Failed to update schedule: {e}")

    def delete_assessment(self, assessment_id: str) -> None:
        """
        Delete a draft assessment and all its associated data.
        Only assessments with status='draft' can be deleted.
        """
        try:
            assessment = self.get_assessment(assessment_id)
            if assessment["status"] != "draft":
                raise InstructorAssessmentServiceError(
                    f"Only draft assessments can be deleted (current status: {assessment['status']})"
                )

            # Get enrolled students before deleting anything
            students = self.enrollment.get_assessment_students(assessment_id)
            student_ids = [s["studentId"] for s in students]

            # Delete all ASSESSMENT#{id} partition items (metadata + enrollment records)
            assessment_items = self.table.query(
                KeyConditionExpression=Key("PK").eq(f"ASSESSMENT#{assessment_id}")
            )
            with self.table.batch_writer() as batch:
                for item in assessment_items.get("Items", []):
                    batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})

            # For each student: delete reverse lookup + any student-specific items (questions, answers, progress)
            for student_id in student_ids:
                # Delete reverse lookup: STUDENT#{id}, SK: ASSESSMENT#{assessment_id}
                self.table.delete_item(
                    Key={"PK": f"STUDENT#{student_id}", "SK": f"ASSESSMENT#{assessment_id}"}
                )
                # Delete all STUDENT#{id}#ASSESSMENT#{id} items
                pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
                student_items = self.table.query(
                    KeyConditionExpression=Key("PK").eq(pk)
                )
                with self.table.batch_writer() as batch:
                    for item in student_items.get("Items", []):
                        batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})

            logger.info(f"Deleted assessment {assessment_id} with {len(student_ids)} student records")

        except InstructorAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to delete assessment: {e}")
            raise InstructorAssessmentServiceError(f"Failed to delete assessment: {e}")

    def get_assessment_students(self, assessment_id: str) -> List[Dict[str, Any]]:
        """
        Get all students enrolled in an assessment.
        
        Args:
            assessment_id: Assessment identifier
        
        Returns:
            List of enrolled students
        """
        try:
            students = self.enrollment.get_assessment_students(assessment_id)
            
            logger.info(f"Retrieved {len(students)} students for assessment {assessment_id}")
            return students
            
        except Exception as e:
            logger.error(f"Failed to get students: {e}")
            raise InstructorAssessmentServiceError(f"Failed to get students: {e}")
    
    def get_assessment_progress(self, assessment_id: str) -> List[Dict[str, Any]]:
        """
        Get progress for all students in an assessment.
        
        Args:
            assessment_id: Assessment identifier
        
        Returns:
            List of student progress data
        """
        try:
            progress_list = self.progress_aggregator.get_assessment_progress(assessment_id)
            logger.info(f"Retrieved progress for {len(progress_list)} students")
            return progress_list
            
        except Exception as e:
            logger.error(f"Failed to get assessment progress: {e}")
            raise InstructorAssessmentServiceError(f"Failed to get assessment progress: {e}")
    
    def get_assessment_results(self, assessment_id: str) -> List[Dict[str, Any]]:
        """
        Get evaluation results for all students in an assessment.
        
        Args:
            assessment_id: Assessment identifier
        
        Returns:
            List of student results
        """
        try:
            results_list = self.results_aggregator.get_assessment_results(assessment_id)
            logger.info(f"Retrieved results for {len(results_list)} students")
            return results_list
            
        except Exception as e:
            logger.error(f"Failed to get assessment results: {e}")
            raise InstructorAssessmentServiceError(f"Failed to get assessment results: {e}")

    def get_student_detail(self, assessment_id: str, student_id: str) -> Dict[str, Any]:
        """Return per-question detailed results for one student (instructor view)."""
        try:
            return self.results_aggregator.get_student_detail(assessment_id, student_id)
        except Exception as e:
            logger.error(f"Failed to get student detail: {e}")
            raise InstructorAssessmentServiceError(f"Failed to get student detail: {e}")

    def override_question_score(
        self,
        assessment_id: str,
        student_id: str,
        question_id: str,
        score: int,
        comment: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Write instructor score override to the EVALUATION# item."""
        try:
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
            sk = f"EVALUATION#{question_id}"
            update_expr = "SET instructorScore = :s, updatedAt = :ua"
            expr_vals: Dict[str, Any] = {":s": score, ":ua": datetime.now(timezone.utc).isoformat()}
            if comment is not None:
                update_expr += ", instructorComment = :c"
                expr_vals[":c"] = comment
            self.table.update_item(
                Key={"PK": pk, "SK": sk},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_vals,
            )
            logger.info("Score override: %s/%s/Q%s → %d", assessment_id, student_id, question_id, score)
            return {
                "assessmentId": assessment_id,
                "studentId": student_id,
                "questionId": question_id,
                "instructorScore": score,
                "comment": comment,
            }
        except Exception as e:
            logger.error(f"Failed to override score: {e}")
            raise InstructorAssessmentServiceError(f"Failed to override score: {e}")

    def release_results(self, assessment_id: str) -> Dict[str, Any]:
        """Set resultsReleased=True on the assessment metadata item."""
        try:
            self.table.update_item(
                Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"},
                UpdateExpression="SET resultsReleased = :r, updatedAt = :ua",
                ExpressionAttributeValues={
                    ":r": True,
                    ":ua": datetime.now(timezone.utc).isoformat(),
                },
            )
            logger.info("Released results for assessment %s", assessment_id)
            return {"assessmentId": assessment_id, "resultsReleased": True}
        except Exception as e:
            logger.error(f"Failed to release results: {e}")
            raise InstructorAssessmentServiceError(f"Failed to release results: {e}")

    def send_reminder_email(self, assessment_id: str, student_id: str) -> str:
        """Send a reminder email to a student via SES. Returns a status message."""
        try:
            # Fetch student enrollment for email/name
            resp = self.table.get_item(
                Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": f"STUDENT#{student_id}"}
            )
            enrollment = resp.get("Item")
            if not enrollment:
                raise InstructorAssessmentServiceError(
                    f"Student {student_id} not enrolled in assessment {assessment_id}"
                )
            student_email = enrollment.get("email", "")
            student_name = enrollment.get("name", student_id)

            # Fetch assessment title
            a_resp = self.table.get_item(
                Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"}
            )
            assessment = a_resp.get("Item", {})
            title = assessment.get("title", "your assessment")

            from_email = (
                os.getenv("INVITE_FROM_EMAIL")
                or os.getenv("AUTH_PASSWORD_RESET_FROM_EMAIL", "")
            )
            ses_region = os.getenv("AUTH_PASSWORD_RESET_SES_REGION", "") or os.getenv("AWS_DEFAULT_REGION", "us-east-1")

            if not from_email or not student_email:
                logger.warning(
                    "Reminder skipped for %s: from_email=%r student_email=%r",
                    student_id, from_email, student_email,
                )
                return f"Reminder not sent (email not configured or student has no email)"

            import boto3 as _boto3
            ses = _boto3.client("ses", region_name=ses_region)
            ses.send_email(
                Source=from_email,
                Destination={"ToAddresses": [student_email]},
                Message={
                    "Subject": {"Data": f"Reminder: Please complete {title}"},
                    "Body": {
                        "Text": {
                            "Data": (
                                f"Hi {student_name},\n\n"
                                f"This is a reminder that you have an outstanding assessment: {title}.\n\n"
                                "Please log in and complete it as soon as possible.\n\n"
                                "Best regards,\nYour Instructor"
                            )
                        }
                    },
                },
            )
            logger.info("Sent reminder to %s (%s)", student_id, student_email)
            return f"Reminder sent to {student_email}"
        except InstructorAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to send reminder: {e}")
            raise InstructorAssessmentServiceError(f"Failed to send reminder: {e}")

    # ── EPIC-3-3: Question Preview and Editing ────────────────────────

    def list_student_questions(self, assessment_id: str, student_id: str) -> List[Dict[str, Any]]:
        """Return all generated questions for a student, sorted by questionNumber."""
        try:
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
            resp = self.table.query(
                KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("QUESTION#")
            )
            items = self._convert_decimals(resp.get("Items", []))
            items.sort(key=lambda x: x.get("questionNumber", 0))
            return items
        except Exception as e:
            logger.error("Failed to list questions for %s/%s: %s", assessment_id, student_id, e)
            raise InstructorAssessmentServiceError(f"Failed to list questions: {e}")

    def update_student_question(
        self,
        assessment_id: str,
        student_id: str,
        question_id: str,
        text: str,
        time_limit: Optional[int],
    ) -> Dict[str, Any]:
        """Edit the text (and optionally time limit) of a student question. Locked once assessment is open."""
        try:
            assessment = self.catalog.get_assessment(assessment_id)
            if not assessment:
                raise InstructorAssessmentServiceError(f"Assessment {assessment_id} not found")
            if assessment.get("status") not in ("draft", "scheduled"):
                raise InstructorAssessmentServiceError(
                    "Questions can only be edited while the assessment is in draft or scheduled status"
                )
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
            sk = f"QUESTION#{question_id}"
            existing = self.table.get_item(Key={"PK": pk, "SK": sk}).get("Item")
            if not existing:
                raise InstructorAssessmentServiceError(f"Question {question_id} not found")

            update_expr = "SET #t = :t, updatedAt = :ua"
            expr_names = {"#t": "text"}
            expr_vals: Dict[str, Any] = {":t": text, ":ua": datetime.now(timezone.utc).isoformat()}
            if time_limit is not None:
                update_expr += ", timeLimit = :tl"
                # time_limit arrives in minutes from UpdateStudentQuestionRequest; store as seconds.
                expr_vals[":tl"] = time_limit * 60
            else:
                update_expr += " REMOVE timeLimit"

            self.table.update_item(
                Key={"PK": pk, "SK": sk},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_vals,
            )
            updated = self.table.get_item(Key={"PK": pk, "SK": sk}).get("Item", {})
            logger.info("Updated question %s for %s/%s", question_id, assessment_id, student_id)
            return self._convert_decimals(updated)
        except InstructorAssessmentServiceError:
            raise
        except Exception as e:
            logger.error("Failed to update question %s: %s", question_id, e)
            raise InstructorAssessmentServiceError(f"Failed to update question: {e}")

    def delete_student_question(
        self,
        assessment_id: str,
        student_id: str,
        question_id: str,
    ) -> str:
        """Delete a student question. At least one question must remain. Locked once assessment is open."""
        try:
            assessment = self.catalog.get_assessment(assessment_id)
            if not assessment:
                raise InstructorAssessmentServiceError(f"Assessment {assessment_id} not found")
            if assessment.get("status") not in ("draft", "scheduled"):
                raise InstructorAssessmentServiceError(
                    "Questions can only be deleted while the assessment is in draft or scheduled status"
                )
            existing_questions = self.list_student_questions(assessment_id, student_id)
            if len(existing_questions) <= 1:
                raise InstructorAssessmentServiceError("Cannot delete the last question for a student")

            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
            sk = f"QUESTION#{question_id}"
            item = self.table.get_item(Key={"PK": pk, "SK": sk}).get("Item")
            if not item:
                raise InstructorAssessmentServiceError(f"Question {question_id} not found")

            self.table.delete_item(Key={"PK": pk, "SK": sk})
            logger.info("Deleted question %s for %s/%s", question_id, assessment_id, student_id)
            return question_id
        except InstructorAssessmentServiceError:
            raise
        except Exception as e:
            logger.error("Failed to delete question %s: %s", question_id, e)
            raise InstructorAssessmentServiceError(f"Failed to delete question: {e}")

    def add_student_question(
        self,
        assessment_id: str,
        student_id: str,
        text: str,
        question_type: str = "manual",
        difficulty: str = "medium",
        topic: str = "general",
        time_limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Manually add a question for a specific student. Locked once assessment is open."""
        try:
            assessment = self.catalog.get_assessment(assessment_id)
            if not assessment:
                raise InstructorAssessmentServiceError(f"Assessment {assessment_id} not found")
            if assessment.get("status") not in ("draft", "scheduled"):
                raise InstructorAssessmentServiceError(
                    "Questions can only be added while the assessment is in draft or scheduled status"
                )
            existing = self.list_student_questions(assessment_id, student_id)
            next_number = max((q.get("questionNumber", 0) for q in existing), default=0) + 1

            qid = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            item: Dict[str, Any] = {
                "PK": f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}",
                "SK": f"QUESTION#{qid}",
                "id": qid,
                "assessmentId": assessment_id,
                "studentId": student_id,
                "text": text,
                "questionNumber": next_number,
                "questionType": question_type,
                "difficulty": difficulty,
                "topic": topic,
                "createdAt": now,
            }
            if time_limit is not None:
                # time_limit arrives in minutes from AddStudentQuestionRequest; store as seconds.
                item["timeLimit"] = time_limit * 60
            self.table.put_item(Item=item)
            logger.info("Added question %s for %s/%s", qid, assessment_id, student_id)
            return self._convert_decimals(item)
        except InstructorAssessmentServiceError:
            raise
        except Exception as e:
            logger.error("Failed to add question: %s", e)
            raise InstructorAssessmentServiceError(f"Failed to add question: {e}")

    def update_status(self, assessment_id: str, new_status: str) -> Dict[str, Any]:
        """
        Transition assessment status.
        Valid transitions: draft → open, open → closed.
        """
        if new_status not in ("open", "closed"):
            raise InstructorAssessmentServiceError("status must be 'open' or 'closed'")

        current = self.get_assessment(assessment_id)
        current_status = current.get("status", "draft")

        allowed: Dict[str, List[str]] = {
            "draft": ["open"],
            "open": ["closed"],
        }
        if new_status not in allowed.get(current_status, []):
            raise InstructorAssessmentServiceError(
                f"Cannot transition from '{current_status}' to '{new_status}'"
            )

        updated_at = datetime.now(timezone.utc).isoformat()
        self.table.update_item(
            Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"},
            UpdateExpression="SET #s = :s, updatedAt = :ua",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": new_status, ":ua": updated_at},
        )
        logger.info("Assessment %s status: %s → %s", assessment_id, current_status, new_status)
        return self.get_assessment(assessment_id)

    def count_submitted_students(self, assessment_id: str) -> tuple:
        """
        Return (submitted_count, total_enrolled_count) for an assessment.
        Queries ASSESSMENT#{id} / STUDENT#* items and counts those with status='submitted'.
        """
        from boto3.dynamodb.conditions import Key
        try:
            response = self.table.query(
                KeyConditionExpression=Key("PK").eq(f"ASSESSMENT#{assessment_id}") & Key("SK").begins_with("STUDENT#"),
            )
            items = response.get("Items", [])
            total = len(items)
            submitted = sum(1 for item in items if item.get("status") == "submitted")
            return submitted, total
        except Exception as e:
            logger.error(f"Failed to count submitted students for {assessment_id}: {e}")
            raise InstructorAssessmentServiceError(f"Failed to count submitted students: {e}")
