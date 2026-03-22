terraform {
  required_version = ">= 1.3"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ─────────────────────────────────────────────────────────────
# GitHub Actions OIDC Identity Provider
#
# Allows GitHub Actions to assume an IAM role using a short-lived
# OIDC token — no AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY needed.
#
# Thumbprints: GitHub publishes these at
#   https://github.blog/changelog/2023-06-27-github-actions-oidc-thumbprint-update
# If GitHub rotates their certificate, add the new thumbprint here and re-apply.
# ─────────────────────────────────────────────────────────────

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b00a8ef5eba0e4bc3e4",
  ]
}

# ─────────────────────────────────────────────────────────────
# GitHub Actions IAM Role
# ─────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "github_oidc_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Restrict to the specific repo. To further restrict to main-only deploys,
    # change the value to: "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main"
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_org}/${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "github-actions-${var.github_repo}"
  assume_role_policy = data.aws_iam_policy_document.github_oidc_trust.json
  description        = "Assumed by GitHub Actions for ${var.github_org}/${var.github_repo} CI/CD"
  tags               = var.tags
}

# ─────────────────────────────────────────────────────────────
# Deploy Permissions
# ─────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "github_actions_deploy" {
  # Find EC2 instances by tag (used when EC2_INSTANCE_ID var is not set)
  statement {
    sid       = "EC2Describe"
    effect    = "Allow"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  # Send SSM Run Command to EC2 (scoped to the EC2 region)
  statement {
    sid     = "SSMSendCommand"
    effect  = "Allow"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ec2:${var.ec2_region}:*:instance/*",
      "arn:aws:ssm:${var.ec2_region}::document/AWS-RunShellScript",
    ]
  }

  # Poll SSM command invocation status
  statement {
    sid       = "SSMGetCommandInvocation"
    effect    = "Allow"
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"]
  }

  # Deploy frontends to S3 (all app buckets)
  statement {
    sid    = "S3FrontendDeployBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [for b in var.frontend_s3_buckets : "arn:aws:s3:::${b}"]
  }

  statement {
    sid    = "S3FrontendDeployObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:GetObject",
    ]
    resources = [for b in var.frontend_s3_buckets : "arn:aws:s3:::${b}/*"]
  }

  # CloudFront cache invalidation (ai-tutor-frontend uses CloudFront)
  statement {
    sid    = "CloudFrontInvalidate"
    effect = "Allow"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:ListDistributions",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}
