from src.main.service.EvaluationWorkflowRunner import EvaluationWorkflowRunner


class _Dummy:
    pass


def _runner(tmp_path):
    return EvaluationWorkflowRunner(
        engine=_Dummy(),
        repository=_Dummy(),
        report_writer=_Dummy(),
        job_store=_Dummy(),
        base_output_dir=tmp_path,
    )


def test_match_questions_and_answers_pairs_by_question_id(tmp_path):
    runner = _runner(tmp_path)

    questions = [{"id": "q1"}, {"id": "q2"}, {"id": "q3"}]
    answers = [{"questionId": "q2"}, {"questionId": "q1"}]

    pairs = runner.match_questions_and_answers(questions, answers)

    assert len(pairs) == 2
    assert pairs[0]["question"]["id"] == "q1"
    assert pairs[0]["answer"]["questionId"] == "q1"
    assert pairs[1]["question"]["id"] == "q2"


def test_read_responses_csv_reads_rows(tmp_path):
    csv_path = tmp_path / "responses.csv"
    csv_path.write_text("question_number,question,transcript\n1,What is x?,x is y\n", encoding="utf-8")

    rows = EvaluationWorkflowRunner.read_responses_csv(str(csv_path))

    assert len(rows) == 1
    assert rows[0]["question_number"] == "1"
    assert rows[0]["question"] == "What is x?"
