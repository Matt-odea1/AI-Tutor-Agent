# DynamoDB Table for AI Tutor Chat Sessions
# Provider: AWS (us-east-1 region for GPT OSS 120B compatibility)

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  
  # Uses AWS credentials from:
  # 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  # 2. ~/.aws/credentials
  # 3. IAM role (if running on EC2)
}

# DynamoDB Table: chat_sessions
# Single-table design with PK/SK pattern for sessions and messages
resource "aws_dynamodb_table" "chat_sessions" {
  name           = var.table_name
  billing_mode   = "PAY_PER_REQUEST"  # Serverless pricing - no capacity planning needed
  hash_key       = "PK"               # Partition Key
  range_key      = "SK"               # Sort Key

  # Primary Key Attributes
  attribute {
    name = "PK"
    type = "S"  # String: SESSION#<session_id>
  }

  attribute {
    name = "SK"
    type = "S"  # String: METADATA or MESSAGE#<timestamp>
  }

  # Global Secondary Index for user-based queries (future multi-user support)
  attribute {
    name = "GSI1PK"
    type = "S"  # String: USER#<user_id>
  }

  attribute {
    name = "GSI1SK"
    type = "S"  # String: <last_accessed_timestamp>
  }

  global_secondary_index {
    name            = "UserSessionsIndex"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"  # Include all attributes in index
  }

  # Time-To-Live: Auto-delete old sessions after 30 days
  ttl {
    enabled        = true
    attribute_name = "ttl"  # Unix timestamp (seconds since epoch)
  }

  # Point-in-Time Recovery: 35-day backup window
  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  # Tags for cost tracking and organization
  tags = {
    Name        = "AI Tutor Chat Sessions"
    Environment = var.environment
    Project     = "AI-Tutor"
    ManagedBy   = "Terraform"
    CostCenter  = "Education"
  }
}

# CloudWatch Alarm: Alert on DynamoDB errors
resource "aws_cloudwatch_metric_alarm" "dynamodb_system_errors" {
  alarm_name          = "${var.table_name}-system-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "SystemErrors"
  namespace           = "AWS/DynamoDB"
  period              = 60  # 1 minute
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Alert when DynamoDB experiences system errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.chat_sessions.name
  }

  # Optional: Add SNS topic for email notifications
  # alarm_actions = [aws_sns_topic.alerts.arn]
}

# Optional: CloudWatch Alarm for User Errors (throttling, validation issues)
resource "aws_cloudwatch_metric_alarm" "dynamodb_user_errors" {
  alarm_name          = "${var.table_name}-user-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2  # Must breach 2 consecutive periods
  metric_name         = "UserErrors"
  namespace           = "AWS/DynamoDB"
  period              = 300  # 5 minutes
  statistic           = "Sum"
  threshold           = 10  # Alert if >10 errors in 5 min
  alarm_description   = "Alert when DynamoDB experiences high user error rate"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.chat_sessions.name
  }
}
