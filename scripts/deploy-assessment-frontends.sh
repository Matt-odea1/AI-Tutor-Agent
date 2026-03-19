#!/usr/bin/env bash
# deploy-assessment-frontends.sh
#
# Builds and deploys both oral assessment frontends to S3.
# Requires: AWS CLI configured, correct S3 bucket names as env vars or args.
#
# Usage:
#   ./scripts/deploy-assessment-frontends.sh
#
# Required env vars (or set via tfvars output):
#   INSTRUCTOR_BUCKET   e.g. chat9021-instructor-app
#   STUDENT_BUCKET      e.g. chat9021-student-app
#   API_BASE_URL        e.g. https://api.chat9021.org
#   AWS_REGION          e.g. us-east-1

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

INSTRUCTOR_BUCKET="${INSTRUCTOR_BUCKET:-chat9021-instructor-app}"
STUDENT_BUCKET="${STUDENT_BUCKET:-chat9021-student-app}"
API_BASE_URL="${API_BASE_URL:-https://api.chat9021.org}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "=== Deploying oral assessment frontends ==="
echo "API:        $API_BASE_URL"
echo "Instructor: s3://$INSTRUCTOR_BUCKET"
echo "Student:    s3://$STUDENT_BUCKET"
echo ""

# ─── Build instructor frontend ───────────────────────────────
echo "--- Building oral-assessment-instructor ---"
cd "$ROOT/oral-assessment-instructor"
VITE_API_BASE_URL="$API_BASE_URL" npm run build

echo "--- Syncing to s3://$INSTRUCTOR_BUCKET ---"
aws s3 sync dist/ "s3://$INSTRUCTOR_BUCKET" \
  --region "$AWS_REGION" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"

# index.html must not be cached (so new deploys take effect immediately)
aws s3 cp dist/index.html "s3://$INSTRUCTOR_BUCKET/index.html" \
  --region "$AWS_REGION" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

echo "Instructor deployed."
echo ""

# ─── Build student frontend ───────────────────────────────────
echo "--- Building oral-assessment-student ---"
cd "$ROOT/oral-assessment-student"
VITE_API_BASE_URL="$API_BASE_URL" npm run build

echo "--- Syncing to s3://$STUDENT_BUCKET ---"
aws s3 sync dist/ "s3://$STUDENT_BUCKET" \
  --region "$AWS_REGION" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"

aws s3 cp dist/index.html "s3://$STUDENT_BUCKET/index.html" \
  --region "$AWS_REGION" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

echo "Student deployed."
echo ""
echo "=== Done ==="
echo ""
echo "If first deploy, verify Cloudflare DNS is pointing to:"
echo "  instructor.chat9021.org → $(aws s3api get-bucket-website --bucket "$INSTRUCTOR_BUCKET" --region "$AWS_REGION" --query 'RoutingRules' 2>/dev/null || echo "(run: aws s3 website --bucket $INSTRUCTOR_BUCKET)")"
echo ""
echo "Check sites:"
echo "  https://instructor.chat9021.org"
echo "  https://student.chat9021.org"
