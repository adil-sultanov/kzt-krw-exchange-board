#!/bin/sh
# Starts as root only to hand the mounted database and backup directories to the app
# user (Docker creates missing bind-mount directories as root), then drops privileges.
set -e

data_dir=$(dirname "$DB_PATH")
mkdir -p "$data_dir"
chown -R app:app "$data_dir"
if [ -n "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    chown -R app:app "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"
fi

exec setpriv --reuid=app --regid=app --init-groups "$@"
