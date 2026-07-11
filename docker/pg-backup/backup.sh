#!/bin/bash
# Daily pg_dump → gzip → /backups + retention prune + healthchecks.io ping.
# Sleeps until BACKUP_HOUR_UTC (24h, default 03), then loops once per day.
#
# bash + pipefail is load-bearing: without pipefail, `pg_dump | gzip` masks
# pg_dump failures behind gzip's exit code, producing a silent empty .gz
# and a false-positive healthchecks.io ping. The postgres:16-alpine image
# ships bash, so this is portable inside the container.
set -euo pipefail

: "${PGHOST:=postgres}"
: "${PGUSER:=tasker}"
: "${PGDATABASE:=tasker}"
: "${BACKUP_HOUR_UTC:=03}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${HEALTHCHECKS_BACKUP_UUID:=}"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "[pg-backup] FATAL: PGPASSWORD not set" >&2
  exit 1
fi
export PGHOST PGUSER PGDATABASE PGPASSWORD

mkdir -p /backups

run_backup() {
  ts=$(date -u +%Y%m%d-%H%M%S)
  out="/backups/tasker-${ts}.dump.gz"
  echo "[pg-backup] $(date -u -Iseconds) starting dump → ${out}"
  if pg_dump -Fc "${PGDATABASE}" | gzip > "${out}"; then
    echo "[pg-backup] $(date -u -Iseconds) dump complete: $(ls -lh "${out}" | awk '{print $5}')"
    find /backups -name 'tasker-*.dump.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
    if [ -n "${HEALTHCHECKS_BACKUP_UUID}" ]; then
      curl -fsS -m 10 --retry 3 "https://hc-ping.com/${HEALTHCHECKS_BACKUP_UUID}" > /dev/null \
        && echo "[pg-backup] healthchecks.io ping sent" \
        || echo "[pg-backup] WARN: healthchecks.io ping failed"
    fi
  else
    echo "[pg-backup] ERROR: pg_dump failed; not pinging healthchecks.io" >&2
    rm -f "${out}" 2>/dev/null || true
  fi
}

if [ "${1:-}" = "run-once" ]; then
  run_backup
  exit 0
fi

echo "[pg-backup] scheduling daily run at ${BACKUP_HOUR_UTC}:00 UTC, retention ${BACKUP_RETENTION_DAYS}d"
while true; do
  current_seconds=$(date -u +%s)
  target_today_seconds=$(date -u -d "$(date -u +%Y-%m-%d) ${BACKUP_HOUR_UTC}:00:00" +%s 2>/dev/null || \
    date -u -j -f "%Y-%m-%d %H:%M:%S" "$(date -u +%Y-%m-%d) ${BACKUP_HOUR_UTC}:00:00" +%s 2>/dev/null || \
    echo "")
  if [ -z "${target_today_seconds}" ]; then
    sleep_secs=3600
  elif [ "${current_seconds}" -ge "${target_today_seconds}" ]; then
    sleep_secs=$(( target_today_seconds + 86400 - current_seconds ))
  else
    sleep_secs=$(( target_today_seconds - current_seconds ))
  fi
  if [ "${sleep_secs}" -lt 0 ] || [ "${sleep_secs}" -gt 90000 ]; then
    sleep_secs=3600
  fi
  echo "[pg-backup] sleeping ${sleep_secs}s until next run"
  sleep "${sleep_secs}"
  run_backup
done
