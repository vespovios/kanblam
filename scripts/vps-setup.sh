#!/usr/bin/env bash
#
# KanBlam VPS host provisioning — fresh Ubuntu 24.04 LTS.
#
# Prepares the *host* only: Docker, a non-root deploy user, swap, light
# hardening, and the local backup directory. It does NOT clone the repo or
# create .env.prod — that's per-deploy and involves secrets; follow
# docs/runbooks/deployment.md for that part.
#
# Idempotent — safe to re-run.
#
# Usage (as root on the fresh box):
#   scp scripts/vps-setup.sh root@<vps-ip>:/root/
#   ssh root@<vps-ip>
#   bash /root/vps-setup.sh
#
# If your provider doesn't pre-install your key in /root/.ssh/authorized_keys
# (Contabo and similar password-root-by-default hosts), pass an explicit
# public key path:
#   bash /root/vps-setup.sh --pubkey /root/my-laptop.pub
#
set -euo pipefail

# ---- config (tweak before running if you like) ----------------------------
DEPLOY_USER="deploy"          # non-root user that owns /srv and runs docker
SWAP_SIZE="2G"                # swapfile size; build-time OOM insurance
BACKUP_DIR="/srv/kanblam-backups"   # pg-backup target (replaces the NAS mount)
# ---------------------------------------------------------------------------

# ---- arg parsing ----------------------------------------------------------
# Accepts: --pubkey /path/to/key.pub  OR  --pubkey=/path/to/key.pub
PUBKEY_PATH=""
while (( $# > 0 )); do
  case "$1" in
    --pubkey)
      PUBKEY_PATH="${2:-}"
      shift 2
      ;;
    --pubkey=*)
      PUBKEY_PATH="${1#*=}"
      shift
      ;;
    -h|--help)
      sed -n '2,21p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--pubkey /path/to/key.pub]" >&2
      exit 1
      ;;
  esac
done

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (or: sudo bash $0)." >&2
  exit 1
fi
if ! grep -qi ubuntu /etc/os-release; then
  echo "This script targets Ubuntu. Detected:" >&2
  grep PRETTY_NAME /etc/os-release >&2
  exit 1
fi

# ---- preflight: SSH key source for the deploy user -----------------------
# The deploy user is created with --disabled-password and added to docker +
# sudo. Without a working SSH key its account is unreachable — that's the
# Contabo trap. Fail HERE, before any system mutation, when we have no key
# source to offer.
#
# Skip the preflight on idempotent re-runs where the deploy user already
# has a working authorized_keys file.
if id "$DEPLOY_USER" >/dev/null 2>&1 \
   && [[ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]] \
   && [[ -z "$PUBKEY_PATH" ]]; then
  echo "==> $DEPLOY_USER already has authorized_keys; skipping key preflight."
elif [[ -n "$PUBKEY_PATH" ]]; then
  if [[ ! -f "$PUBKEY_PATH" ]]; then
    echo "ERROR: --pubkey '$PUBKEY_PATH' does not exist." >&2
    exit 1
  fi
  if ! grep -qE '^(ssh-(rsa|ed25519|ed25519-sk)|ecdsa-sha2-)' "$PUBKEY_PATH"; then
    echo "ERROR: '$PUBKEY_PATH' does not look like an OpenSSH public key." >&2
    echo "       Expected first token: ssh-ed25519, ssh-rsa, ecdsa-sha2-…" >&2
    exit 1
  fi
  echo "==> Will install key from $PUBKEY_PATH for $DEPLOY_USER"
elif [[ -s /root/.ssh/authorized_keys ]]; then
  echo "==> Will mirror /root/.ssh/authorized_keys to $DEPLOY_USER"
else
  cat >&2 <<EOF

ERROR: No SSH key source found for the new '$DEPLOY_USER' user.

  • /root/.ssh/authorized_keys is missing or empty.
  • --pubkey was not provided on the command line.

The deploy user is created without a password (key-only auth), so without
a key it'll be unreachable. Pick one of these and re-run:

  1. From your laptop, push your key to root first, then re-run:
       ssh-copy-id root@<this-vps-ip>
       bash $0

  2. Or pass an explicit public key file:
       scp ~/.ssh/id_ed25519.pub root@<this-vps-ip>:/root/
       bash $0 --pubkey /root/id_ed25519.pub

  3. Or, if you'll always log in as root and want to skip the deploy
     user: edit DEPLOY_USER above to "" and re-run. (Not recommended
     for production — keep root SSH for the bootstrap step only.)

EOF
  exit 1
fi

# ---- 1. base system --------------------------------------------------------
log "Updating base system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq ca-certificates curl git gnupg openssl ufw fail2ban \
  unattended-upgrades

# ---- 2. Docker (official repo — Ubuntu's docker.io lags) -------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine + Compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
else
  log "Docker already installed — skipping"
fi
systemctl enable --now docker

# ---- 3. deploy user --------------------------------------------------------
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  log "Creating deploy user: $DEPLOY_USER"
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG docker,sudo "$DEPLOY_USER"
  # Install the SSH key source resolved in preflight — either --pubkey or
  # mirrored from /root. Preflight already guarantees one exists.
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
    "/home/$DEPLOY_USER/.ssh"
  if [[ -n "$PUBKEY_PATH" ]]; then
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
      "$PUBKEY_PATH" "/home/$DEPLOY_USER/.ssh/authorized_keys"
    echo "  Installed key from $PUBKEY_PATH for $DEPLOY_USER."
  else
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
      /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
    echo "  Mirrored /root/.ssh/authorized_keys to $DEPLOY_USER."
  fi
else
  log "Deploy user $DEPLOY_USER already exists — ensuring group membership"
  usermod -aG docker,sudo "$DEPLOY_USER"
fi

# ---- 4. swap (build-time OOM insurance) ------------------------------------
if ! swapon --show | grep -q .; then
  log "Creating ${SWAP_SIZE} swapfile"
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Prefer RAM; only lean on swap under real pressure.
  sysctl -w vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
else
  log "Swap already active — skipping"
fi

# ---- 5. firewall + hardening ----------------------------------------------
# Cloudflare Tunnel means NO inbound app ports — only SSH needs to be open.
log "Configuring firewall (SSH only) + auto-updates"
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban
# Unattended security upgrades.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# ---- 6. directories --------------------------------------------------------
log "Creating /srv and the local backup directory"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" /srv
# pg-backup writes as uid 70 (postgres inside the container) — match it so
# the bind mount is writable without relaxing the container user.
install -d -o 70 -g 70 "$BACKUP_DIR"

# ---- done ------------------------------------------------------------------
log "Host provisioning complete"
cat <<EOF

Versions:
  $(docker --version)
  $(docker compose version)
  $(git --version)

Next steps (as the '$DEPLOY_USER' user — re-login so docker group applies):
  1. cd /srv && git clone <repo-url> kanblam && cd kanblam
  2. Follow docs/runbooks/deployment.md, with these VPS-specific overrides
     in .env.prod:
        NEXTAUTH_URL=https://kanblam.com
        APP_URL=https://kanblam.com
        BACKUP_HOST_PATH=$BACKUP_DIR
     (the runbook assumes the ZimaOS NAS path — use the local dir instead;
      add offsite backup sync later.)
  3. Set up the Cloudflare Tunnel public hostname -> http://web:3000
  4. docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \\
       --profile tunnel up -d --build
  5. Run scripts/create-workspace.ts three times for the beta accounts.

EOF
