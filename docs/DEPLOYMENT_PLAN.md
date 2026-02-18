# Deployment Runbook

## Goal

Deploy backend + frontends with a minimal, maintainable setup and CI/CD support.

## Current Recommended Shape

- Backend: FastAPI process on EC2 (or containerized equivalent)
- Frontends: static assets on S3 (+ optional CloudFront)
- Data services: Neo4j + DynamoDB + S3 per feature requirements

## Backend Deployment Checklist

1. Provision host and security groups.
2. Configure runtime env vars (`.env` or secrets manager).
3. Install dependencies and start backend (`python app.py` or process manager).
4. Verify health endpoint: `GET /health`.
5. Verify auth-protected endpoints with real token.

## Frontend Deployment Checklist

For each frontend app:

1. `npm ci`
2. `npm run build`
3. Upload build output to hosting target (S3/static host)
4. Configure API base URL for environment

## CI/CD Expectations

- Frontend workflow: build + publish static artifacts
- Backend workflow: build/deploy to target host
- Required secrets and vars should be scoped by environment

Recommended minimum:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- frontend bucket/target variables
- backend host/access mechanism variables

## Post-Deploy Verification

- `GET /health` returns `200`
- OpenAPI docs load
- Auth login/signup works
- Chat route responds
- Assessment/student routes enforce auth and return expected error envelope

## Hardening Priorities

- Enforce HTTPS for all public endpoints
- Restrict CORS by environment
- Move runtime secrets to managed secret storage
- Add monitoring/alerts for API health and deployment failures
# Deployment Runbook

## Goal

Deploy backend + frontends with a minimal, maintainable setup and CI/CD support.

## Current Recommended Shape

- Backend: FastAPI process on EC2 (or containerized equivalent)
- Frontends: static assets on S3 (+ optional CloudFront)
- Data services: Neo4j + DynamoDB + S3 per feature requirements

## Backend Deployment Checklist

1. Provision host and security groups.
2. Configure runtime env vars (`.env` or secrets manager).
3. Install dependencies and start backend (`python app.py` or process manager).
4. Verify health endpoint: `GET /health`.
5. Verify auth-protected endpoints with real token.

## Frontend Deployment Checklist

For each frontend app:

1. `npm ci`
2. `npm run build`
3. Upload build output to hosting target (S3/static host)
4. Configure API base URL for environment

## CI/CD Expectations

- Frontend workflow: build + publish static artifacts
- Backend workflow: build/deploy to target host
- Required secrets and vars should be scoped by environment

Recommended minimum:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- frontend bucket/target variables
- backend host/access mechanism variables

## Post-Deploy Verification

- `GET /health` returns `200`
- OpenAPI docs load
- Auth login/signup works
- Chat route responds
- Assessment/student routes enforce auth and return expected error envelope

## Hardening Priorities

- Enforce HTTPS for all public endpoints
- Restrict CORS by environment
- Move runtime secrets to managed secret storage
- Add monitoring/alerts for API health and deployment failures
# Deployment Plan (AWS, minimal + CI/CD)

## Status Key
- [ ] Not started
- [x] Completed

## Current Status
- Region: `ap-southeast-2`
- Traffic: ~1,000 views/month
- Neo4j: EC2, tiny dataset, memory capped
- Goal: cheapest workable deployment
- CI/CD: workflows added; backend deploy still blocked on connectivity

---

## Phase 1 — Infrastructure (Terraform)
- [x] Define final architecture (single EC2 + S3 static)
- [ ] Confirm domain decision (now or later)
- [x] Create Terraform variables file (`terraform/minimal/terraform.tfvars`)
- [x] Provision VPC + public subnet (default VPC)
- [x] Provision EC2 (`t4g.small` baseline)
- [x] Provision security groups (80/443 open, 22 locked to admin IP)
- [ ] Provision EBS volume + snapshot policy
- [x] Provision S3 bucket for frontend
- [ ] (Optional) Route 53 + ACM for domain

## Phase 2 — Server Bootstrap
- [x] Install Docker on EC2
- [x] Install Docker Compose on EC2
- [ ] Configure system updates and firewall basics
- [x] Create `.env` on EC2 with secrets
- [x] Add Neo4j memory caps
- [x] Add Nginx reverse proxy (80 -> app)

## Phase 3 — App Deployment
- [x] Add `docker-compose.yml` (API + Neo4j)
- [x] Start services with `docker compose up -d`
- [x] Start API with `venv` + `nohup`
- [x] Verify API health endpoint (`/health`)

## Phase 4 — Frontend Deployment
- [x] Build frontend (`npm run build`)
- [x] Upload `dist/` to S3
- [x] Verify frontend loads and can call API

## Phase 5 — CI/CD (GitHub Actions)
- [x] Add workflow for frontend build + S3 sync
- [x] Add workflow for backend deploy over SSH
- [x] Add workflow for backend deploy over SSM
- [ ] Add GitHub Secrets (AWS keys, SSH key)
- [ ] Add GitHub Variables (region, bucket, API base URL, EC2 host/user, EC2 instance id)
- [ ] Validate workflow on a test commit
- [ ] Migrate backend deploy to SSM (recommended)

Required GitHub Secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `EC2_SSH_KEY`

Required GitHub Variables:
- `AWS_REGION`
- `S3_BUCKET`
- `FRONTEND_API_BASE_URL`
- `EC2_HOST`
- `EC2_USER`
- `EC2_INSTANCE_ID`

Current CI/CD Blocker:
- SSH deploy fails (port 22 not reachable from GitHub runners).
- SSM deploy blocked because current AWS user lacks IAM permissions to create/attach role and instance profile via Terraform.

SSM migration needs one-time IAM permissions for the Terraform AWS principal:
- `iam:CreateRole`
- `iam:AttachRolePolicy`
- `iam:CreateInstanceProfile`
- `iam:AddRoleToInstanceProfile`
- `iam:PassRole`
- `iam:GetRole`, `iam:GetInstanceProfile`, `iam:ListAttachedRolePolicies`

## Phase 6 — Hardening & Ops
- [ ] Add HTTPS with domain (Route 53 + Let’s Encrypt on Nginx)
- [ ] Move secrets to SSM/Secrets Manager and rotate exposed keys
- [x] Add `systemd` service for backend (replace `nohup`)
- [ ] Add Neo4j memory caps
- [ ] (Optional) Replace manual setup with Docker Compose

## Phase 7 — Observability & Backups
- [ ] Enable CloudWatch logs/metrics
- [ ] Configure billing alarm
- [ ] Schedule EBS snapshots

---

## Notes / Decisions
- Instance size: start with `t4g.small`, move to `t4g.medium` if memory pressure occurs.
- Domain can be added later without re-architecting.
- CI/CD moving from SSH to SSM for better security/reliability.
- Deployment assets added: root `Dockerfile`, root `docker-compose.yml`, and `terraform/minimal/deploy_ec2_compose.sh`.
- Runtime hardening applied on EC2: `ai-tutor-compose.service` enabled and managing `docker compose up -d` at boot.
- Stray standalone Neo4j container removed; compose-managed Neo4j now publishes `7474/7687` with security-group restriction to admin IP.
