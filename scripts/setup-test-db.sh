#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker/docker-compose.dev.yml"
DB_USER="${POSTGRES_USER:-tasker}"
DEV_DB="${POSTGRES_DB:-tasker}"
TEST_DB="${TEST_DATABASE_NAME:-tasker_test}"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://${DB_USER}:${POSTGRES_PASSWORD:-tasker}@localhost:5432/${TEST_DB}?schema=public}"

if [[ ! "${TEST_DB}" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Invalid TEST_DATABASE_NAME: ${TEST_DB}" >&2
  exit 1
fi

echo "Starting dev Postgres..."
docker compose -f "${COMPOSE_FILE}" up -d postgres >/dev/null

until docker compose -f "${COMPOSE_FILE}" exec -T postgres pg_isready -U "${DB_USER}" -d "${DEV_DB}" >/dev/null 2>&1; do
  echo "Waiting for Postgres..."
  sleep 1
done

if docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  psql -U "${DB_USER}" -d "${DEV_DB}" -tAc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'" | grep -q 1; then
  echo "Database ${TEST_DB} already exists."
else
  echo "Creating database ${TEST_DB}..."
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${DB_USER}" -d "${DEV_DB}" -c "CREATE DATABASE ${TEST_DB};" >/dev/null
fi

echo "Applying Prisma migrations to ${TEST_DB}..."
DATABASE_URL="${TEST_DATABASE_URL}" npx prisma migrate deploy

echo "Test database ${TEST_DB} is ready."
