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
from datetime import datetime
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

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
        time_limit: Optional[int] = None
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
        
        Returns:
            Created assessment data
        """
        try:
            assessment_id = str(uuid.uuid4())
            created_at = datetime.utcnow().isoformat()
            
            assessment = {
                'PK': f"ASSESSMENT#{assessment_id}",
                'SK': 'METADATA',
                'GSI1PK': 'ASSESSMENT',
                'GSI1SK': created_at,
                'id': assessment_id,
                'title': title,
                'course': course,
                'description': description,
                'dueDate': due_date,
                'totalQuestions': total_questions,
                'timeLimit': time_limit,
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
    
    def list_assessments(self) -> List[Dict[str, Any]]:
        """
        List all assessments.
        
        Returns:
            List of assessments ordered by creation date (newest first)
        """
        try:
            response = self.table.query(
                IndexName='GSI1',
                KeyConditionExpression=Key('GSI1PK').eq('ASSESSMENT'),
                ScanIndexForward=False  # Descending order (newest first)
            )
            
            assessments = []
            for item in response.get('Items', []):
                assessment = {
                    'id': item['id'],
                    'title': item['title'],
                    'course': item['course'],
                    'description': item.get('description', ''),
                    'dueDate': item['dueDate'],
                    'totalQuestions': int(item['totalQuestions']),
                    'timeLimit': int(item['timeLimit']) if item.get('timeLimit') else None,
                    'status': item.get('status', 'draft'),
                    'createdAt': item['createdAt'],
                    'updatedAt': item.get('updatedAt', item['createdAt'])
                }
                assessments.append(assessment)
            
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
            response = self.table.get_item(
                Key={
                    'PK': f"ASSESSMENT#{assessment_id}",
                    'SK': 'METADATA'
                }
            )
            
            if 'Item' not in response:
                raise InstructorAssessmentServiceError(f"Assessment {assessment_id} not found")
            
            item = response['Item']
            assessment = {
                'id': item['id'],
                'title': item['title'],
                'course': item['course'],
                'description': item.get('description', ''),
                'dueDate': item['dueDate'],
                'totalQuestions': int(item['totalQuestions']),
                'timeLimit': int(item['timeLimit']) if item.get('timeLimit') else None,
                'status': item.get('status', 'draft'),
                'createdAt': item['createdAt'],
                'updatedAt': item.get('updatedAt', item['createdAt'])
            }
            
            return assessment
            
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
            # Verify assessment exists
            self.get_assessment(assessment_id)
            
            # Batch write students
            enrolled_at = datetime.utcnow().isoformat()
            
            with self.table.batch_writer() as batch:
                for student in students:
                    batch.put_item(
                        Item={
                            'PK': f"ASSESSMENT#{assessment_id}",
                            'SK': f"STUDENT#{student['studentId']}",
                            'GSI1PK': f"STUDENT#{student['studentId']}",
                            'GSI1SK': f"ASSESSMENT#{assessment_id}",
                            'name': student['name'],
                            'email': student['email'],
                            'studentId': student['studentId'],
                            'code': student['code'],
                            'assignmentFile': student.get('assignmentFile', ''),
                            'status': 'enrolled',
                            'enrolledAt': enrolled_at
                        }
                    )
            
            logger.info(f"Uploaded {len(students)} students to assessment {assessment_id}")
            
            return {
                'ok': True,
                'assessmentId': assessment_id,
                'studentsUploaded': len(students)
            }
            
        except InstructorAssessmentServiceError:
            raise
        except Exception as e:
            logger.error(f"Failed to upload students: {e}")
            raise InstructorAssessmentServiceError(f"Failed to upload students: {e}")
    
    def get_assessment_students(self, assessment_id: str) -> List[Dict[str, Any]]:
        """
        Get all students enrolled in an assessment.
        
        Args:
            assessment_id: Assessment identifier
        
        Returns:
            List of enrolled students
        """
        try:
            response = self.table.query(
                KeyConditionExpression=Key('PK').eq(f"ASSESSMENT#{assessment_id}") & 
                                      Key('SK').begins_with('STUDENT#')
            )
            
            students = []
            for item in response.get('Items', []):
                student = {
                    'studentId': item['studentId'],
                    'name': item['name'],
                    'email': item['email'],
                    'code': item['code'],
                    'assignmentFile': item.get('assignmentFile', ''),
                    'status': item.get('status', 'enrolled'),
                    'enrolledAt': item.get('enrolledAt', '')
                }
                students.append(student)
            
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
            # Get all students
            students = self.get_assessment_students(assessment_id)
            
            progress_list = []
            
            for student in students:
                student_id = student['studentId']
                pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
                
                # Get progress item
                progress_response = self.table.get_item(
                    Key={'PK': pk, 'SK': 'PROGRESS'}
                )
                
                if 'Item' in progress_response:
                    progress = progress_response['Item']
                    progress_data = {
                        'studentId': student_id,
                        'name': student['name'],
                        'email': student['email'],
                        'status': progress.get('status', 'not-started'),
                        'totalQuestions': int(progress.get('totalQuestions', 0)),
                        'answeredQuestions': int(progress.get('answeredQuestions', 0)),
                        'percentage': float(progress.get('percentage', 0)),
                        'startedAt': student.get('startedAt'),
                        'submittedAt': student.get('submittedAt')
                    }
                else:
                    # No progress yet
                    progress_data = {
                        'studentId': student_id,
                        'name': student['name'],
                        'email': student['email'],
                        'status': 'not-started',
                        'totalQuestions': 0,
                        'answeredQuestions': 0,
                        'percentage': 0,
                        'startedAt': None,
                        'submittedAt': None
                    }
                
                progress_list.append(progress_data)
            
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
            students = self.get_assessment_students(assessment_id)
            
            results_list = []
            
            for student in students:
                student_id = student['studentId']
                pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
                
                # Get all evaluations
                evaluations_response = self.table.query(
                    KeyConditionExpression=Key('PK').eq(pk) & Key('SK').begins_with('EVALUATION#')
                )
                
                evaluations = evaluations_response.get('Items', [])
                
                if not evaluations:
                    # No results yet
                    continue
                
                # Calculate totals
                total_score = 0
                max_score = 0
                
                for eval_item in evaluations:
                    score = int(eval_item.get('score', 0)) if eval_item.get('score') is not None else 0
                    q_max = int(eval_item.get('maxScore', 10)) if eval_item.get('maxScore') is not None else 10
                    total_score += score
                    max_score += q_max
                
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
                
                # Get submission time
                enrollment_response = self.table.get_item(
                    Key={
                        'PK': f"ASSESSMENT#{assessment_id}",
                        'SK': f"STUDENT#{student_id}"
                    }
                )
                
                enrollment = enrollment_response.get('Item', {})
                
                result = {
                    'studentId': student_id,
                    'name': student['name'],
                    'email': student['email'],
                    'totalScore': total_score,
                    'maxScore': max_score,
                    'percentage': percentage,
                    'grade': grade,
                    'completedAt': enrollment.get('submittedAt')
                }
                
                results_list.append(result)
            
            logger.info(f"Retrieved results for {len(results_list)} students")
            return results_list
            
        except Exception as e:
            logger.error(f"Failed to get assessment results: {e}")
            raise InstructorAssessmentServiceError(f"Failed to get assessment results: {e}")
