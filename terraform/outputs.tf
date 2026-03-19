# Terraform Outputs - Reference these values in your application

output "table_name" {
  description = "Name of the DynamoDB table"
  value       = aws_dynamodb_table.chat_sessions.name
}

output "table_arn" {
  description = "ARN of the DynamoDB table"
  value       = aws_dynamodb_table.chat_sessions.arn
}

output "table_id" {
  description = "Table ID (same as name)"
  value       = aws_dynamodb_table.chat_sessions.id
}

output "gsi_name" {
  description = "Name of the Global Secondary Index for user queries"
  value       = "UserSessionsIndex"
}

output "system_errors_alarm_arn" {
  description = "ARN of the system errors CloudWatch alarm"
  value       = aws_cloudwatch_metric_alarm.dynamodb_system_errors.arn
}

output "user_errors_alarm_arn" {
  description = "ARN of the user errors CloudWatch alarm"
  value       = aws_cloudwatch_metric_alarm.dynamodb_user_errors.arn
}

# Instructions for backend configuration
output "backend_config_instructions" {
  description = "Add these to your .env file"
  value = <<-EOT
    
    # Add to .env:
    DYNAMODB_TABLE_NAME=${aws_dynamodb_table.chat_sessions.name}
    DYNAMODB_REGION=${var.aws_region}
    USE_DYNAMODB=true
    
  EOT
}
