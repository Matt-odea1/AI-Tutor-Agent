from __future__ import annotations

import logging

import boto3
from botocore.exceptions import ClientError


logger = logging.getLogger(__name__)


class S3UploadServiceError(Exception):
    pass


class S3UploadService:
    def __init__(self, bucket_name: str, region: str):
        self.bucket_name = bucket_name
        self.region = region
        self.client = boto3.client("s3", region_name=region)

    def generate_upload_url(self, filename: str, content_type: str = "audio/webm") -> dict:
        try:
            presigned_url = self.client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": filename,
                    "ContentType": content_type,
                },
                ExpiresIn=3600,
            )
            file_url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{filename}"
            logger.info("Generated presigned URL for: %s", filename)
            return {
                "uploadUrl": presigned_url,
                "fileUrl": file_url,
            }
        except ClientError as error:
            error_message = error.response.get("Error", {}).get("Message", "Unknown S3 error")
            logger.error("S3 presign failed: %s", error_message)
            raise S3UploadServiceError(error_message) from error
