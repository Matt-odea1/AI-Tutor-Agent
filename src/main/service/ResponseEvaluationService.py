"""
ResponseEvaluationService: Evaluates student responses to programming questions.
- Loads student response CSV
- Evaluates each response using AI
- Generates detailed reports and scores
- Supports async job processing
"""
import csv
import threading
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime

from src.main.service.EvaluationReportWriter import EvaluationReportWriter
from src.main.service.ResponseEvaluationEngine import ResponseEvaluationEngine, ResponseEvaluationEngineError
from src.main.service.EvaluationJobStore import EvaluationJobStore
from src.main.service.ResponseEvaluationRepository import ResponseEvaluationRepository
from src.main.service.EvaluationWorkflowRunner import EvaluationWorkflowRunner
from src.main.llm.AgentCoreProvider import AgentCoreProvider
from src.main.utils.ReadPrompt import read_prompt


class ResponseEvaluationError(Exception):
    """Raised when evaluation fails."""
    pass


class ResponseEvaluationService:
    def __init__(
        self,
        agent_client: Optional[AgentCoreProvider] = None,
        repository: Optional[ResponseEvaluationRepository] = None,
        base_output_dir: str = "test_outputs/evaluations",
        responses_dir: str = "test_outputs/questions",
        transcription_service=None,
    ):
        self.agent_client = agent_client or AgentCoreProvider()
        self.repository = repository or ResponseEvaluationRepository()
        self.base_output_dir = Path(base_output_dir)
        self.base_output_dir.mkdir(parents=True, exist_ok=True)
        self.responses_dir = Path(responses_dir)

        # In-memory job store
        self.job_store = EvaluationJobStore()
        self.jobs = self.job_store.jobs
        self.report_writer = EvaluationReportWriter()

        # Load evaluation prompt
        prompt_file = Path(__file__).resolve().parents[3] / "prompts" / "response_evaluation_prompt.md"
        self.evaluation_prompt = read_prompt(prompt_file)
        self.engine = ResponseEvaluationEngine(agent_client=self.agent_client, evaluation_prompt=self.evaluation_prompt)
        self.workflow_runner = EvaluationWorkflowRunner(
            engine=self.engine,
            repository=self.repository,
            report_writer=self.report_writer,
            job_store=self.job_store,
            base_output_dir=self.base_output_dir,
            transcription_service=transcription_service,
        )

    def start_evaluation_from_dynamodb(
        self,
        student_id: str,
        assessment_id: str
    ) -> Dict[str, Any]:
        """
        Start async evaluation of student responses from DynamoDB.
        
        Args:
            student_id: Student identifier
            assessment_id: Assessment identifier
            
        Returns:
            Dictionary with job_id and initial status
        """
        # Count answers in DynamoDB
        try:
            total_questions = self._count_answers_in_dynamodb(student_id, assessment_id)
        except Exception as e:
            raise ResponseEvaluationError(f"Failed to read answers from DynamoDB: {e}")
        
        if total_questions == 0:
            raise ResponseEvaluationError(f"No answers found for student {student_id} in assessment {assessment_id}")
        
        # Generate job ID
        timestamp = int(datetime.now().timestamp())
        job_id = f"eval_{student_id}_{assessment_id}_{timestamp}"
        
        # Initialize job
        self.job_store.create_processing_job(
            job_id=job_id,
            payload={
                "student_id": student_id,
                "assessment_id": assessment_id,
            },
            total_questions=total_questions,
        )
        
        # Start background thread
        thread = threading.Thread(
            target=self._evaluate_from_dynamodb_async,
            args=(job_id, student_id, assessment_id)
        )
        thread.daemon = True
        thread.start()
        
        print(f"[ResponseEvaluationService] Started DynamoDB evaluation job: {job_id}")
        
        return {
            "job_id": job_id,
            "status": "processing",
            "student_id": student_id,
            "assessment_id": assessment_id,
            "total_questions": total_questions,
            "estimated_time_seconds": total_questions * 8
        }

    def start_evaluation(
        self,
        student_name: str,
        responses_file_name: str
    ) -> Dict[str, Any]:
        """
        Start async evaluation of student responses.
        
        Args:
            student_name: Student identifier
            responses_file_name: Name of CSV file in test_outputs/questions/
            
        Returns:
            Dictionary with job_id and initial status
        """
        # Build full path to responses file
        responses_path = self.responses_dir / responses_file_name
        
        if not responses_path.exists():
            raise ResponseEvaluationError(f"Responses file not found: {responses_path}")
        
        # Read CSV to get total questions
        total_questions = self._count_questions(responses_path)
        
        # Generate job ID
        timestamp = int(datetime.now().timestamp())
        job_id = f"eval_{student_name}_{timestamp}"
        
        # Initialize job
        self.job_store.create_processing_job(
            job_id=job_id,
            payload={"student_name": student_name},
            total_questions=total_questions,
        )
        
        # Start background thread
        thread = threading.Thread(
            target=self._evaluate_responses_async,
            args=(job_id, student_name, str(responses_path))
        )
        thread.daemon = True
        thread.start()
        
        print(f"[ResponseEvaluationService] Started evaluation job: {job_id}")
        
        return {
            "job_id": job_id,
            "status": "processing",
            "student_name": student_name,
            "total_questions": total_questions,
            "estimated_time_seconds": total_questions * 8  # ~8 seconds per question
        }

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get current status of evaluation job.
        
        Args:
            job_id: The job identifier
            
        Returns:
            Dictionary with job status and results
        """
        job = self.job_store.get(job_id)
        if not job:
            raise ResponseEvaluationError(f"Job not found: {job_id}")
        
        response = {
            "job_id": job_id,
            "status": job["status"],
            "message": self._get_status_message(job)
        }
        
        if job["status"] == "processing":
            response["progress"] = job["progress"]
        elif job["status"] == "completed":
            response["result"] = job["result"]
        elif job["status"] == "failed":
            response["error"] = job["error"]
        
        return response

    def _count_questions(self, csv_path: Path) -> int:
        """Count number of questions in CSV file."""
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            return sum(1 for _ in reader)

    def _count_answers_in_dynamodb(self, student_id: str, assessment_id: str) -> int:
        """Count number of answers in DynamoDB."""
        return self.repository.count_answers(student_id, assessment_id)

    def _evaluate_from_dynamodb_async(
        self,
        job_id: str,
        student_id: str,
        assessment_id: str
    ):
        """Background task that evaluates all questions from DynamoDB."""
        self.workflow_runner.evaluate_from_dynamodb(job_id, student_id, assessment_id)

    def _read_questions_from_dynamodb(self, student_id: str, assessment_id: str) -> List[Dict[str, Any]]:
        """Read questions from DynamoDB."""
        return self.repository.read_questions(student_id, assessment_id)

    def _read_answers_from_dynamodb(self, student_id: str, assessment_id: str) -> List[Dict[str, Any]]:
        """Read answers from DynamoDB."""
        return self.repository.read_answers(student_id, assessment_id)

    def _match_questions_and_answers(
        self,
        questions: List[Dict[str, Any]],
        answers: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Match questions with their answers."""
        return self.workflow_runner.match_questions_and_answers(questions, answers)

    def _evaluate_qa_pair(self, qa_pair: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluate a question-answer pair."""
        try:
            return self.engine.evaluate_qa_pair(qa_pair)
        except ResponseEvaluationEngineError as error:
            raise ResponseEvaluationError(str(error))

    def _store_evaluation_in_dynamodb(
        self,
        student_id: str,
        assessment_id: str,
        question_id: str,
        evaluation: Dict[str, Any]
    ):
        """Store evaluation result in DynamoDB."""
        self.repository.store_evaluation(student_id, assessment_id, question_id, evaluation)
        print(f"[ResponseEvaluationService] Stored evaluation for question {question_id}")

    def _evaluate_responses_async(
        self,
        job_id: str,
        student_name: str,
        responses_file_path: str
    ):
        """
        Background task that evaluates all questions.
        
        Args:
            job_id: Job identifier
            student_name: Student name
            responses_file_path: Path to responses CSV file
        """
        self.workflow_runner.evaluate_from_csv(job_id, student_name, responses_file_path)

    def _read_responses_csv(self, file_path: str) -> List[Dict[str, str]]:
        """Read student responses from CSV file."""
        return self.workflow_runner.read_responses_csv(file_path)

    def _evaluate_single_question(self, response_data: Dict[str, str]) -> Dict[str, Any]:
        """
        Evaluate a single question response.
        
        Args:
            response_data: Dictionary with question and response data
            
        Returns:
            Evaluation result dictionary
        """
        try:
            return self.engine.evaluate_single_question(response_data)
        except ResponseEvaluationEngineError as error:
            raise ResponseEvaluationError(str(error))

    def _build_evaluation_prompt(self, response_data: Dict[str, str]) -> str:
        """Build the evaluation prompt for a single question."""
        return self.engine.build_evaluation_prompt(response_data)

    def _parse_evaluation_response(self, response_text: str) -> Dict[str, Any]:
        """Parse JSON evaluation from LLM response."""
        try:
            return self.engine.parse_evaluation_response(response_text)
        except ResponseEvaluationEngineError as error:
            raise ResponseEvaluationError(str(error))

    def _calculate_grade(self, percentage: float) -> str:
        """Calculate letter grade from percentage."""
        return self.engine.calculate_grade(percentage)

    def _save_detailed_json(
        self,
        output_dir: Path,
        student_name: str,
        evaluations: List[Dict[str, Any]],
        responses: List[Dict[str, str]]
    ) -> Path:
        """Save detailed evaluation results as JSON."""
        return self.report_writer.save_detailed_json(output_dir, student_name, evaluations, responses)

    def _save_summary_csv(self, output_dir: Path, evaluations: List[Dict[str, Any]]) -> Path:
        """Save summary scores as CSV."""
        return self.report_writer.save_summary_csv(output_dir, evaluations)

    def _save_report(
        self,
        output_dir: Path,
        student_name: str,
        evaluations: List[Dict[str, Any]],
        total_score: float,
        max_score: float,
        percentage: float,
        grade: str,
        correctness_avg: float,
        understanding_avg: float
    ) -> Path:
        """Save human-readable markdown report."""
        return self.report_writer.save_report(
            output_dir=output_dir,
            student_name=student_name,
            evaluations=evaluations,
            total_score=total_score,
            max_score=max_score,
            percentage=percentage,
            grade=grade,
            correctness_avg=correctness_avg,
            understanding_avg=understanding_avg,
        )

    def _get_status_message(self, job: Dict[str, Any]) -> str:
        """Generate status message for job."""
        status = job["status"]
        
        if status == "processing":
            progress = job["progress"]
            return f"Evaluating question {progress['questions_evaluated']} of {progress['total_questions']}..."
        elif status == "completed":
            return "Evaluation completed successfully"
        elif status == "failed":
            return f"Evaluation failed: {job.get('error', 'Unknown error')}"
        else:
            return f"Status: {status}"

    
