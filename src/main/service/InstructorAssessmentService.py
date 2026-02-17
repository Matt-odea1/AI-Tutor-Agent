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
                'createdBy': owner_user_id,
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
