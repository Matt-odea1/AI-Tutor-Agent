"""
Controller tests for recipient targeting on POST /api/assessment/{id}/send-invites.

The endpoint doubles as the vehicle for follow-up mail (it mints a fresh
single-use invite link per student and supports a custom subject/message), so it
must be able to address a subset of the roster. Without the studentIds filter a
notice meant for the 58 students who submitted would reach all 392 enrolled.
"""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app import create_app
from src.main.auth.dependencies import get_auth_service, require_auth_principal
from src.main.auth.models import AuthPrincipal
from src.main.controllers.controller_dependencies import get_instructor_assessment_service

_INSTRUCTOR = AuthPrincipal(user_id="i-1", roles=["instructor"], source="jwt")

_ROSTER = [
    {"studentId": "s-1", "name": "Student One", "email": "s1@example.edu"},
    {"studentId": "s-2", "name": "Student Two", "email": "s2@example.edu"},
    {"studentId": "s-3", "name": "Student Three", "email": "s3@example.edu"},
    {"studentId": "s-4", "name": "Student Four", "email": ""},
]


def _client(principal=_INSTRUCTOR):
    app = create_app()
    svc = MagicMock()
    svc.get_assessment.return_value = {"id": "a-1", "title": "Quiz 6", "createdBy": "i-1"}
    svc.get_assessment_students.return_value = list(_ROSTER)

    auth = MagicMock()
    auth.generate_student_invite_token.side_effect = lambda sid, aid: f"tok-{sid}"

    app.dependency_overrides[require_auth_principal] = lambda: principal
    app.dependency_overrides[get_instructor_assessment_service] = lambda: svc
    app.dependency_overrides[get_auth_service] = lambda: auth
    return TestClient(app), auth


def _recipients(auth):
    return sorted(c.kwargs["student_email"] for c in auth.send_student_invite_email.call_args_list)


class TestRecipientTargeting:
    def test_student_ids_restrict_the_send(self):
        client, auth = _client()
        response = client.post(
            "/api/assessment/a-1/send-invites",
            json={"studentIds": ["s-1", "s-3"]},
        )
        assert response.status_code == 200
        assert response.json()["sent"] == 2
        assert _recipients(auth) == ["s1@example.edu", "s3@example.edu"]

    def test_omitting_student_ids_mails_everyone(self):
        client, auth = _client()
        response = client.post("/api/assessment/a-1/send-invites", json={})
        assert response.status_code == 200
        # s-4 has no email and is skipped, not mailed.
        assert response.json()["sent"] == 3
        assert response.json()["skipped"] == 1
        assert len(_recipients(auth)) == 3

    def test_empty_student_ids_list_mails_everyone(self):
        client, auth = _client()
        response = client.post("/api/assessment/a-1/send-invites", json={"studentIds": []})
        assert response.status_code == 200
        assert response.json()["sent"] == 3

    def test_unknown_student_ids_are_ignored(self):
        client, auth = _client()
        response = client.post(
            "/api/assessment/a-1/send-invites",
            json={"studentIds": ["s-2", "not-enrolled"]},
        )
        assert response.status_code == 200
        assert response.json()["sent"] == 1
        assert _recipients(auth) == ["s2@example.edu"]

    def test_all_unknown_student_ids_is_rejected(self):
        """Fail loudly rather than silently mailing nobody."""
        client, _ = _client()
        response = client.post(
            "/api/assessment/a-1/send-invites",
            json={"studentIds": ["nope-1", "nope-2"]},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "no_students_to_notify"

    def test_next_results_points_the_link_at_feedback(self):
        client, auth = _client()
        response = client.post(
            "/api/assessment/a-1/send-invites",
            json={"studentIds": ["s-1"], "next": "results"},
        )
        assert response.status_code == 200
        link = auth.send_student_invite_email.call_args_list[0].kwargs["invite_link"]
        assert link.endswith("/invite?token=tok-s-1&next=results")

    def test_link_has_no_suffix_by_default(self):
        client, auth = _client()
        client.post("/api/assessment/a-1/send-invites", json={"studentIds": ["s-1"]})
        link = auth.send_student_invite_email.call_args_list[0].kwargs["invite_link"]
        assert link.endswith("/invite?token=tok-s-1")

    def test_targeted_send_still_honours_custom_message(self):
        client, auth = _client()
        response = client.post(
            "/api/assessment/a-1/send-invites",
            json={
                "studentIds": ["s-1"],
                "subject": "Feedback ready for {{title}}",
                "message": "Hi {{name}}, see {{link}}",
            },
        )
        assert response.status_code == 200
        call = auth.send_student_invite_email.call_args_list[0]
        assert call.kwargs["custom_subject"] == "Feedback ready for {{title}}"
        assert call.kwargs["custom_message"] == "Hi {{name}}, see {{link}}"
        assert call.kwargs["invite_link"].endswith("/invite?token=tok-s-1")
