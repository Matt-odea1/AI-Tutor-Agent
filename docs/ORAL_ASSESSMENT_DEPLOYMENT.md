# Oral Assessment Platform — Deployment Plan

## Architecture

```
Cloudflare DNS
├── app.chat9021.org          → S3 (ai-tutor-frontend)     [existing]
├── api.chat9021.org          → EC2 :443 → Nginx → :8000   [existing]
├── instructor.chat9021.org   → S3 (oral-assessment-instructor)  [NEW]
└── student.chat9021.org      → S3 (oral-assessment-student)     [NEW]

EC2 (t4g.small, ap-southeast-2)
└── Docker
    ├── FastAPI :8000   ← serves ALL routes for all three apps
    └── Neo4j :7687     ← RAG vector store (ai-tutor only)

AWS Services (us-east-1)
├── DynamoDB: oral_assessments  [NEW — assessment data, jobs, results]
├── DynamoDB: auth_users        [NEW — instructor auth]
├── DynamoDB: chat_sessions     [existing — AI tutor chat]
├── S3: chat9021-assessment-files  [NEW — audio/video uploads, private]
├── S3: chat9021-instructor-app    [NEW — instructor frontend]
├── S3: chat9021-student-app       [NEW — student frontend]
├── SQS: ai-tutor-jobs             [existing — question gen + evaluation]
└── SES: chat9021.org identity     [NEW — invitation/reminder emails]
```

All Terraform is automated except SES domain verification and Cloudflare DNS records, which require manual steps.

---

## What Claude has already built (Terraform)

`terraform/assessment/` creates:
- DynamoDB `oral_assessments` — single-table for all assessment data
- DynamoDB `auth_users` — instructor auth records
- S3 `<assessment_files_bucket>` — private, CORS-enabled for presigned URLs
- S3 `<instructor_app_bucket>` — public static website
- S3 `<student_app_bucket>` — public static website
- SES domain identity for `chat9021.org` + DKIM
- IAM policy on existing EC2 role (`ai-tutor-ec2-ssm-role`) for DynamoDB, S3, SES, Bedrock
- CloudWatch alarm if DLQ accumulates failed jobs

---

## Step-by-step deployment

### Phase 1 — Configure and run Terraform (Claude can't do this — needs AWS credentials)

**1.1 Create your tfvars file**

```bash
cd terraform/assessment
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — fill in bucket names (must be globally unique)
```

Suggested values:
```hcl
assessment_files_bucket = "chat9021-assessment-files"
instructor_app_bucket   = "chat9021-instructor-app"
student_app_bucket      = "chat9021-student-app"
```

**1.2 Apply**

```bash
cd terraform/assessment
terraform init
terraform plan   # review — should show ~12 resources to create
terraform apply
```

Expected output includes:
- `assessment_table_name = "oral_assessments"`
- `assessment_files_bucket = "chat9021-assessment-files"`
- `instructor_app_website_endpoint = "chat9021-instructor-app.s3-website-us-east-1.amazonaws.com"`
- `student_app_website_endpoint = "chat9021-student-app.s3-website-us-east-1.amazonaws.com"`
- `ses_verification_token = "_amazonses TXT record value"`
- `ses_dkim_tokens = ["token1", "token2", "token3"]`

**Save this output** — you'll need the DNS record values in the next step.

> If the `auth_users` table already exists in your account, import it first:
> `terraform import aws_dynamodb_table.auth_users auth_users`

---

### Phase 2 — Add DNS records to Cloudflare (human action)

In Cloudflare → DNS for `chat9021.org`, add the following records:

**Instructor and Student frontends** (Cloudflare handles HTTPS):

| Type  | Name                      | Content                                                  | Proxy  |
|-------|---------------------------|----------------------------------------------------------|--------|
| CNAME | `instructor`              | `chat9021-instructor-app.s3-website-us-east-1.amazonaws.com` | Proxied |
| CNAME | `student`                 | `chat9021-student-app.s3-website-us-east-1.amazonaws.com`    | Proxied |

**SES domain verification** (so SES can send from `@chat9021.org`):

| Type  | Name                            | Content                              |
|-------|---------------------------------|--------------------------------------|
| TXT   | `_amazonses.chat9021.org`       | `<ses_verification_token from output>` |
| CNAME | `<token1>._domainkey`           | `<token1>.dkim.amazonses.com`        |
| CNAME | `<token2>._domainkey`           | `<token2>.dkim.amazonses.com`        |
| CNAME | `<token3>._domainkey`           | `<token3>.dkim.amazonses.com`        |
| MX    | `mail`                          | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
| TXT   | `mail`                          | `v=spf1 include:amazonses.com ~all` |

Wait ~5–10 minutes for DNS propagation. SES will auto-verify once it sees the TXT records.

---

### Phase 3 — Update the EC2 `.env` file (human action)

SSH to the EC2 instance:

```bash
ssh ubuntu@3.27.56.110    # or use SSM: aws ssm start-session --target <instance-id>
cd /home/ubuntu/app       # or wherever the repo is checked out
```

Add/update these lines in `.env` (use the `env_block` from `terraform output`):

```bash
# Oral Assessment — add to existing .env
DYNAMODB_ASSESSMENT_TABLE=oral_assessments
DYNAMODB_AUTH_USERS_TABLE=auth_users
S3_ASSESSMENT_BUCKET=chat9021-assessment-files
INVITE_FROM_EMAIL=assessments@chat9021.org
ALLOW_ORIGINS=https://app.chat9021.org,https://instructor.chat9021.org,https://student.chat9021.org
DEEPGRAM_SECRET_KEY=<your-deepgram-api-key>
LOG_FORMAT=json
```

`DEEPGRAM_SECRET_KEY` is the only secret you need to paste manually — get it from the Deepgram console.

Restart the backend:

```bash
docker compose pull     # optional: pull latest image if using registry
docker compose down
docker compose up -d
docker compose logs -f api   # confirm "Application startup complete"
```

Verify health:

```bash
curl https://api.chat9021.org/health
# Expected: {"status": "ok", ...}
```

---

### Phase 4 — Deploy frontends to S3 (human action)

From your local machine:

```bash
# Install dependencies first (only needed once)
cd oral-assessment-instructor && npm ci && cd ..
cd oral-assessment-student && npm ci && cd ..

# Deploy both frontends
INSTRUCTOR_BUCKET=chat9021-instructor-app \
STUDENT_BUCKET=chat9021-student-app \
API_BASE_URL=https://api.chat9021.org \
./scripts/deploy-assessment-frontends.sh
```

Verify:
```bash
curl -I https://instructor.chat9021.org
curl -I https://student.chat9021.org
# Expected: HTTP/2 200
```

---

### Phase 5 — Exit SES sandbox (human action, AWS takes 24–48 hours)

By default SES can only send to verified email addresses. To send to any email:

1. AWS Console → SES → Account dashboard → "Request production access"
2. Fill out the form:
   - Mail type: **Transactional**
   - Website URL: `https://instructor.chat9021.org`
   - Use case: "We send assessment invitation emails and answer submission receipts to students. Volume: ~20 students per assessment, occasional batches."
3. Submit — AWS typically approves within 24 hours.

**Until approved**: SES only sends to verified email addresses. Add student emails via:
```bash
aws ses verify-email-identity --email-address student@example.com --region us-east-1
```

---

### Phase 6 — Smoke test (human action)

Once all phases complete, run through:

1. **Instructor login** → `https://instructor.chat9021.org` → sign in
2. **Create assessment** → fill title, course, due date
3. **Upload students** → upload CSV with name + email
4. **Generate questions** → click Generate, wait for SSE stream to complete
5. **Send invitations** → click Send Invitations, verify emails arrive
6. **Student flow** → open invitation link → `https://student.chat9021.org/...`
7. **Submit answers** → answer all questions (text or audio)
8. **Evaluate** → instructor clicks Evaluate All, watch per-student progress bars
9. **Release results** → instructor releases, student sees results page

---

## Known gotchas

| Issue | Fix |
|-------|-----|
| S3 website returns `403 NoSuchBucket` | Bucket name must exactly match what's in tfvars |
| Cloudflare shows "Error 1001" | CNAME target typo — re-check S3 website endpoint spelling |
| SES `MessageRejected: Email address not verified` | Still in sandbox — verify recipient email or complete Phase 5 |
| `CORS error` on audio upload | Check `allowed_cors_origins` in tfvars matches your exact domain (no trailing slash) |
| DLQ CloudWatch alarm fires | Check `/ai-tutor/api` CloudWatch log group for evaluation errors; re-trigger batch |
| Deepgram transcription fails | Verify `DEEPGRAM_SECRET_KEY` is set; check Deepgram console for quota |
| `DYNAMODB_ASSESSMENT_TABLE not found` | Terraform didn't apply yet, or env var not set on EC2 |

---

## Ongoing deployments (after first launch)

**Backend code changes:**
```bash
# On EC2:
cd /home/ubuntu/app
git pull
docker compose build api
docker compose up -d api
```

**Frontend changes:**
```bash
# Local:
./scripts/deploy-assessment-frontends.sh
```

**Infrastructure changes:**
```bash
cd terraform/assessment
terraform plan
terraform apply
```
