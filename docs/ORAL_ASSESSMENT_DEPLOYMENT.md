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

SSM Parameter Store (ap-southeast-2)
└── /ai-tutor/prod/*    [NEW — all app config and secrets, replaces .env editing]
```

All Terraform is automated except SES domain verification and Cloudflare DNS records.

Secrets are managed in **AWS SSM Parameter Store** — no secrets in GitHub, no SSH to update `.env`.

---

## What Terraform has already built

`terraform/assessment/` creates:
- DynamoDB `oral_assessments` — single-table for all assessment data
- DynamoDB `auth_users` — instructor auth records
- S3 `<assessment_files_bucket>` — private, CORS-enabled for presigned URLs
- S3 `<instructor_app_bucket>` — public static website
- S3 `<student_app_bucket>` — public static website
- SES domain identity for `chat9021.org` + DKIM
- IAM policy on existing EC2 role (`ai-tutor-ec2-ssm-role`) for DynamoDB, S3, SES, Bedrock, **SSM Parameter Store**
- CloudWatch alarm if DLQ accumulates failed jobs

`terraform/github-oidc/` creates:
- GitHub Actions OIDC identity provider — GitHub assumes an IAM role via short-lived tokens, **no stored AWS credentials needed**
- IAM role `github-actions-AI-Tutor-Agent` with least-privilege deploy permissions

---

## Step-by-step deployment

### Phase 0 — Set up GitHub Actions OIDC (one-time)

This replaces `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in GitHub secrets with a short-lived IAM role assumed via OIDC.

**0.1 Apply the github-oidc Terraform module**

```bash
cd terraform/github-oidc
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set github_org, github_repo, and your S3 bucket names
terraform init
terraform apply
# Note the role_arn output
```

**0.2 Update GitHub Actions settings**

In GitHub → repo → Settings → Secrets and variables → Actions:

| Action | Detail |
|--------|--------|
| Add **Variable** | `AWS_DEPLOY_ROLE_ARN` = `<role_arn from terraform output>` |
| Delete **Secret** | `AWS_ACCESS_KEY_ID` |
| Delete **Secret** | `AWS_SECRET_ACCESS_KEY` |
| Delete **Secret** | `AUTH_JWT_SECRET` (will live in SSM) |

Variables that stay in GitHub (not sensitive, used before AWS auth):

| Variable | Example value |
|----------|--------------|
| `AWS_REGION` | `ap-southeast-2` |
| `EC2_INSTANCE_ID` | `i-0abc123` (optional — falls back to tag lookup) |
| `FRONTEND_API_BASE_URL` | `https://api.chat9021.org` |
| `S3_BUCKET` | `chat9021` (ai-tutor-frontend bucket) |
| `VITE_GOOGLE_CLIENT_ID` | `123....apps.googleusercontent.com` |
| `VITE_ANALYTICS_ENABLED` | `true` |

---

### Phase 1 — Configure and run assessment Terraform

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

**Save this output** — you'll need the DNS record values and table/bucket names for the SSM step.

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

### Phase 3 — Populate SSM Parameter Store (replaces .env editing)

All app config and secrets live in SSM at `/ai-tutor/prod/`. The deploy workflow runs `scripts/load-ssm-env.sh` on each deploy to regenerate `.env` from SSM — **no SSH required** to update secrets.

Run these once from your local machine (AWS CLI configured with admin access):

```bash
REGION=ap-southeast-2
SSM=/ai-tutor/prod

# ── Secrets (SecureString) ──────────────────────────────────────────────────
# These are never stored in GitHub or visible in logs.

aws ssm put-parameter --region $REGION \
  --name "$SSM/AUTH_JWT_SECRET" \
  --value "$(openssl rand -hex 32)" --type SecureString

aws ssm put-parameter --region $REGION \
  --name "$SSM/DEEPGRAM_SECRET_KEY" \
  --value "dg_..." --type SecureString

aws ssm put-parameter --region $REGION \
  --name "$SSM/NEO4J_PASSWORD" \
  --value "..." --type SecureString

# ── Config derived from Terraform output ────────────────────────────────────
# Copy values from: cd terraform/assessment && terraform output

aws ssm put-parameter --region $REGION \
  --name "$SSM/DYNAMODB_ASSESSMENT_TABLE" --value "oral_assessments" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/S3_ASSESSMENT_BUCKET" --value "chat9021-assessment-files" --type String

# ── Static config ───────────────────────────────────────────────────────────

aws ssm put-parameter --region $REGION \
  --name "$SSM/AWS_DEFAULT_REGION" --value "us-east-1" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/AWS_REGION" --value "us-east-1" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/DYNAMODB_TABLE_NAME" --value "chat_sessions" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/DYNAMODB_REGION" --value "us-east-1" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/DYNAMODB_AUTH_USERS_TABLE" --value "auth_users" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/USE_DYNAMODB" --value "true" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/NEO4J_URI" --value "bolt://3.27.56.110:7687" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/NEO4J_USERNAME" --value "neo4j" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/NEO4J_DATABASE" --value "<your-neo4j-db-id>" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/BEDROCK_MODEL_CHAT" --value "amazon.nova-lite-v1:0" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/BEDROCK_MODEL_EMBED" --value "amazon.titan-embed-text-v2:0" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/BEDROCK_EMBED_DIM" --value "1024" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/AUTH_JWT_SECRET" --value "..." --type SecureString  # if not done above

aws ssm put-parameter --region $REGION \
  --name "$SSM/AUTH_ACCESS_TOKEN_MINUTES" --value "60" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/AUTH_PASSWORD_RESET_BASE_URL" \
  --value "https://app.chat9021.org/?reset=1" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/AUTH_PASSWORD_RESET_FROM_EMAIL" \
  --value "noreply@chat9021.org" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/AUTH_PASSWORD_RESET_TOKEN_MINUTES" --value "30" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/AUTH_PASSWORD_RESET_SES_REGION" --value "us-east-1" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/INVITE_FROM_EMAIL" --value "assessments@chat9021.org" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/ALLOW_ORIGINS" \
  --value "https://app.chat9021.org,https://instructor.chat9021.org,https://student.chat9021.org" \
  --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/LOG_FORMAT" --value "json" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/LOG_LEVEL" --value "INFO" --type String
```

**To update a secret later** (no SSH, no redeploy required unless you want it live immediately):
```bash
aws ssm put-parameter --region ap-southeast-2 \
  --name /ai-tutor/prod/DEEPGRAM_SECRET_KEY \
  --value "new-key" --type SecureString --overwrite
# Then push any change to main to trigger a deploy that reloads .env,
# OR SSH to EC2 and run: ./scripts/load-ssm-env.sh && docker compose up -d api
```

---

### Phase 4 — First deploy (triggers automatically or run manually)

Push to `main` or trigger `Deploy Backend` in GitHub Actions. The workflow will:
1. Authenticate via OIDC (no stored credentials)
2. Send SSM Run Command to EC2 that:
   - Pulls latest code
   - Runs `scripts/load-ssm-env.sh` → regenerates `.env` from SSM
   - Rebuilds and restarts the Docker container
   - Runs health checks

Verify health:
```bash
curl https://api.chat9021.org/health
# Expected: {"status": "ok", ...}
```

---

### Phase 5 — Deploy frontends to S3 (human action)

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

### Phase 6 — Exit SES sandbox (human action, AWS takes 24–48 hours)

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

### Phase 7 — Smoke test (human action)

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
| SES `MessageRejected: Email address not verified` | Still in sandbox — verify recipient email or complete Phase 6 |
| `CORS error` on audio upload | Check `ALLOW_ORIGINS` SSM parameter matches your exact domain (no trailing slash) |
| DLQ CloudWatch alarm fires | Check `/ai-tutor/api` CloudWatch log group for evaluation errors; re-trigger batch |
| Deepgram transcription fails | Verify `DEEPGRAM_SECRET_KEY` in SSM; check Deepgram console for quota |
| `DYNAMODB_ASSESSMENT_TABLE not found` | SSM parameter missing or `load-ssm-env.sh` not run; check with `cat .env` on EC2 |
| Deploy workflow fails: `sha_mismatch` | EC2 couldn't reach GitHub — check security group egress or git remote URL |
| Deploy workflow fails: `AWS_DEPLOY_ROLE_ARN` empty | Add `AWS_DEPLOY_ROLE_ARN` as a GitHub Actions **Variable** (not secret) |

---

## Ongoing deployments (after first launch)

**Backend code changes:**
```bash
# Push to main — GitHub Actions deploys automatically.
# load-ssm-env.sh runs as part of each deploy, so .env is always fresh.
```

**Update a secret without code change:**
```bash
aws ssm put-parameter --region ap-southeast-2 \
  --name /ai-tutor/prod/AUTH_JWT_SECRET \
  --value "new-secret" --type SecureString --overwrite
# Then trigger Deploy Backend manually in GitHub Actions, or:
# SSH to EC2: ./scripts/load-ssm-env.sh && docker compose up -d api
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
