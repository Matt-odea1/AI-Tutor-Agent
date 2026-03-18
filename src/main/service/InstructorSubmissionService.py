"""
InstructorSubmissionService - Handles student code submission uploads

Handles:
- CSV bulk enrolment parsing and validation
- Single student code file upload (S3 + DynamoDB)
- Zip archive upload with per-student matching (S3 + DynamoDB)
"""

from __future__ import annotations

import csv
import io
import logging
import os
import zipfile
from typing import Any, Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".py", ".js", ".ts", ".java", ".cpp", ".c", ".go", ".rb", ".txt"}
MAX_FILE_BYTES = 500 * 1024  # 500 KB


class InstructorSubmissionServiceError(Exception):
    pass


class InstructorSubmissionService:
    def __init__(self, *, table, s3_bucket: str, region: str):
        self.table = table
        self.s3_bucket = s3_bucket
        self.region = region
        try:
            self.s3 = boto3.client("s3", region_name=region)
        except Exception as e:
            raise InstructorSubmissionServiceError(f"Failed to initialise S3 client: {e}")

    # ─────────────────────────────────────────────────────────────
    # EPIC-2-1: CSV bulk enrolment
    # ─────────────────────────────────────────────────────────────

    def parse_csv_enrollment(
        self, csv_bytes: bytes
    ) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        """
        Parse CSV bytes for student enrollment.

        Accepts headers in any casing with underscores, hyphens, or spaces:
        student_id / studentId / Student ID, name / Name, email / Email

        Returns:
            (valid_rows, error_rows)
            valid_rows: list of dicts ready for InstructorAssessmentService.upload_students()
            error_rows: list of {row, data, errors}
        """
        try:
            text = csv_bytes.decode("utf-8-sig")  # strip BOM if present
        except UnicodeDecodeError:
            text = csv_bytes.decode("latin-1")

        reader = csv.DictReader(io.StringIO(text))

        if not reader.fieldnames:
            raise InstructorSubmissionServiceError("CSV has no headers or is empty")

        def _norm(s: str) -> str:
            return s.strip().lower().replace("_", "").replace("-", "").replace(" ", "")

        # map normalised header → original header
        field_map: Dict[str, str] = {_norm(f): f for f in reader.fieldnames}

        # canonical aliases → target key
        aliases: Dict[str, str] = {
            "studentid": "studentId",
            "student": "studentId",
            "id": "studentId",
            "name": "name",
            "fullname": "name",
            "email": "email",
            "emailaddress": "email",
        }

        resolved: Dict[str, str] = {}  # target key → original header
        for norm_field, orig_field in field_map.items():
            target = aliases.get(norm_field)
            if target and target not in resolved:
                resolved[target] = orig_field

        missing = [k for k in ("studentId", "name", "email") if k not in resolved]
        if missing:
            raise InstructorSubmissionServiceError(
                f"CSV missing required columns: {missing}. Found headers: {list(reader.fieldnames)}"
            )

        valid_rows: List[Dict[str, str]] = []
        error_rows: List[Dict[str, Any]] = []
        seen_ids: set = set()

        for row_num, raw_row in enumerate(reader, start=2):  # row 1 = header
            student_id = (raw_row.get(resolved["studentId"]) or "").strip()
            name = (raw_row.get(resolved["name"]) or "").strip()
            email = (raw_row.get(resolved["email"]) or "").strip()

            errors: List[str] = []
            if not student_id:
                errors.append("studentId is required")
            if not name:
                errors.append("name is required")
            if not email or "@" not in email:
                errors.append("valid email is required")
            if student_id and student_id in seen_ids:
                errors.append(f"duplicate studentId '{student_id}'")

            if errors:
                error_rows.append({"row": row_num, "data": dict(raw_row), "errors": errors})
            else:
                seen_ids.add(student_id)
                valid_rows.append(
                    {
                        "studentId": student_id,
                        "name": name,
                        "email": email,
                        "code": "",
                        "assignmentFile": "",
                    }
                )

        return valid_rows, error_rows

    # ─────────────────────────────────────────────────────────────
    # EPIC-2-2: Single student code file upload
    # ─────────────────────────────────────────────────────────────

    def upload_student_code_files(
        self,
        assessment_id: str,
        student_id: str,
        files: List[Tuple[str, bytes]],
    ) -> Dict[str, Any]:
        """
        Upload one or more code files for a student.
        Files are concatenated with filename separator headers.
        Each file must be ≤ 500 KB and have an allowed extension.
        Stores to S3 and updates the student enrollment record in DynamoDB.

        Args:
            assessment_id: Assessment identifier
            student_id: Student identifier
            files: List of (filename, content_bytes) tuples

        Returns:
            Confirmation dict with s3Key and codeLength
        """
        validation_errors: List[str] = []
        for filename, content_bytes in files:
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                validation_errors.append(
                    f"'{filename}': unsupported extension '{ext}'"
                    f" (allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))})"
                )
            elif len(content_bytes) > MAX_FILE_BYTES:
                validation_errors.append(
                    f"'{filename}': {len(content_bytes)} bytes exceeds 500 KB limit"
                )

        if validation_errors:
            raise InstructorSubmissionServiceError("; ".join(validation_errors))

        parts: List[str] = []
        for filename, content_bytes in files:
            try:
                text = content_bytes.decode("utf-8")
            except UnicodeDecodeError:
                text = content_bytes.decode("latin-1", errors="replace")
            parts.append(f"# === {filename} ===\n{text}")

        code_text = "\n\n".join(parts)
        s3_key = self._put_code_to_s3(assessment_id, student_id, code_text)
        self._update_student_code(assessment_id, student_id, code_text, s3_key)

        logger.info(
            f"Uploaded {len(files)} code file(s) for student {student_id} "
            f"in assessment {assessment_id} → {s3_key}"
        )
        return {
            "ok": True,
            "assessmentId": assessment_id,
            "studentId": student_id,
            "filesUploaded": len(files),
            "s3Key": s3_key,
            "codeLength": len(code_text),
        }

    # ─────────────────────────────────────────────────────────────
    # EPIC-2-3: Zip archive upload
    # ─────────────────────────────────────────────────────────────

    def upload_zip_submissions(
        self,
        assessment_id: str,
        zip_bytes: bytes,
        enrolled_student_ids: List[str],
    ) -> Dict[str, Any]:
        """
        Extract a zip archive and match files by filename stem to enrolled student IDs.
        Matching is case-insensitive. Each matched file is stored to S3 and
        the student's enrollment record is updated in DynamoDB.

        Returns:
            Summary with matched / unmatched / error lists
        """
        try:
            zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        except zipfile.BadZipFile as e:
            raise InstructorSubmissionServiceError(f"Invalid zip file: {e}")

        # Build case-insensitive lookup
        enrolled_lookup: Dict[str, str] = {sid.lower(): sid for sid in enrolled_student_ids}

        matched: List[Dict[str, str]] = []
        unmatched: List[Dict[str, str]] = []
        errors: List[Dict[str, str]] = []

        for name in zf.namelist():
            if name.endswith("/"):
                continue  # skip directory entries

            basename = os.path.basename(name)
            stem = os.path.splitext(basename)[0].lower()
            ext = os.path.splitext(basename)[1].lower()

            if ext not in ALLOWED_EXTENSIONS:
                unmatched.append(
                    {"file": name, "reason": f"unsupported extension '{ext}'"}
                )
                continue

            real_id = enrolled_lookup.get(stem)
            if not real_id:
                unmatched.append(
                    {"file": name, "reason": "filename stem does not match any enrolled student ID"}
                )
                continue

            content_bytes = zf.read(name)
            if len(content_bytes) > MAX_FILE_BYTES:
                errors.append({"file": name, "error": f"exceeds 500 KB limit ({len(content_bytes)} bytes)"})
                continue

            try:
                code_text = content_bytes.decode("utf-8")
            except UnicodeDecodeError:
                code_text = content_bytes.decode("latin-1", errors="replace")

            try:
                code_text_with_header = f"# === {basename} ===\n{code_text}"
                s3_key = self._put_code_to_s3(assessment_id, real_id, code_text_with_header)
                self._update_student_code(assessment_id, real_id, code_text_with_header, s3_key)
                matched.append({"file": name, "studentId": real_id, "s3Key": s3_key})
            except Exception as e:
                errors.append({"file": name, "error": str(e)})

        logger.info(
            f"Zip upload for assessment {assessment_id}: "
            f"{len(matched)} matched, {len(unmatched)} unmatched, {len(errors)} errors"
        )
        return {
            "ok": True,
            "assessmentId": assessment_id,
            "matchedCount": len(matched),
            "unmatchedCount": len(unmatched),
            "matched": matched,
            "unmatched": unmatched,
            "errors": errors,
        }

    # ─────────────────────────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────────────────────────

    def _put_code_to_s3(self, assessment_id: str, student_id: str, code_text: str) -> str:
        """Upload code text to S3 and return the S3 key."""
        key = f"submissions/{assessment_id}/{student_id}/code.txt"
        try:
            self.s3.put_object(
                Bucket=self.s3_bucket,
                Key=key,
                Body=code_text.encode("utf-8"),
                ContentType="text/plain",
            )
        except ClientError as e:
            raise InstructorSubmissionServiceError(
                f"S3 upload failed for {student_id}: {e}"
            ) from e
        return key

    def _update_student_code(
        self, assessment_id: str, student_id: str, code_text: str, s3_key: str
    ) -> None:
        """Update the student enrollment record with code text and S3 reference."""
        self.table.update_item(
            Key={
                "PK": f"ASSESSMENT#{assessment_id}",
                "SK": f"STUDENT#{student_id}",
            },
            UpdateExpression="SET code = :code, assignmentFile = :file",
            ExpressionAttributeValues={
                ":code": code_text,
                ":file": s3_key,
            },
        )
