# Oral Assessment Platform — Deployment Plan

## Architecture

```
Cloudflare DNS
├── app.chat9021.org          → S3 (ai-tutor-frontend)              [existing]
├── api.chat9021.org          → EC2 :443 → Nginx → :8000            [existing]
├── instructor.chat9021.org   → S3 (chat9021-instructor-app)         [NEW]
└── student.chat9021.org      → S3 (chat9021-student-app)            [NEW]

EC2 (t4g.small, ap-southeast-2)
└── Docker
    ├── FastAPI :8000   ← serves ALL routes for all apps
    └── Neo4j :7687     ← RAG vector store (ai-tutor only)

AWS Services (us-east-1)
├── DynamoDB: oral_assessments      [NEW — assessment data, jobs, results]
├── DynamoDB: auth_users            [NEW — instructor auth]
├── DynamoDB: chat_sessions         [existing — AI tutor chat]
├── S3: chat9021-assessment-files   [NEW — audio/video uploads, private]
├── S3: chat9021-instructor-app     [NEW — instructor frontend static site]
├── S3: chat9021-student-app        [NEW — student frontend static site]
├── SQS: ai-tutor-jobs              [existing — question gen + evaluation]
└── SES: chat9021.org identity      [NEW — invitation/reminder emails]

SSM Parameter Store (ap-southeast-2)
└── /ai-tutor/prod/*    [NEW — all app config and secrets; replaces .env editing]
```

**What's automated:**
- All AWS infrastructure via Terraform
- All deployments via GitHub Actions (push to `main` triggers backend + frontend workflows)
- Secret management via SSM — update a secret with one CLI command, no SSH

**What requires manual steps:**
- SES domain verification in Cloudflare DNS (tokens come from Terraform output)
- Populating SSM parameters (one-time setup)
- SES sandbox exit request to AWS

---

## Terraform modules

### `terraform/github-oidc/`
- GitHub Actions OIDC identity provider — replaces long-lived `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` with short-lived role credentials
- IAM role `github-actions-AI-Tutor-Agent` scoped to: SSM SendCommand to EC2, S3 sync to frontend buckets, CloudFront invalidation

### `terraform/assessment/`
- DynamoDB `oral_assessments` + `auth_users`
- S3 `chat9021-assessment-files` (private, presigned URL access)
- S3 `chat9021-instructor-app` + `chat9021-student-app` (public static websites)
- SES domain identity + DKIM for `chat9021.org`
- IAM inline policy on `ai-tutor-ec2-ssm-role`: DynamoDB, S3, SES, Bedrock, SSM Parameter Store read
- CloudWatch alarm on DLQ depth

---

## GitHub Actions workflows

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | PR + push to main | pytest, type-check, lint, Vitest, Playwright |
| `backend-deploy.yml` | push to main (`src/**`, `app.py`, etc.) | OIDC → SSM Run Command → EC2: git pull + load-ssm-env.sh + docker restart |
| `frontend-deploy.yml` | push to main (`ai-tutor-frontend/**`) | OIDC → build → S3 sync → CloudFront invalidation |
| `assessment-frontend-deploy.yml` | push to main (`oral-assessment-instructor/**`, `oral-assessment-student/**`, `shared/**`) | OIDC → build both → S3 sync (no CloudFront — Cloudflare handles HTTPS) |

---

## GitHub Actions settings reference

After completing Phase 0, your GitHub Actions configuration should look exactly like this.

### Secrets

| Secret | Status |
|--------|--------|
| `AWS_ACCESS_KEY_ID` | **DELETE** — replaced by OIDC |
| `AWS_SECRET_ACCESS_KEY` | **DELETE** — replaced by OIDC |
| `AUTH_JWT_SECRET` | **DELETE** — now in SSM |

No secrets remain after migration.

### Variables

| Variable | Action | Value | Used by |
|----------|--------|-------|---------|
| `AWS_DEPLOY_ROLE_ARN` | **ADD** | from `terraform/github-oidc` output | all deploy workflows |
| `INSTRUCTOR_APP_BUCKET` | **ADD** | `chat9021-instructor-app` | assessment-frontend-deploy |
| `STUDENT_APP_BUCKET` | **ADD** | `chat9021-student-app` | assessment-frontend-deploy |
| `AWS_REGION` | keep | `ap-southeast-2` | backend-deploy (EC2 region), frontend-deploy |
| `EC2_INSTANCE_ID` | keep | `i-0abc...` | backend-deploy (optional — falls back to tag lookup) |
| `S3_BUCKET` | keep | `chat9021` (verify your bucket name) | frontend-deploy (ai-tutor-frontend) |
| `FRONTEND_API_BASE_URL` | keep | `https://api.chat9021.org` | all three frontend builds |
| `VITE_GOOGLE_CLIENT_ID` | keep | `123...apps.googleusercontent.com` | ai-tutor-frontend build |
| `VITE_ANALYTICS_ENABLED` | keep | `true` | ai-tutor-frontend build |
| `AUTH_PASSWORD_RESET_BASE_URL` | **DELETE** | — | moved to SSM |
| `AUTH_PASSWORD_RESET_FROM_EMAIL` | **DELETE** | — | moved to SSM |
| `AUTH_PASSWORD_RESET_TOKEN_MINUTES` | **DELETE** | — | moved to SSM |
| `AUTH_PASSWORD_RESET_SES_REGION` | **DELETE** | — | moved to SSM |

> **Why these variables stay in GitHub and don't move to SSM:** They're needed before AWS authentication happens in the workflow (to configure which role to assume, which bucket to deploy to, or to bake values into the frontend JS bundle at build time). SSM can only be read after authenticating.

---

## Step-by-step deployment

### Phase 0 — GitHub Actions OIDC setup (one-time)

**0.1 Apply `terraform/github-oidc`**

```bash
cd terraform/github-oidc
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
github_org  = "your-org"
github_repo = "AI-Tutor-Agent"

frontend_s3_buckets = [
  "chat9021",                 # ai-tutor-frontend (verify this is the right bucket name)
  "chat9021-instructor-app",
  "chat9021-student-app",
]
```

```bash
terraform init
terraform apply
# Copy the role_arn output — you'll need it in the next step
```

**0.2 Update GitHub Actions → Settings → Secrets and variables → Actions**

**Secrets tab — delete all three:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AUTH_JWT_SECRET`

**Variables tab — add three new:**
- `AWS_DEPLOY_ROLE_ARN` = `<role_arn from terraform output>`
- `INSTRUCTOR_APP_BUCKET` = `chat9021-instructor-app`
- `STUDENT_APP_BUCKET` = `chat9021-student-app`

**Variables tab — delete four that moved to SSM:**
- `AUTH_PASSWORD_RESET_BASE_URL`
- `AUTH_PASSWORD_RESET_FROM_EMAIL`
- `AUTH_PASSWORD_RESET_TOKEN_MINUTES`
- `AUTH_PASSWORD_RESET_SES_REGION`

**Variables tab — verify these exist with correct values:**

| Variable | Expected value |
|----------|---------------|
| `AWS_REGION` | `ap-southeast-2` |
| `FRONTEND_API_BASE_URL` | `https://api.chat9021.org` |
| `S3_BUCKET` | your ai-tutor-frontend bucket name |
| `VITE_GOOGLE_CLIENT_ID` | your Google OAuth client ID |
| `VITE_ANALYTICS_ENABLED` | `true` |
| `EC2_INSTANCE_ID` | your EC2 instance ID (optional) |

---

### Phase 1 — Apply `terraform/assessment`

```bash
cd terraform/assessment
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` (bucket names must be globally unique in S3):
```hcl
assessment_files_bucket = "chat9021-assessment-files"
instructor_app_bucket   = "chat9021-instructor-app"
student_app_bucket      = "chat9021-student-app"
```

```bash
terraform init
terraform plan   # ~12 resources to create
terraform apply
```

**Save the full output** — you'll need these values in Phase 3:

| Output | Example value | Used for |
|--------|--------------|---------|
| `assessment_table_name` | `oral_assessments` | SSM param |
| `assessment_files_bucket` | `chat9021-assessment-files` | SSM param |
| `instructor_app_website_endpoint` | `chat9021-instructor-app.s3-website-us-east-1.amazonaws.com` | Cloudflare CNAME |
| `student_app_website_endpoint` | `chat9021-student-app.s3-website-us-east-1.amazonaws.com` | Cloudflare CNAME |
| `ses_verification_token` | `abc123...` | Cloudflare TXT record |
| `ses_dkim_tokens` | `["tok1", "tok2", "tok3"]` | Cloudflare CNAME × 3 |

> If `auth_users` table already exists: `terraform import aws_dynamodb_table.auth_users auth_users`

---

### Phase 2 — Add DNS records to Cloudflare

In Cloudflare → `chat9021.org` → DNS:

**Instructor and Student frontends** (Cloudflare proxied = HTTPS termination at Cloudflare, HTTP to S3):

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `instructor` | `<instructor_app_website_endpoint from output>` | Proxied (orange) |
| CNAME | `student` | `<student_app_website_endpoint from output>` | Proxied (orange) |

**SES domain verification** (enables sending from `@chat9021.org`):

| Type | Name | Content |
|------|------|---------|
| TXT | `_amazonses` | `<ses_verification_token from output>` |
| CNAME | `<tok1>._domainkey` | `<tok1>.dkim.amazonses.com` |
| CNAME | `<tok2>._domainkey` | `<tok2>.dkim.amazonses.com` |
| CNAME | `<tok3>._domainkey` | `<tok3>.dkim.amazonses.com` |
| MX | `mail` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
| TXT | `mail` | `v=spf1 include:amazonses.com ~all` |

Wait ~5–10 minutes. SES auto-verifies once it sees the TXT record.

---

### Phase 3 — Populate SSM Parameter Store

All backend env vars live here. The deploy workflow regenerates `.env` from SSM on every deploy — **no SSH, no `.env` editing ever again**.

Run once from your local machine (AWS CLI configured with admin credentials):

```bash
REGION=ap-southeast-2
SSM=/ai-tutor/prod

# ── Secrets — never stored in GitHub or visible in logs ─────────────────────

aws ssm put-parameter --region $REGION \
  --name "$SSM/AUTH_JWT_SECRET" \
  --value "$(openssl rand -hex 32)" --type SecureString

aws ssm put-parameter --region $REGION \
  --name "$SSM/DEEPGRAM_SECRET_KEY" \
  --value "dg_..." --type SecureString          # from Deepgram console

aws ssm put-parameter --region $REGION \
  --name "$SSM/NEO4J_PASSWORD" \
  --value "..." --type SecureString

# ── Derived from terraform/assessment output ────────────────────────────────

aws ssm put-parameter --region $REGION \
  --name "$SSM/DYNAMODB_ASSESSMENT_TABLE" --value "oral_assessments" --type String

aws ssm put-parameter --region $REGION \
  --name "$SSM/S3_ASSESSMENT_BUCKET" --value "chat9021-assessment-files" --type String

# ── Static backend config ────────────────────────────────────────────────────

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

Verify all 25 parameters were created:
```bash
aws ssm get-parameters-by-path --region ap-southeast-2 \
  --path /ai-tutor/prod/ --query 'Parameters[*].Name' --output table
```

---

### Phase 4 — First backend deploy

Trigger manually (or push any change to `main`):

```
GitHub → Actions → Deploy Backend → Run workflow
```

The workflow will:
1. Authenticate via OIDC (no stored credentials)
2. SSM Run Command to EC2:
   - `git reset --hard origin/main`
   - `./scripts/load-ssm-env.sh` — reads all SSM params, writes `.env`
   - `docker compose build --pull --no-cache api`
   - `docker compose up -d --force-recreate --no-deps api`
   - health + openapi checks

Verify:
```bash
curl https://api.chat9021.org/health
# Expected: {"status": "ok", ...}
```

---

### Phase 5 — First assessment frontend deploy

Trigger manually (or push any change to the relevant paths):

```
GitHub → Actions → Deploy Assessment Frontends → Run workflow
```

This builds `oral-assessment-instructor` and `oral-assessment-student` with `VITE_API_BASE_URL=https://api.chat9021.org` and syncs them to S3 with correct cache headers.

Verify:
```bash
curl -I https://instructor.chat9021.org   # Expected: HTTP/2 200
curl -I https://student.chat9021.org      # Expected: HTTP/2 200
```

> After this first deploy, both frontends deploy automatically on any push to `main` that touches `oral-assessment-instructor/**`, `oral-assessment-student/**`, or `shared/**`.

---

### Phase 6 — Exit SES sandbox (AWS takes 24–48 hours)

By default SES can only send to verified email addresses:

1. AWS Console → SES → Account dashboard → "Request production access"
2. Fill out:
   - Mail type: **Transactional**
   - Website URL: `https://instructor.chat9021.org`
   - Use case: "We send assessment invitation emails and answer submission receipts to students (~20 per assessment)."
3. Submit — AWS typically approves within 24 hours.

**Until approved** — verify student emails individually:
```bash
aws ses verify-email-identity --email-address student@example.com --region us-east-1
```

---

### Phase 7 — Smoke test

1. **Instructor login** → `https://instructor.chat9021.org`
2. **Create assessment** → fill title, course, due date
3. **Upload students** → CSV with name + email
4. **Generate questions** → click Generate, wait for SSE stream
5. **Send invitations** → verify emails arrive
6. **Student flow** → open invitation link → `https://student.chat9021.org/...`
7. **Submit answers** → text or audio for all questions
8. **Evaluate** → Evaluate All → watch per-student progress bars
9. **Release results** → instructor releases, student sees feedback

---

## Ongoing operations

### Code changes
Push to `main` — the relevant workflow fires automatically.

| Change | Workflow triggered |
|--------|--------------------|
| `src/**`, `app.py`, `requirements.txt` | Deploy Backend |
| `ai-tutor-frontend/**` | Deploy Frontend |
| `oral-assessment-instructor/**`, `oral-assessment-student/**`, `shared/**` | Deploy Assessment Frontends |

### Update a secret
No SSH, no redeploy needed to change the value. The next deploy picks it up automatically. For an immediate live reload without a code deploy:

```bash
# Update in SSM
aws ssm put-parameter --region ap-southeast-2 \
  --name /ai-tutor/prod/DEEPGRAM_SECRET_KEY \
  --value "new-key" --type SecureString --overwrite

# Either: trigger Deploy Backend from GitHub Actions
# Or: SSH to EC2 and reload without full redeploy
ssh ubuntu@<ec2-ip>
cd /home/ubuntu/AI-Tutor-Agent
./scripts/load-ssm-env.sh && docker compose up -d api
```

### Infrastructure changes
```bash
cd terraform/assessment   # or terraform/github-oidc
terraform plan
terraform apply
```

---

## Known gotchas

| Issue | Fix |
|-------|-----|
| `403 NoSuchBucket` on S3 website | Bucket name in tfvars must match exactly |
| Cloudflare "Error 1001" | CNAME target typo — re-check S3 website endpoint from `terraform output` |
| `MessageRejected: Email address not verified` | Still in SES sandbox — verify recipient or complete Phase 6 |
| `CORS error` on audio upload | `ALLOW_ORIGINS` SSM param must match exact domain, no trailing slash |
| DLQ CloudWatch alarm fires | Check CloudWatch log group `/ai-tutor/api` for errors; re-trigger batch |
| Deepgram transcription fails | Verify `DEEPGRAM_SECRET_KEY` in SSM; check Deepgram console quota |
| `DYNAMODB_ASSESSMENT_TABLE not found` | SSM param missing or `load-ssm-env.sh` not run — `cat .env` on EC2 to check |
| Deploy fails: `sha_mismatch` | EC2 can't reach GitHub — check security group egress rules |
| Deploy fails: `AWS_DEPLOY_ROLE_ARN` empty | Add as GitHub Actions **Variable** (not secret); run `terraform/github-oidc` first |
| Assessment frontend 404 on page refresh | S3 website `error_document` must be `index.html` (already set in Terraform) |
| Cloudflare HTTPS but S3 returns HTTP | This is expected — Cloudflare terminates TLS, proxies HTTP to S3 |
