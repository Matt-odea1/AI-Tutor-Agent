variable "github_org" {
  description = "GitHub organisation or username (e.g. 'acme' for github.com/acme/repo)"
  type        = string
}

variable "github_repo" {
  description = "Repository name without the org prefix (e.g. 'AI-Tutor-Agent')"
  type        = string
}

variable "aws_region" {
  description = "AWS region for the provider — IAM is global, this just sets the API endpoint"
  type        = string
  default     = "us-east-1"
}

variable "ec2_region" {
  description = "AWS region where the EC2 instance runs; used to scope SSM SendCommand resource ARNs"
  type        = string
  default     = "ap-southeast-2"
}

variable "frontend_s3_buckets" {
  description = "Names of all S3 buckets that GitHub Actions needs to sync frontends to"
  type        = list(string)
  # Example: ["chat9021", "chat9021-instructor-app", "chat9021-student-app"]
}

variable "tags" {
  description = "Tags to apply to created resources"
  type        = map(string)
  default     = {}
}
