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
from datetime import datetime
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

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
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
            
            # Count total questions
            questions_response = self.table.query(
                KeyConditionExpression=Key('PK').eq(pk) & Key('SK').begins_with('QUESTION#')
            )
            total_questions = len(questions_response.get('Items', []))
            
            # Count answered questions
            answers_response = self.table.query(
                KeyConditionExpression=Key('PK').eq(pk) & Key('SK').begins_with('ANSWER#')
            )
            answered_questions = len(answers_response.get('Items', []))
            
            # Calculate percentage
            percentage = round((answered_questions / total_questions * 100), 1) if total_questions > 0 else 0
            
            # Determine status
            if answered_questions == 0:
                status = 'not-started'
            elif answered_questions < total_questions:
                status = 'in-progress'
            else:
                status = 'completed'
            
            # Update progress item
            self.table.put_item(
                Item={
                    'PK': pk,
                    'SK': 'PROGRESS',
                    'totalQuestions': total_questions,
                    'answeredQuestions': answered_questions,
                    'percentage': Decimal(str(percentage)),
                    'status': status,
                    'lastUpdated': datetime.utcnow().isoformat()
                }
            )
            
        except Exception as e:
            logger.warning(f"Failed to update progress: {e}")
    
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
            # First check if student is enrolled
            enrollment = self.table.get_item(
                Key={
                    'PK': f"STUDENT#{student_id}",
                    'SK': f"ASSESSMENT#{assessment_id}"
                }
            )
            
            if 'Item' not in enrollment:
                raise OralAssessmentServiceError(
                    f"Student {student_id} not enrolled in assessment {assessment_id}"
                )
            
            # Query questions from assessment (questions are shared across students)
            response = self.table.query(
                KeyConditionExpression=Key('PK').eq(f"ASSESSMENT#{assessment_id}") & Key('SK').begins_with('QUESTION#')
            )
            
            items = response.get('Items', [])
            
            if not items:
                # No questions generated yet
                logger.warning(f"No questions found for assessment {assessment_id}")
                return []
            
            # Convert DynamoDB items to question format
            questions = []
            for item in items:
                question = {
                    'id': item.get('QuestionId', item['SK'].replace('QUESTION#', '')),
                    'questionNumber': item.get('QuestionNumber', 0),
                    'type': item.get('QuestionType', 'general'),
                    'text': item.get('QuestionText', ''),
                    'difficulty': item.get('Difficulty', 'medium'),
                    'topic': item.get('Topic', ''),
                    'codeContext': item.get('CodeContext'),
                    'lineReference': item.get('LineReference'),
                    'rationale': item.get('Rationale', ''),
                    'assessmentId': assessment_id,
                    'studentId': student_id,
                    'createdAt': item.get('CreatedAt', '')
                }
                questions.append(question)
            
            # Sort by question number
            questions.sort(key=lambda x: x.get('questionNumber', 999))
            
            logger.info(f"Retrieved {len(questions)} questions for student {student_id}")
            return self._convert_decimals(questions)
            
        except OralAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to get questions: {e}")
            raise OralAssessmentServiceError(f"Database error: {e}")
    
    def submit_answer(
        self,
        student_id: str,
        question_id: str,
        audio_url: str,
        duration: int,
        assessment_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record a student's audio answer submission.
        
        Args:
            student_id: Student identifier
            question_id: Question identifier
            audio_url: S3 URL of uploaded audio file
            duration: Recording duration in seconds
            assessment_id: Optional assessment ID for validation
        
        Returns:
            Confirmation with answer details
        
        Raises:
            OralAssessmentServiceError: If question not found
        """
        try:
            # First verify question exists
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id if assessment_id else '*'}"
            
            # If we don't have assessment_id, we need to find it
            if not assessment_id:
                # Query all questions for this student to find the one with matching question_id
                response = self.table.query(
                    KeyConditionExpression=Key('PK').begins_with(f"STUDENT#{student_id}#ASSESSMENT#") & 
                                          Key('SK').eq(f"QUESTION#{question_id}")
                )
                
                if not response.get('Items'):
                    raise OralAssessmentServiceError(
                        f"Question {question_id} not found for student {student_id}"
                    )
                
                # Extract assessment_id from PK
                item = response['Items'][0]
                pk = item['PK']
                assessment_id = pk.split('#')[3]  # PK format: STUDENT#id#ASSESSMENT#id
            
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
            
            # Store answer in DynamoDB
            submitted_at = datetime.utcnow().isoformat()
            
            self.table.put_item(
                Item={
                    'PK': pk,
                    'SK': f"ANSWER#{question_id}",
                    'audioUrl': audio_url,
                    'duration': duration,
                    'submittedAt': submitted_at,
                    'status': 'submitted'
                }
            )
            
            # Update progress
            self._update_progress(student_id, assessment_id)
            
            logger.info(f"Recorded answer for question {question_id} from student {student_id}")
            
            return {
                "ok": True,
                "studentId": student_id,
                "questionId": question_id,
                "audioUrl": audio_url,
                "duration": duration,
                "submittedAt": submitted_at,
                "assessmentId": assessment_id
            }
            
        except OralAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to submit answer: {e}")
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
            submitted_at = datetime.utcnow().isoformat()
            
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
            # Get enrollment data
            enrollment_response = self.table.get_item(
                Key={
                    'PK': f"STUDENT#{student_id}",
                    'SK': f"ASSESSMENT#{assessment_id}"
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
            status = enrollment.get('Status', 'not_started')
            
            # Get assessment metadata
            assessment_response = self.table.get_item(
                Key={
                    'PK': f"ASSESSMENT#{assessment_id}",
                    'SK': 'METADATA'
                }
            )
            
            assessment_title = assessment_response.get('Item', {}).get('Title', 'Unknown Assessment')
            
            progress = {
                "studentId": student_id,
                "studentName": enrollment.get('StudentName', ''),
                "studentEmail": enrollment.get('StudentEmail', ''),
                "assessmentId": assessment_id,
                "assessmentTitle": assessment_title,
                "status": status,
                "totalQuestions": total_questions,
                "answeredQuestions": answered_questions,
                "percentage": percentage,
                "startedAt": enrollment.get('StartedAt'),
                "submittedAt": enrollment.get('SubmittedAt')
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
            # Get enrollment data
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
            
            # Get assessment metadata
            assessment_response = self.table.get_item(
                Key={
                    'PK': f"ASSESSMENT#{assessment_id}",
                    'SK': 'METADATA'
                }
            )
            
            assessment = assessment_response.get('Item', {})
            
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
            
            # Get all questions
            questions_response = self.table.query(
                KeyConditionExpression=Key('PK').eq(pk) & Key('SK').begins_with('QUESTION#')
            )
            
            # Get all answers
            answers_response = self.table.query(
                KeyConditionExpression=Key('PK').eq(pk) & Key('SK').begins_with('ANSWER#')
            )
            
            # Get all evaluations
            evaluations_response = self.table.query(
                KeyConditionExpression=Key('PK').eq(pk) & Key('SK').begins_with('EVALUATION#')
            )
            
            # Build maps for quick lookup
            questions_map = {item['SK'].replace('QUESTION#', ''): item for item in questions_response.get('Items', [])}
            answers_map = {item['SK'].replace('ANSWER#', ''): item for item in answers_response.get('Items', [])}
            evaluations_map = {item['SK'].replace('EVALUATION#', ''): item for item in evaluations_response.get('Items', [])}
            
            if not evaluations_map:
                raise OralAssessmentServiceError(
                    f"Results not available yet for student {student_id}"
                )
            
            # Build complete question results
            question_results = []
            total_score = 0
            max_score = 0
            
            for question_id, question in questions_map.items():
                answer = answers_map.get(question_id, {})
                evaluation = evaluations_map.get(question_id, {})
                
                score = int(evaluation.get('score', 0)) if evaluation.get('score') is not None else None
                q_max_score = int(evaluation.get('maxScore', 10)) if evaluation.get('maxScore') is not None else 10
                
                if score is not None:
                    total_score += score
                    max_score += q_max_score
                
                question_results.append({
                    "questionId": question_id,
                    "questionText": question.get('text', ''),
                    "audioUrl": answer.get('audioUrl'),
                    "duration": int(answer.get('duration', 0)) if answer.get('duration') else None,
                    "score": score,
                    "maxScore": q_max_score,
                    "feedback": evaluation.get('feedback'),
                    "strengths": evaluation.get('strengths'),
                    "improvements": evaluation.get('improvements'),
                    "evaluatedAt": evaluation.get('evaluatedAt')
                })
            
            percentage = round((total_score / max_score * 100), 1) if max_score > 0 else 0
            
            # Determine grade
            if percentage >= 90:
                grade = "Excellent"
            elif percentage >= 75:
                grade = "Competent"
            elif percentage >= 60:
                grade = "Developing"
            else:
                grade = "Unsatisfactory"
            
            results = {
                "studentId": student_id,
                "studentName": enrollment.get('name', ''),
                "studentEmail": enrollment.get('email', ''),
                "assessmentId": assessment_id,
                "assessmentTitle": assessment.get('title', 'Unknown Assessment'),
                "status": enrollment.get('status', 'unknown'),
                "totalScore": total_score,
                "maxScore": max_score,
                "percentage": percentage,
                "grade": grade,
                "submittedAt": enrollment.get('submittedAt'),
                "evaluatedQuestions": len(evaluations_map),
                "totalQuestions": len(questions_map),
                "questions": question_results
            }
            
            logger.info(f"Retrieved results for student {student_id}: {percentage}% ({grade})")
            return self._convert_decimals(results)
            
        except OralAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to get results: {e}")
            raise OralAssessmentServiceError(f"Database error: {e}")
