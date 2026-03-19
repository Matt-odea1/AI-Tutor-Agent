# Terraform Variables for DynamoDB Infrastructure

variable "aws_region" {
  description = "AWS region for DynamoDB table (must match Bedrock region)"
  type        = string
  default     = "us-east-1"  # Required for OpenAI GPT OSS 120B
}

variable "table_name" {
  description = "Name of the DynamoDB table for chat sessions"
  type        = string
  default     = "chat_sessions"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "production"
}

variable "enable_pitr" {
  description = "Enable Point-in-Time Recovery for backups"
  type        = bool
  default     = true  # Recommended for production
}

# Optional: TTL duration in days
variable "ttl_days" {
  description = "Number of days before sessions auto-expire (informational only)"
  type        = number
  default     = 30
}
