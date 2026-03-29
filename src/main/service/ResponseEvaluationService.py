"""
ResponseEvaluationService: Evaluates student responses to programming questions.

Uses DynamoDB for reading questions/answers and storing evaluation results.
Long-running evaluations are dispatched via SQS and processed by EvaluationWorkflowRunner.
"""
import threading
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path

from src.main.service.ResponseEvaluationEngine import ResponseEvaluationEngine
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
        transcription_service=None,
    ):
        self.agent_client = agent_client or AgentCoreProvider()
        self.repository = repository or ResponseEvaluationRepository()

        # Load evaluation prompt
        prompt_file = Path(__file__).resolve().parents[3] / "prompts" / "response_evaluation_prompt.md"
        self.evaluation_prompt = read_prompt(prompt_file)
        self.engine = ResponseEvaluationEngine(agent_client=self.agent_client, evaluation_prompt=self.evaluation_prompt)
        self.workflow_runner = EvaluationWorkflowRunner(
            engine=self.engine,
            repository=self.repository,
            transcription_service=transcription_service,
        )

    def start_evaluation_from_dynamodb(
        self,
        student_id: str,
        assessment_id: str
    ) -> Dict[str, Any]:
        """
        Start async evaluation of student responses from DynamoDB.

        Returns:
            Dictionary with job_id and initial status
        """
        try:
            total_questions = self._count_answers_in_dynamodb(student_id, assessment_id)
        except Exception as e:
            raise ResponseEvaluationError(f"Failed to read answers from DynamoDB: {e}")

        if total_questions == 0:
            raise ResponseEvaluationError(f"No answers found for student {student_id} in assessment {assessment_id}")

        timestamp = int(datetime.now().timestamp())
        job_id = f"eval_{student_id}_{assessment_id}_{timestamp}"

        # Start background thread
        thread = threading.Thread(
            target=self.workflow_runner.evaluate_from_dynamodb,
            args=(job_id, student_id, assessment_id)
        )
        thread.daemon = True
        thread.start()

        return {
            "job_id": job_id,
            "status": "processing",
            "student_id": student_id,
            "assessment_id": assessment_id,
            "total_questions": total_questions,
            "estimated_time_seconds": total_questions * 8
        }

    def _count_answers_in_dynamodb(self, student_id: str, assessment_id: str) -> int:
        return self.repository.count_answers(student_id, assessment_id)
