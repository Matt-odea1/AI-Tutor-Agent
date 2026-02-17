from src.main.service.EvaluationJobStore import EvaluationJobStore


def test_create_job_initializes_progress():
    store = EvaluationJobStore()

    store.create_processing_job("job-1", {"student_id": "s1"}, total_questions=3)

    job = store.get("job-1")
    assert job is not None
    assert job["status"] == "processing"
    assert job["student_id"] == "s1"
    assert job["progress"]["questions_evaluated"] == 0
    assert job["progress"]["total_questions"] == 3


def test_set_progress_updates_percentage():
    store = EvaluationJobStore()
    store.create_processing_job("job-1", {}, total_questions=4)

    store.set_progress("job-1", questions_evaluated=2, total_questions=4)

    job = store.get("job-1")
    assert job["progress"]["percentage"] == 50.0


def test_mark_completed_and_failed():
    store = EvaluationJobStore()
    store.create_processing_job("job-1", {}, total_questions=1)

    store.mark_completed("job-1", {"ok": True})
    assert store.get("job-1")["status"] == "completed"
    assert store.get("job-1")["result"] == {"ok": True}

    store.mark_failed("job-1", "boom")
    assert store.get("job-1")["status"] == "failed"
    assert store.get("job-1")["error"] == "boom"
