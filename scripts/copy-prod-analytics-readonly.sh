#!/usr/bin/env bash
# Export analytics events (and api_keys) from production MongoDB and restore
# them into a local database. Production is only read. Restore refuses any
# target that is not localhost.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Copy prod analytics into a local MongoDB. Production is read-only.

Required:
  PROD_MONGODB_URI   Production URI (Secret Manager analytics-mongodb-uri).
                     Used only with mongodump.
  LOCAL_MONGODB_URI  Must be mongodb://127.0.0.1:27017 or mongodb://localhost:27017
                     (database name optional). Used only with mongorestore.

Optional:
  PROD_MONGODB_DB    Source database. Default: analytics
  LOCAL_MONGODB_DB   Target database. Default: analytics-dev
  API_KEYS           Comma-separated apiKey values. Limits events and api_keys.
                     Omit to copy both collections in full.

The script exits before dumping if the URIs are equal, the source host is
local, or the target host is not 127.0.0.1 or localhost.
EOF
  exit 0
fi

: "${PROD_MONGODB_URI:?Set PROD_MONGODB_URI to the production analytics Mongo URI (read-only).}"
: "${LOCAL_MONGODB_URI:?Set LOCAL_MONGODB_URI to a local URI such as mongodb://127.0.0.1:27017}"

PROD_MONGODB_DB="${PROD_MONGODB_DB:-analytics}"
LOCAL_MONGODB_DB="${LOCAL_MONGODB_DB:-analytics-dev}"

if ! command -v mongodump >/dev/null 2>&1 || ! command -v mongorestore >/dev/null 2>&1; then
  echo "mongodump and mongorestore are required (MongoDB Database Tools)." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to check the connection hosts before any dump." >&2
  exit 1
fi

python3 - "$PROD_MONGODB_URI" "$LOCAL_MONGODB_URI" "$PROD_MONGODB_DB" "$LOCAL_MONGODB_DB" <<'PY'
import sys

def host_of(uri: str) -> str:
    if "://" not in uri:
        sys.exit("Refusing: a Mongo URI is missing its scheme.")
    rest = uri.split("://", 1)[1]
    if "@" in rest:
        rest = rest.split("@", 1)[1]
    hostport = rest.split("/", 1)[0]
    host = hostport.split(",")[0].split(":")[0].strip().lower()
    return host

prod, local, prod_db, local_db = sys.argv[1:5]
if prod == local:
    sys.exit("Refusing: PROD_MONGODB_URI and LOCAL_MONGODB_URI are identical.")
if prod_db == local_db and host_of(prod) == host_of(local):
    sys.exit("Refusing: source and target database names match on the same host.")

ph, lh = host_of(prod), host_of(local)
if ph in {"localhost", "127.0.0.1", "::1"}:
    sys.exit("Refusing: PROD_MONGODB_URI points at a local host. The variables look swapped.")
if lh not in {"localhost", "127.0.0.1", "::1"}:
    sys.exit(f"Refusing: LOCAL_MONGODB_URI host is {lh!r}. Restore only to localhost.")
if ph == lh:
    sys.exit("Refusing: source and target hosts match.")
print(f"Read-only source host: {ph} db={prod_db}", file=sys.stderr)
print(f"Write target host: {lh} db={local_db}", file=sys.stderr)
PY

query=""
if [[ -n "${API_KEYS:-}" ]]; then
  query="$(API_KEYS="$API_KEYS" python3 - <<'PY'
import json, os
keys = [k.strip() for k in os.environ["API_KEYS"].split(",") if k.strip()]
if not keys:
    raise SystemExit("API_KEYS was set but empty.")
print(json.dumps({"apiKey": {"$in": keys}}))
PY
)"
fi

workdir="$(mktemp -d "${TMPDIR:-/tmp}/pulzivo-analytics-copy.XXXXXX")"
cleanup() { rm -rf "$workdir"; }
trap cleanup EXIT

dump_collection() {
  local collection="$1"
  local -a args=(
    --uri="$PROD_MONGODB_URI"
    --db="$PROD_MONGODB_DB"
    --collection="$collection"
    --readPreference=secondaryPreferred
    --gzip
    --out="$workdir/dump"
  )
  if [[ -n "$query" ]]; then
    args+=(--query="$query")
  fi
  mongodump "${args[@]}"
}

echo "Dumping ${PROD_MONGODB_DB}.events (read-only)..." >&2
dump_collection events
echo "Dumping ${PROD_MONGODB_DB}.api_keys (read-only)..." >&2
dump_collection api_keys

echo "Restoring into ${LOCAL_MONGODB_DB} on the local URI only..." >&2
mongorestore \
  --uri="$LOCAL_MONGODB_URI" \
  --nsFrom="${PROD_MONGODB_DB}.*" \
  --nsTo="${LOCAL_MONGODB_DB}.*" \
  --gzip \
  --drop \
  "$workdir/dump"

echo "Local database ${LOCAL_MONGODB_DB} now has the exported events and api_keys." >&2
echo "Point analytics-api at this database. Do not set its MONGODB_URI to production." >&2
