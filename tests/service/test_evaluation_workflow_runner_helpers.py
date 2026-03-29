from src.main.service.EvaluationWorkflowRunner import EvaluationWorkflowRunner


class _Dummy:
    pass


def test_match_questions_and_answers_pairs_by_question_id():
    questions = [{"id": "q1"}, {"id": "q2"}, {"id": "q3"}]
    answers = [{"questionId": "q2"}, {"questionId": "q1"}]

    pairs = EvaluationWorkflowRunner.match_questions_and_answers(questions, answers)

    assert len(pairs) == 2
    assert pairs[0]["question"]["id"] == "q1"
    assert pairs[0]["answer"]["questionId"] == "q1"
    assert pairs[1]["question"]["id"] == "q2"
