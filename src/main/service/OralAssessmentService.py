"""
OralAssessmentService - Manages student assessment operations

Handles:
- Fetching questions for students
- Recording audio answer submissions
- Tracking student progress
- Retrieving evaluation results
- Marking assessments as complete

Uses DynamoDB for data storage and S3 for file storage.
"""

from __future__ import annotations
import logging
import os
import json
import boto3
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from src.main.service.OralAssessmentProgressTracker import OralAssessmentProgressTracker
from src.main.service.OralAssessmentQuestionAccess import OralAssessmentQuestionAccess
from src.main.service.OralAssessmentAnswerSubmission import OralAssessmentAnswerSubmission
from src.main.service.OralAssessmentResultsAggregator import OralAssessmentResultsAggregator

logger = logging.getLogger(__name__)


class OralAssessmentServiceError(Exception):
    """Custom exception for assessment service errors"""
    pass


class DecimalEncoder(json.JSONEncoder):
    """Helper to convert Decimal to int/float for JSON serialization"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)


class OralAssessmentService:
    """Service for managing oral assessment student operations"""
    
    def __init__(self):
        """Initialize service with DynamoDB and S3 connections"""
        self.region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
        self.table_name = os.getenv("DYNAMODB_ASSESSMENT_TABLE", "oral_assessments")
        self.s3_bucket = os.getenv("S3_ASSESSMENT_BUCKET", "c9-oral-assessments")
        
        try:
            # Initialize DynamoDB
            self.dynamodb = boto3.resource('dynamodb', region_name=self.region)
            self.table = self.dynamodb.Table(self.table_name)
            
            # Initialize S3
            self.s3 = boto3.client('s3', region_name=self.region)
            self.progress_tracker = OralAssessmentProgressTracker(table=self.table)
            self.question_access = OralAssessmentQuestionAccess(table=self.table)
            self.answer_submission = OralAssessmentAnswerSubmission(
                table=self.table,
                progress_updater=self._update_progress,
            )
            self.results_aggregator = OralAssessmentResultsAggregator(table=self.table)
            
            logger.info(f"Connected to DynamoDB table: {self.table_name}")
            logger.info(f"Using S3 bucket: {self.s3_bucket}")
        except Exception as e:
            raise OralAssessmentServiceError(f"Failed to connect to AWS: {e}")
    
    def _convert_decimals(self, obj: Any) -> Any:
        """Recursively convert Decimal objects to int/float"""
        if isinstance(obj, list):
            return [self._convert_decimals(i) for i in obj]
        elif isinstance(obj, dict):
            return {k: self._convert_decimals(v) for k, v in obj.items()}
        elif isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return obj
    
    def _update_progress(self, student_id: str, assessment_id: str):
        """Update progress summary for a student"""
        try:
            self.progress_tracker.update_progress(student_id, assessment_id)
        except Exception as e:
            logger.warning(f"Failed to update progress: {e}")
    
    def _check_assessment_window(self, assessment_id: str) -> None:
        """
        Raise OralAssessmentServiceError if the assessment is in scheduled mode
        and the current time is outside the configured window.
        """
        try:
            response = self.table.get_item(
                Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"}
            )
            item = response.get("Item")
            if not item:
                raise OralAssessmentServiceError(f"Assessment {assessment_id} not found")

            if item.get("accessMode", "open") != "scheduled":
                return  # open access — no check needed

            window_start = item.get("scheduledWindowStart")
            window_end = item.get("scheduledWindowEnd")

            if not window_start or not window_end:
                return  # scheduled mode but no window set — fail open

            now = datetime.now(timezone.utc)

            def _parse(dt_str):
                parsed = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

            start = _parse(window_start)
            end = _parse(window_end)

            if now < start:
                raise OralAssessmentServiceError(
                    f"Assessment has not started yet. Opens at {window_start}"
                )
            if now > end:
                raise OralAssessmentServiceError(
                    f"Assessment window has closed at {window_end}"
                )
        except OralAssessmentServiceError:
            raise
        except Exception as e:
            logger.warning(f"Window check failed for assessment {assessment_id}: {e}")
            # Fail open — don't block students if the check itself errors

    def get_student_questions(
        self,
        student_id: str,
        assessment_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all questions for a specific student and assessment.
        
        First checks DynamoDB for question metadata, then fetches full details from S3.
        
        Args:
            student_id: Student identifier
            assessment_id: Assessment identifier
        
        Returns:
            List of questions with metadata
        
        Raises:
            OralAssessmentServiceError: If student or assessment not found
        """
        try:
            self.question_access.ensure_student_enrollment(student_id, assessment_id)
            self._check_assessment_window(assessment_id)

            # Fetch assessment metadata to get time limit for question view
            meta_resp = self.table.get_item(
                Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"}
            )
            assessment_meta = meta_resp.get("Item", {})
            raw_time_limit = int(assessment_meta.get("timeLimit", 0)) or None
            assessment_time_limit = (raw_time_limit * 60) if raw_time_limit is not None else None

            student_items = self.question_access.get_student_questions(student_id, assessment_id)
            bank_items = self.question_access.get_bank_questions(assessment_id)

            if not student_items and not bank_items:
                logger.warning(f"No questions found for assessment {assessment_id}")
                return {"questions": [], "currentQuestionIndex": 0,
                        "answerMode": assessment_meta.get("answerMode", "oral"),
                        "preparationTime": assessment_meta.get("preparationTime"),
                        "assessmentTitle": assessment_meta.get("title"),
                        "assessmentCourse": assessment_meta.get("course"),
                        "assessmentDescription": assessment_meta.get("description")}

            # Build the full ordered question list (always same sort)
            all_questions = self.question_access.to_student_question_view(
                student_items,
                bank_items,
                student_id=student_id,
                assessment_id=assessment_id,
                assessment_time_limit=assessment_time_limit,
            )
            question_ids = [q["id"] for q in all_questions]

            # Read enrollment to get/set questionOrder and currentQuestionIdx
            enrollment_key = {"PK": f"ASSESSMENT#{assessment_id}", "SK": f"STUDENT#{student_id}"}
            enrollment_resp = self.table.get_item(Key=enrollment_key)
            enrollment = enrollment_resp.get("Item", {})

            # First access: freeze question order and record startedAt
            if "questionOrder" not in enrollment:
                # Count existing answers for legacy students who started before this deploy
                answers_resp = self.table.query(
                    KeyConditionExpression=Key("PK").eq(f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}")
                        & Key("SK").begins_with("ANSWER#"),
                    Select="COUNT",
                )
                existing_answers = answers_resp.get("Count", 0)
                try:
                    self.table.update_item(
                        Key=enrollment_key,
                        UpdateExpression="SET questionOrder = :qo, currentQuestionIdx = :ci, startedAt = if_not_exists(startedAt, :t)",
                        ConditionExpression="attribute_not_exists(questionOrder)",
                        ExpressionAttributeValues={
                            ":qo": question_ids,
                            ":ci": existing_answers,
                            ":t": datetime.now(timezone.utc).isoformat(),
                        },
                    )
                    current_idx = existing_answers
                except self.table.meta.client.exceptions.ConditionalCheckFailedException:
                    # Race: another request set it first — re-read
                    enrollment = self.table.get_item(Key=enrollment_key).get("Item", {})
                    current_idx = int(enrollment.get("currentQuestionIdx", 0))
            else:
                current_idx = int(enrollment.get("currentQuestionIdx", 0))

            # Gate: only return full content for answered + current question
            gated_questions = self.question_access.gate_question_content(all_questions, current_idx)

            logger.info(f"Retrieved {len(gated_questions)} questions for student {student_id} (current={current_idx})")
            return {
                "questions": self._convert_decimals(gated_questions),
                "currentQuestionIndex": current_idx,
                "answerMode": assessment_meta.get("answerMode", "oral"),
                "preparationTime": assessment_meta.get("preparationTime"),
                "assessmentTitle": assessment_meta.get("title"),
                "assessmentCourse": assessment_meta.get("course"),
                "assessmentDescription": assessment_meta.get("description"),
            }
            
        except ValueError as e:
            raise OralAssessmentServiceError(str(e))
        except OralAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to get questions: {e}")
            raise OralAssessmentServiceError(f"Database error: {e}")
    
    def _validate_and_advance_question(self, student_id: str, assessment_id: str, question_id: str) -> None:
        """Enforce sequential ordering: reject duplicates, out-of-order, and advance the index."""
        enrollment_key = {"PK": f"ASSESSMENT#{assessment_id}", "SK": f"STUDENT#{student_id}"}
        enrollment = self.table.get_item(Key=enrollment_key).get("Item")
        if not enrollment:
            raise OralAssessmentServiceError("Student not enrolled in this assessment")

        question_order = enrollment.get("questionOrder", [])
        current_idx = int(enrollment.get("currentQuestionIdx", 0))

        # Reject duplicate submission
        existing = self.table.get_item(
            Key={"PK": f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}", "SK": f"ANSWER#{question_id}"}
        )
        if "Item" in existing:
            raise OralAssessmentServiceError("Answer already submitted for this question")

        # Reject out-of-order submission
        if current_idx >= len(question_order) or question_order[current_idx] != question_id:
            raise OralAssessmentServiceError("Question submitted out of order")

        # Advance index (conditional to prevent double-click race)
        try:
            self.table.update_item(
                Key=enrollment_key,
                UpdateExpression="SET currentQuestionIdx = :new_idx",
                ConditionExpression="currentQuestionIdx = :old_idx",
                ExpressionAttributeValues={":new_idx": current_idx + 1, ":old_idx": current_idx},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException:
            raise OralAssessmentServiceError("Answer already submitted for this question")

    def submit_answer(
        self,
        student_id: str,
        question_id: str,
        assessment_id: str,
        answer_type: str = "audio",
        audio_url: Optional[str] = None,
        duration: Optional[int] = None,
        text_content: Optional[str] = None,
        video_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Record a student's answer submission (audio, text, or video).

        Args:
            student_id: Student identifier
            question_id: Question identifier
            assessment_id: Assessment identifier (used for window check and DynamoDB key)
            answer_type: 'audio', 'text', or 'video'
            audio_url: S3 URL of audio file (audio answers)
            duration: Recording duration in seconds (audio/video answers)
            text_content: Written answer text (text answers)
            video_url: S3 URL of video file (video answers)

        Returns:
            Confirmation with answer details

        Raises:
            OralAssessmentServiceError: If assessment window is closed or DB error
        """
        try:
            self._check_assessment_window(assessment_id)
            self._validate_and_advance_question(student_id, assessment_id, question_id)
            result = self.answer_submission.submit_answer(
                student_id=student_id,
                question_id=question_id,
                assessment_id=assessment_id,
                answer_type=answer_type,
                audio_url=audio_url,
                duration=duration,
                text_content=text_content,
                video_url=video_url,
            )
            logger.info(f"Recorded answer for question {question_id} from student {student_id}")
            return result
        except ValueError as e:
            raise OralAssessmentServiceError(str(e))
        except OralAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to submit answer: {e}")
            raise OralAssessmentServiceError(f"Database error: {e}")

    def submit_proctor_chunk(
        self,
        student_id: str,
        assessment_id: str,
        chunk_url: str,
        chunk_index: int,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Store a proctoring chunk manifest entry in DynamoDB."""
        try:
            result = self.answer_submission.submit_proctor_chunk(
                student_id=student_id,
                assessment_id=assessment_id,
                chunk_url=chunk_url,
                chunk_index=chunk_index,
                timestamp=timestamp,
            )
            return result
        except Exception as e:
            logger.error(f"Failed to store proctor chunk: {e}")
            raise OralAssessmentServiceError(f"Database error: {e}")
    
    def submit_assessment(
        self,
        student_id: str,
        assessment_id: str
    ) -> Dict[str, Any]:
        """
        Mark an assessment as completed/submitted by student.
        
        Args:
            student_id: Student identifier
            assessment_id: Assessment identifier
        
        Returns:
            Confirmation with submission details
        
        Raises:
            OralAssessmentServiceError: If not all questions answered
        """
        try:
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"

            # Check due date before accepting final submission
            try:
                meta = self.table.get_item(
                    Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"}
                ).get("Item", {})
                due_date_str = meta.get("dueDate")
                if due_date_str:
                    due = datetime.fromisoformat(due_date_str.replace("Z", "+00:00"))
                    if not due.tzinfo:
                        due = due.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) > due:
                        raise OralAssessmentServiceError(
                            f"Assessment submission deadline has passed ({due_date_str})"
                        )
            except OralAssessmentServiceError:
                raise
            except Exception:
                pass  # Fail open if date parsing fails

            # Get progress to check completion
            progress_response = self.table.get_item(
                Key={'PK': pk, 'SK': 'PROGRESS'}
            )
            
            if 'Item' not in progress_response:
                raise OralAssessmentServiceError(
                    f"No progress found for student {student_id} in assessment {assessment_id}"
                )
            
            progress = progress_response['Item']
            total = int(progress.get('totalQuestions', 0))
            answered = int(progress.get('answeredQuestions', 0))
            
            if answered < total:
                raise OralAssessmentServiceError(
                    f"Cannot submit: only {answered}/{total} questions answered"
                )
            
            # Update enrollment status
            submitted_at = datetime.now(timezone.utc).isoformat()
            
            enrollment_response = self.table.get_item(
                Key={
                    'PK': f"ASSESSMENT#{assessment_id}",
                    'SK': f"STUDENT#{student_id}"
                }
            )
            
            if 'Item' not in enrollment_response:
                raise OralAssessmentServiceError(
                    f"Student {student_id} not enrolled in assessment {assessment_id}"
                )
            
            # Update status
            self.table.update_item(
                Key={
                    'PK': f"ASSESSMENT#{assessment_id}",
                    'SK': f"STUDENT#{student_id}"
                },
                UpdateExpression='SET #status = :status, submittedAt = :submitted, completedAt = :completed',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'submitted',
                    ':submitted': submitted_at,
                    ':completed': submitted_at
                }
            )
            
            # Get assessment title
            assessment_response = self.table.get_item(
                Key={
                    'PK': f"ASSESSMENT#{assessment_id}",
                    'SK': 'METADATA'
                }
            )
            
            assessment_title = assessment_response.get('Item', {}).get('title', 'Unknown')
            
            logger.info(f"Student {student_id} submitted assessment {assessment_id}")
            
            return {
                "ok": True,
                "studentId": student_id,
                "assessmentId": assessment_id,
                "status": "submitted",
                "submittedAt": submitted_at,
                "assessmentTitle": assessment_title,
                "questionsAnswered": answered,
                "totalQuestions": total
            }
            
        except OralAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to submit assessment: {e}")
            raise OralAssessmentServiceError(f"Database error: {e}")
    
    def get_student_progress(
        self,
        student_id: str,
        assessment_id: str
    ) -> Dict[str, Any]:
        """
        Get current progress for a student in an assessment.
        
        Args:
            student_id: Student identifier
            assessment_id: Assessment identifier
        
        Returns:
            Progress data including answered/total questions, status, timestamps
        
        Raises:
            OralAssessmentServiceError: If student or assessment not found
        """
        try:
            # Get enrollment data from primary record (has name, email, timestamps)
            enrollment_response = self.table.get_item(
                Key={
                    'PK': f"ASSESSMENT#{assessment_id}",
                    'SK': f"STUDENT#{student_id}"
                }
            )

            if 'Item' not in enrollment_response:
                raise OralAssessmentServiceError(
                    f"Student {student_id} not enrolled in assessment {assessment_id}"
                )

            enrollment = enrollment_response['Item']

            # Count total questions for this assessment
            questions_response = self.table.query(
                KeyConditionExpression=Key('PK').eq(f"ASSESSMENT#{assessment_id}") & Key('SK').begins_with('QUESTION#')
            )
            total_questions = len(questions_response.get('Items', []))

            # Count answered questions - query student answers
            answers_response = self.table.query(
                KeyConditionExpression=Key('PK').eq(f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}") & Key('SK').begins_with('ANSWER#')
            )
            answered_questions = len(answers_response.get('Items', []))

            # Calculate progress
            percentage = round((answered_questions / total_questions * 100), 1) if total_questions > 0 else 0

            # Determine status from enrollment
            status = enrollment.get('status', 'not_started')

            # Get assessment metadata
            assessment_response = self.table.get_item(
                Key={
                    'PK': f"ASSESSMENT#{assessment_id}",
                    'SK': 'METADATA'
                }
            )

            assessment_title = assessment_response.get('Item', {}).get('title', 'Unknown Assessment')

            progress = {
                "studentId": student_id,
                "studentName": enrollment.get('name', ''),
                "studentEmail": enrollment.get('email', ''),
                "assessmentId": assessment_id,
                "assessmentTitle": assessment_title,
                "status": status,
                "totalQuestions": total_questions,
                "answeredQuestions": answered_questions,
                "percentage": percentage,
                "startedAt": enrollment.get('startedAt'),
                "submittedAt": enrollment.get('submittedAt')
            }
            
            logger.info(f"Retrieved progress for student {student_id}: {answered_questions}/{total_questions} answered")
            return self._convert_decimals(progress)
            
        except OralAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to get progress: {e}")
            raise OralAssessmentServiceError(f"Database error: {e}")
    
    def get_student_results(
        self,
        student_id: str,
        assessment_id: str
    ) -> Dict[str, Any]:
        """
        Get evaluation results for a student's completed assessment.
        
        Args:
            student_id: Student identifier
            assessment_id: Assessment identifier
        
        Returns:
            Complete results including scores, feedback, and evaluation details
        
        Raises:
            OralAssessmentServiceError: If results not available yet
        """
        try:
            results = self.results_aggregator.get_student_results(
                student_id=student_id,
                assessment_id=assessment_id,
            )
            logger.info(
                f"Retrieved results for student {student_id}: "
                f"{results.get('percentage', 0)}% ({results.get('grade', 'unknown')})"
            )
            return self._convert_decimals(results)

        except ValueError as e:
            raise OralAssessmentServiceError(str(e))
        except OralAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to get results: {e}")
            raise OralAssessmentServiceError(f"Database error: {e}")
