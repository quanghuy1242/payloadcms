#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly DEFAULT_DB_FILE=".payload/data.sqlite"
readonly DEFAULT_OUT_DIR="./shared/db/generated"
readonly DRIZZLE_KIT_VERSION="0.31.5"
readonly DRIZZLE_ORM_VERSION="0.44.6"
readonly LIBSQL_CLIENT_VERSION="0.14.0"

DB_FILE="$DEFAULT_DB_FILE"
OUT_DIR="$DEFAULT_OUT_DIR"
MODE="fresh"
FORMAT_OUTPUT="true"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/drizzle-introspect.sh [--db FILE] [--out DIR] [--migrate | --fresh] [--no-format]

Defaults:
  --db         .payload/data.sqlite
  --out        ./shared/db/generated
  --fresh      Drop and recreate the SQLite DB before running all migrations
  --format     Format generated schema files with Prettier
EOF
}

log() {
  printf '[drizzle-introspect] %s\n' "$*"
}

die() {
  printf '[drizzle-introspect] %s\n' "$*" >&2
  exit 1
}

abspath() {
  local path="$1"

  if [[ -z "$path" ]]; then
    die "Path cannot be empty."
  fi

  if [[ "$path" == /* ]]; then
    printf '%s\n' "$path"
    return
  fi

  printf '%s\n' "$PWD/$path"
}

validate_safe_path() {
  local path="$1"

  case "$path" in
    ""|"/"|"."|"./"|".."|"../"|*/..|*/.)
      die "Refusing to use unsafe path: $path"
      ;;
  esac
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --)
        shift
        ;;
      --db)
        (($# >= 2)) || die "--db requires a file path."
        DB_FILE="$2"
        shift 2
        ;;
      --out)
        (($# >= 2)) || die "--out requires a directory path."
        OUT_DIR="$2"
        shift 2
        ;;
      --migrate)
        MODE="migrate"
        shift
        ;;
      --fresh)
        MODE="fresh"
        shift
        ;;
      --no-format)
        FORMAT_OUTPUT="false"
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done
}

run_payload_migrations() {
  local db_uri="file:$(abspath "$DB_FILE")"
  local db_dir
  db_dir="$(dirname "$(abspath "$DB_FILE")")"

  mkdir -p -- "$db_dir"

  log "Applying Payload migrations to $db_uri using mode: $MODE"

  local -a payload_env=(
    "PAYLOAD_DISABLE_DEPENDENCY_CHECKER=${PAYLOAD_DISABLE_DEPENDENCY_CHECKER:-true}"
    "PAYLOAD_SECRET=${PAYLOAD_SECRET:-local-secret}"
    "R2_ENDPOINT=${R2_ENDPOINT:-http://localhost:9000}"
    "R2_BUCKET_NAME=${R2_BUCKET_NAME:-local}"
    "R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:-local}"
    "R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY:-local}"
    "TURSO_DATABASE_URL=$db_uri"
    "TURSO_AUTH_TOKEN="
  )

  if [[ "$MODE" == "fresh" ]]; then
    env "${payload_env[@]}" pnpm payload migrate:fresh --forceAcceptWarning
    return
  fi

  env "${payload_env[@]}" pnpm payload migrate
}

run_drizzle_pull() {
  local abs_db_file
  abs_db_file="$(abspath "$DB_FILE")"

  validate_safe_path "$OUT_DIR"
  rm -rf -- "$OUT_DIR"
  mkdir -p -- "$OUT_DIR"

  log "Pulling Drizzle schema into $OUT_DIR"
  pnpm dlx \
    --package "drizzle-kit@${DRIZZLE_KIT_VERSION}" \
    --package "drizzle-orm@${DRIZZLE_ORM_VERSION}" \
    --package "@libsql/client@${LIBSQL_CLIENT_VERSION}" \
    drizzle-kit pull \
    --dialect sqlite \
    --url "file:${abs_db_file}" \
    --out "$OUT_DIR"
}

format_output() {
  if [[ "$FORMAT_OUTPUT" != "true" ]]; then
    return
  fi

  log "Formatting generated output with Prettier"
  pnpm exec prettier --write "$OUT_DIR"

  for file in "$OUT_DIR/schema.ts" "$OUT_DIR/relations.ts"; do
    if [[ -f "$file" ]] && ! head -n 1 "$file" | grep -q "@ts-nocheck"; then
      tmp_file="${file}.tmp"
      {
        printf '%s\n' '// @ts-nocheck'
        tail -n +1 "$file"
      } >"$tmp_file"
      mv "$tmp_file" "$file"
    fi
  done
}

main() {
  parse_args "$@"
  validate_safe_path "$DB_FILE"
  validate_safe_path "$OUT_DIR"

  run_payload_migrations
  run_drizzle_pull
  format_output

  log "Done"
}

main "$@"
