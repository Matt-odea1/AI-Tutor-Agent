variable "aws_region" {
  description = "AWS region for all assessment resources (must match AWS_DEFAULT_REGION on EC2)"
  type        = string
  default     = "us-east-1"
}

variable "assessment_table_name" {
  description = "DynamoDB table name for assessment data (matches DYNAMODB_ASSESSMENT_TABLE env var)"
  type        = string
  default     = "oral_assessments"
}

variable "auth_users_table_name" {
  description = "DynamoDB table name for auth users (matches DYNAMODB_AUTH_USERS_TABLE env var)"
  type        = string
  default     = "auth_users"
}

variable "assessment_files_bucket" {
  description = "S3 bucket name for audio/video/transcript uploads (private, presigned URL access)"
  type        = string
  # e.g. "chat9021-assessment-files"
}

variable "instructor_app_bucket" {
  description = "S3 bucket name for instructor frontend static site"
  type        = string
  # e.g. "chat9021-instructor-app"
}

variable "student_app_bucket" {
  description = "S3 bucket name for student frontend static site"
  type        = string
  # e.g. "chat9021-student-app"
}

variable "ses_domain" {
  description = "Domain to verify in SES for sending assessment invitation emails"
  type        = string
  default     = "chat9021.org"
}

variable "ec2_role_name" {
  description = "Name of the existing EC2 IAM role to extend with assessment permissions"
  type        = string
  default     = "ai-tutor-ec2-ssm-role"
}

variable "allowed_cors_origins" {
  description = "Allowed origins for S3 assessment-files CORS (instructor + student frontend domains)"
  type        = list(string)
  default = [
    "https://instructor.chat9021.org",
    "https://student.chat9021.org",
    "http://localhost:5175",
    "http://localhost:5176",
  ]
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    Project   = "AI-Tutor"
    Component = "OralAssessment"
    Env       = "prod"
    ManagedBy = "Terraform"
  }
}
