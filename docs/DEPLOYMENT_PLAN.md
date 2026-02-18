# Deployment Plan (Specific to chat9021.org + Current AWS Setup)

## Where you are now

You already have:

- Domain registered in Cloudflare: `chat9021.org`
- Backend running on EC2 (currently reachable via IP)
- Frontend deploy workflow to S3 (`.github/workflows/frontend-deploy.yml`)
- Backend deploy workflow via SSM (`.github/workflows/backend-deploy.yml`)
- AWS region in your setup: `us-east-1`

Target URLs:

- Frontend: `https://app.chat9021.org`
- API: `https://api.chat9021.org`

---

## Phase 0 — Collect the 3 values you need first

Before editing anything, collect these values:

1. EC2 Elastic IP for backend (you are currently using `3.27.56.110`)
2. CloudFront distribution domain for frontend (looks like `dxxxxx.cloudfront.net`)
3. Frontend S3 bucket name used by your GitHub variable `S3_BUCKET`

If you don’t know #2 or #3:

- #2: AWS Console → CloudFront → open your distribution → copy **Distribution domain name**
- #3: GitHub repo → Settings → Secrets and variables → Actions → Variables → `S3_BUCKET`

---

## Phase 1 — Create DNS records in Cloudflare (do this now)

Cloudflare → DNS → Records:

## Record A (API)

- Type: `A`
- Name: `api`
- IPv4 address: your EC2 Elastic IP (likely `3.27.56.110`)
- Proxy status: `DNS only` (grey cloud) for initial HTTPS setup
- TTL: Auto

## Record B (Frontend)

- Type: `CNAME`
- Name: `app`
- Target: your CloudFront domain (`dxxxxx.cloudfront.net`)
- Proxy status: `Proxied` (orange cloud)
- TTL: Auto

After saving, run:

```bash
nslookup api.chat9021.org
nslookup app.chat9021.org
```

You should see DNS answers (even before HTTPS is fully ready).

---

## Phase 2 — Frontend certificate + custom domain in AWS

This phase makes `https://app.chat9021.org` work with valid TLS.

## 2.1 Request ACM certificate (must be us-east-1)

1. AWS Console → ACM
2. Region: `us-east-1`
3. Request certificate → Public certificate
4. Domain: `app.chat9021.org`
5. Validation: DNS
6. Create

## 2.2 Validate certificate using Cloudflare DNS

1. Open cert details in ACM
2. Copy the CNAME validation record ACM gives you
3. Cloudflare DNS → Add that exact CNAME
4. Wait for status `Issued`

## 2.3 Attach cert + domain to CloudFront

1. AWS Console → CloudFront → your frontend distribution
2. Edit settings:
   - Alternate domain name (CNAME): `app.chat9021.org`
   - Custom SSL cert: select ACM cert for `app.chat9021.org`
3. Save and wait for deployment (can take several minutes)

Check:

```bash
curl -I https://app.chat9021.org
```

Expected: `HTTP/2 200` (or 403/404 from app origin if content misconfigured, but TLS should be valid).

---

## Phase 3 — API HTTPS on EC2 with Caddy

This phase makes `https://api.chat9021.org` serve your FastAPI backend.

## 3.1 Open security group ports

EC2 instance security group inbound rules:

- Allow TCP 80 from `0.0.0.0/0`
- Allow TCP 443 from `0.0.0.0/0`

## 3.2 Install and configure Caddy on EC2

SSH to EC2, then run:

```bash
sudo apt update
sudo apt install -y caddy
```

Write Caddyfile:

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
api.chat9021.org {
    reverse_proxy 127.0.0.1:8000
}
EOF
```

Enable and restart:

```bash
sudo systemctl enable caddy
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager
```

Caddy automatically obtains and renews Let’s Encrypt certs.

## 3.3 Verify API endpoint

From local machine:

```bash
curl -i https://api.chat9021.org/health
```

Expected: `200 OK`.

If not:

```bash
sudo journalctl -u caddy -n 200 --no-pager
```

---

## Phase 4 — Update app/env values (exact values for this repo)

## 4.1 Backend env (`.env` on EC2)

Set:

- `ALLOW_ORIGINS=https://app.chat9021.org`
- `GOOGLE_OAUTH_CLIENT_ID=857245714464-di2490hur8q4fcq19s4v1a8cnl3h39qd.apps.googleusercontent.com`

Then restart backend process/service.

## 4.2 Frontend runtime env

Set frontend API URL to custom API domain:

- `VITE_API_BASE_URL=https://api.chat9021.org`

For local FE testing, this goes in `ai-tutor-frontend/.env.development`.

## 4.3 GitHub Actions variables (repo settings)

GitHub → Settings → Secrets and variables → Actions → Variables:

- `AWS_REGION=us-east-1`
- `S3_BUCKET=<your-frontend-bucket>`
- `FRONTEND_API_BASE_URL=https://api.chat9021.org`
- `VITE_GOOGLE_CLIENT_ID=857245714464-di2490hur8q4fcq19s4v1a8cnl3h39qd.apps.googleusercontent.com`
- `EC2_INSTANCE_ID=<your-backend-instance-id>` (for backend workflow)

And Secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

---

## Phase 5 — Update Google OAuth origin (required)

Google Cloud Console → APIs & Services → Credentials → your OAuth Web Client:

Authorized JavaScript origins must include:

- `https://app.chat9021.org`
- `http://localhost:5173` (keep for local dev)

Save.

---

## Phase 6 — Deploy + verify in order

1. Trigger frontend deploy workflow (`Deploy Frontend`)
2. Trigger backend deploy workflow (`Deploy Backend`) if backend code/env changed
3. Open `https://app.chat9021.org`
4. Test login with Google
5. Test API directly:

```bash
curl -i https://api.chat9021.org/health
```

6. In browser devtools, confirm no CORS errors

---

## Quick troubleshooting

## Problem: `app.chat9021.org` cert invalid

- Ensure ACM cert is in `us-east-1`
- Ensure CloudFront uses that cert
- Ensure Cloudflare `app` CNAME points to CloudFront domain

## Problem: `api.chat9021.org` doesn’t respond

- Verify Cloudflare `api` record points to EC2 Elastic IP
- Verify SG allows 80/443
- Verify Caddy is running and proxying to `127.0.0.1:8000`

## Problem: Google popup works but backend rejects token

- Confirm backend has `google-auth` installed
- Confirm `GOOGLE_OAUTH_CLIENT_ID` matches frontend `VITE_GOOGLE_CLIENT_ID`
- Confirm Google OAuth origin includes `https://app.chat9021.org`

---

## Optional hardening after stable launch

- Change Cloudflare SSL mode to `Full (strict)`
- Add uptime checks for `/health`
- Add basic API rate limiting
- Move backend secrets from `.env` to AWS SSM/Secrets Manager
