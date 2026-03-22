output "role_arn" {
  description = "Set as AWS_DEPLOY_ROLE_ARN in GitHub Actions variables (Settings → Variables)"
  value       = aws_iam_role.github_actions.arn
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC identity provider (only one needed per AWS account)"
  value       = aws_iam_openid_connect_provider.github.arn
}

output "next_steps" {
  description = "What to do after apply"
  value       = <<-EOT

    ── GitHub Actions setup ────────────────────────────────────────
    1. Go to GitHub → Settings → Secrets and variables → Actions → Variables
       Add variable: AWS_DEPLOY_ROLE_ARN = ${aws_iam_role.github_actions.arn}

    2. Delete these GitHub secrets (no longer needed):
         AWS_ACCESS_KEY_ID
         AWS_SECRET_ACCESS_KEY
         AUTH_JWT_SECRET
         (any other secrets now managed via SSM)

    ── SSM Parameter Store ─────────────────────────────────────────
    3. Add secrets (run once, then update via --overwrite as needed):
         aws ssm put-parameter --region ap-southeast-2 \
           --name /ai-tutor/prod/AUTH_JWT_SECRET \
           --value "$(openssl rand -hex 32)" --type SecureString

         aws ssm put-parameter --region ap-southeast-2 \
           --name /ai-tutor/prod/DEEPGRAM_SECRET_KEY \
           --value "dg_..." --type SecureString

         aws ssm put-parameter --region ap-southeast-2 \
           --name /ai-tutor/prod/NEO4J_PASSWORD \
           --value "..." --type SecureString

    See docs/ORAL_ASSESSMENT_DEPLOYMENT.md for the complete parameter list.
  EOT
}
