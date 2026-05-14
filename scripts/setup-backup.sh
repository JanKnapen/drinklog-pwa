#!/usr/bin/env bash
# Run once as root on the host VM to install automated daily database backups.
# Re-running is safe (idempotent). Cron job survives reboots.
#
# Retention: last 5 daily backups + last 5 Monday (weekly) backups.
set -euo pipefail

# ── Configuration — edit and re-run to change ──────────────────
# Default backup dir is the home of the user who invoked sudo (not /root)
_INVOKING_USER="${SUDO_USER:-$USER}"
_INVOKING_HOME=$(getent passwd "$_INVOKING_USER" | cut -d: -f6)
BACKUP_DIR="$_INVOKING_HOME/backups/drinklog"
DOCKER_VOLUME="drinklog-pwa_db_data"
CRON_FILE="/etc/cron.d/drinklog-backup"
KEEP_DAILY=5
KEEP_WEEKLY=5
CRON_HOUR=3     # hour (UTC) the daily backup runs
# ───────────────────────────────────────────────────────────────

BACKUP_SCRIPT="$BACKUP_DIR/run-backup.sh"
DAILY_DIR="$BACKUP_DIR/daily"
WEEKLY_DIR="$BACKUP_DIR/weekly"

die() { echo "Error: $*" >&2; exit 1; }

install_if_missing() {
  dpkg -s "$1" >/dev/null 2>&1 && return
  echo "Installing $1..."
  apt-get update -qq && apt-get install -y -qq "$1"
}

[[ $EUID -eq 0 ]] || die "run as root: sudo $0"
command -v docker >/dev/null 2>&1 || die "docker not found in PATH — is Docker installed?"

install_if_missing sqlite3
install_if_missing cron
systemctl enable --now cron

# Resolve the database file path from the Docker volume
DB_MOUNT=$(docker volume inspect "$DOCKER_VOLUME" --format '{{.Mountpoint}}' 2>/dev/null) \
  || die "Docker volume '$DOCKER_VOLUME' not found. Start the app first: docker compose up -d"
DB_PATH="$DB_MOUNT/drinklog.db"

[[ -f "$DB_PATH" ]] \
  || echo "Note: $DB_PATH does not exist yet — backups will skip gracefully until the app creates it."

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"

# ── Write the daily backup runner ───────────────────────────────
# Single-quoted heredoc keeps the inner script literal; sed substitutes
# __PLACEHOLDERS__ so we avoid brittle \$ escaping throughout.
cat > "$BACKUP_SCRIPT" << 'EOF_BACKUP'
#!/usr/bin/env bash
set -euo pipefail

DB_PATH="__DB_PATH__"
DAILY_DIR="__DAILY_DIR__"
WEEKLY_DIR="__WEEKLY_DIR__"
KEEP_DAILY=__KEEP_DAILY__
KEEP_WEEKLY=__KEEP_WEEKLY__

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

if [[ ! -f "$DB_PATH" ]]; then
  log "DB not found at $DB_PATH — skipping"
  exit 0
fi

DATE=$(date +%Y-%m-%d)
DEST="$DAILY_DIR/drinklog-$DATE.db"

# sqlite3 .backup is an atomic hot backup — no need to stop the container
sqlite3 "$DB_PATH" ".backup $DEST"
log "Daily backup: $DEST"

# Copy to weekly dir on Mondays (ISO weekday 1)
if [[ $(date +%u) -eq 1 ]]; then
  cp "$DEST" "$WEEKLY_DIR/drinklog-$DATE.db"
  log "Weekly backup: $WEEKLY_DIR/drinklog-$DATE.db"
fi

# Prune: keep N newest by filename (YYYY-MM-DD is lexicographically chronological)
prune() {
  local dir=$1 keep=$2
  find "$dir" -maxdepth 1 -name '*.db' | sort -r | tail -n +$((keep + 1)) | xargs -r rm --
}
prune "$DAILY_DIR"  "$KEEP_DAILY"
prune "$WEEKLY_DIR" "$KEEP_WEEKLY"
EOF_BACKUP

sed -i \
  -e "s|__DB_PATH__|$DB_PATH|g" \
  -e "s|__DAILY_DIR__|$DAILY_DIR|g" \
  -e "s|__WEEKLY_DIR__|$WEEKLY_DIR|g" \
  -e "s|__KEEP_DAILY__|$KEEP_DAILY|g" \
  -e "s|__KEEP_WEEKLY__|$KEEP_WEEKLY|g" \
  "$BACKUP_SCRIPT"
chmod +x "$BACKUP_SCRIPT"

# ── Install the cron job ─────────────────────────────────────────
# /etc/cron.d/ is read by cron on startup, so this survives reboots.
cat > "$CRON_FILE" << EOF_CRON
# DrinkLog database backup — managed by scripts/setup-backup.sh
0 $CRON_HOUR * * * root $BACKUP_SCRIPT >> /var/log/drinklog-backup.log 2>&1
EOF_CRON
chmod 644 "$CRON_FILE"

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "Setup complete."
printf "  %-16s %s\n" "Backup script:"  "$BACKUP_SCRIPT"
printf "  %-16s %s\n" "Cron job:"       "$CRON_FILE  (daily at ${CRON_HOUR}:00 UTC)"
printf "  %-16s %s\n" "Daily backups:"  "$DAILY_DIR  (keep $KEEP_DAILY)"
printf "  %-16s %s\n" "Weekly backups:" "$WEEKLY_DIR  (keep $KEEP_WEEKLY)"
printf "  %-16s %s\n" "Log file:"       "/var/log/drinklog-backup.log"
echo ""
read -rp "Run a test backup now? [y/N] " ans || true
if [[ "${ans:-}" =~ ^[Yy]$ ]]; then
  "$BACKUP_SCRIPT" 2>&1 | tee -a /var/log/drinklog-backup.log
  echo "Test backup succeeded. Log: /var/log/drinklog-backup.log"
fi
