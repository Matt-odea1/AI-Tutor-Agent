#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f docker-compose.yml ]]; then
  echo "Run this script from the repository root (AI-Tutor-Agent)."
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "No .env found. Creating minimal .env template..."
  cat > .env <<'EOF'
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=change-this-strong-password
NEO4J_URI=bolt://neo4j:7687
AWS_REGION=ap-southeast-2
ALLOW_ORIGINS=*
EOF
  echo "Created .env. Update secrets before exposing service to users."
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install Docker first."
  exit 1
fi

echo "Starting Neo4j + API stack..."
docker compose pull neo4j
docker compose build api
docker compose up -d

echo "Services status:"
docker compose ps

echo "API health check:"
curl -fsS http://localhost:8000/health && echo

echo "Done. Neo4j is reachable internally at bolt://neo4j:7687 and browser on host :7474 if port is exposed."
