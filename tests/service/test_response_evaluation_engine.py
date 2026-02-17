import pytest

from src.main.service.ResponseEvaluationEngine import ResponseEvaluationEngine, ResponseEvaluationEngineError


class DummyAgent:
    def chat(self, messages):
        return {
            "text": '{"correctness_score": 4, "understanding_score": 5, "total_score": 9, "feedback": "Good"}'
        }


def test_parse_evaluation_response_from_json_fence():
    engine = ResponseEvaluationEngine(agent_client=DummyAgent(), evaluation_prompt="prompt")
    response_text = "```json\n{\"correctness_score\": 5, \"understanding_score\": 4, \"total_score\": 9, \"feedback\": \"Nice\"}\n```"

    parsed = engine.parse_evaluation_response(response_text)

    assert parsed["correctness_score"] == 5
    assert parsed["total_score"] == 9


def test_parse_evaluation_response_missing_required_field_raises():
    engine = ResponseEvaluationEngine(agent_client=DummyAgent(), evaluation_prompt="prompt")

    with pytest.raises(ResponseEvaluationEngineError):
        engine.parse_evaluation_response('{"correctness_score": 5}')


def test_calculate_grade_boundaries():
    assert ResponseEvaluationEngine.calculate_grade(80) == "Excellent"
    assert ResponseEvaluationEngine.calculate_grade(60) == "Competent"
    assert ResponseEvaluationEngine.calculate_grade(40) == "Developing"
    assert ResponseEvaluationEngine.calculate_grade(39.9) == "Unsatisfactory"
