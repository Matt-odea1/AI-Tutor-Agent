output "ec2_public_ip" {
  value = aws_instance.app.public_ip
}

output "ec2_public_dns" {
  value = aws_instance.app.public_dns
}

output "ec2_instance_id" {
  value = aws_instance.app.id
}

output "s3_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "s3_website_url" {
  value = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

output "sqs_jobs_queue_url" {
  value       = aws_sqs_queue.jobs.url
  description = "Set as SQS_QUEUE_URL env var on the API server"
}

output "sqs_jobs_dlq_url" {
  value = aws_sqs_queue.jobs_dlq.url
}

output "cloudwatch_log_group" {
  value = aws_cloudwatch_log_group.api.name
}
