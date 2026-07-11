#!/usr/bin/env bash
set -euo pipefail
until docker compose -f docker/docker-compose.dev.yml exec -T postgres pg_isready -U tasker -d tasker > /dev/null 2>&1; do
  echo "Waiting for Postgres..."
  sleep 1
done
echo "Postgres is ready."
