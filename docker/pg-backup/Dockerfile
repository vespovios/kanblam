# syntax=docker/dockerfile:1.7
FROM postgres:16-alpine

# postgres image already has pg_dump + gzip + sleep + find.
# We add curl for the healthchecks.io ping.
RUN apk add --no-cache curl

COPY backup.sh /scripts/backup.sh
RUN chmod +x /scripts/backup.sh \
 && mkdir -p /backups \
 && chown postgres:postgres /backups

# Run as the existing postgres user (uid 70 in alpine) — non-root.
USER postgres
ENTRYPOINT ["/scripts/backup.sh"]
