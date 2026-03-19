# ─────────────────────────────────────────────────────────────
# DynamoDB
# ─────────────────────────────────────────────────────────────

output "assessment_table_name" {
  description = "Set as DYNAMODB_ASSESSMENT_TABLE in EC2 .env"
  value       = aws_dynamodb_table.oral_assessments.name
}

output "assessment_table_arn" {
  value = aws_dynamodb_table.oral_assessments.arn
}

output "auth_users_table_name" {
  description = "Set as DYNAMODB_AUTH_USERS_TABLE in EC2 .env"
  value       = aws_dynamodb_table.auth_users.name
}

# ─────────────────────────────────────────────────────────────
# S3
# ─────────────────────────────────────────────────────────────

output "assessment_files_bucket" {
  description = "Set as S3_ASSESSMENT_BUCKET in EC2 .env"
  value       = aws_s3_bucket.assessment_files.id
}

output "instructor_app_website_endpoint" {
  description = "S3 website endpoint — use as Cloudflare CNAME target for instructor.chat9021.org"
  value       = aws_s3_bucket_website_configuration.instructor_app.website_endpoint
}

output "student_app_website_endpoint" {
  description = "S3 website endpoint — use as Cloudflare CNAME target for student.chat9021.org"
  value       = aws_s3_bucket_website_configuration.student_app.website_endpoint
}

# ─────────────────────────────────────────────────────────────
# SES — DNS records to add to Cloudflare
# Add all of these, then SES will auto-verify within minutes.
# ─────────────────────────────────────────────────────────────

output "ses_verification_token" {
  description = "Add to Cloudflare as TXT record: Name=_amazonses.chat9021.org, Content=<this value>"
  value       = aws_ses_domain_identity.main.verification_token
}

output "ses_dkim_tokens" {
  description = "Add 3 CNAME records to Cloudflare: Name=<token>._domainkey.chat9021.org, Target=<token>.dkim.amazonses.com"
  value       = aws_ses_domain_dkim.main.dkim_tokens
}

output "ses_mail_from_mx_record" {
  description = "Add MX record to Cloudflare: Name=mail.chat9021.org, Content=feedback-smtp.us-east-1.amazonses.com, Priority=10"
  value       = "feedback-smtp.${var.aws_region}.amazonses.com (priority 10 on mail.${var.ses_domain})"
}

output "ses_mail_from_spf_record" {
  description = "Add TXT record to Cloudflare: Name=mail.chat9021.org, Content=v=spf1 include:amazonses.com ~all"
  value       = "v=spf1 include:amazonses.com ~all"
}

# ─────────────────────────────────────────────────────────────
# EC2 .env block — copy-paste ready
# ─────────────────────────────────────────────────────────────

output "env_block" {
  description = "Add these lines to /home/ubuntu/app/.env on EC2 (fill in DEEPGRAM_SECRET_KEY manually)"
  value       = <<-EOT
    # Oral Assessment
    DYNAMODB_ASSESSMENT_TABLE=${aws_dynamodb_table.oral_assessments.name}
    DYNAMODB_AUTH_USERS_TABLE=${aws_dynamodb_table.auth_users.name}
    S3_ASSESSMENT_BUCKET=${aws_s3_bucket.assessment_files.id}
    INVITE_FROM_EMAIL=assessments@${var.ses_domain}
    ALLOW_ORIGINS=https://app.chat9021.org,https://instructor.chat9021.org,https://student.chat9021.org
    DEEPGRAM_SECRET_KEY=<paste-key-here>
    LOG_FORMAT=json
  EOT
}
