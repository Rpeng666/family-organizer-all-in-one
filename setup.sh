#!/bin/bash

# Function to find the next available port
find_free_port() {
  local port=$1
  while true; do
    # Check if port is in use (ss is standard on linux, netstat is older fallback)
    if command -v ss >/dev/null 2>&1; then
      if ! ss -lnt | grep -q ":$port "; then break; fi
    else
      if ! netstat -na | grep -q ":$port "; then break; fi
    fi
    echo "   ⚠️  Port $port is busy, checking next..." >&2
    ((port++))
  done
  echo $port
}

# --- 1. PORT DETECTION ---
echo "🔍 Checking port availability..."

# Start checking from defaults
MINIO_PORT=$(find_free_port 9000)
# Start console port check from MINIO_PORT + 1 to avoid collision
MINIO_CONSOLE_PORT=$(find_free_port $((MINIO_PORT + 1)))

INSTANT_PORT=$(find_free_port 8888)
DASHBOARD_PORT=$(find_free_port 3000)
# Start App check AFTER dashboard port to ensure they don't collide if 3000 is free
APP_PORT=$(find_free_port $((DASHBOARD_PORT + 1)))

echo "✅ Ports Selected:"
echo "   - MinIO API:     $MINIO_PORT"
echo "   - MinIO Console: $MINIO_CONSOLE_PORT"
echo "   - InstantDB API: $INSTANT_PORT"
echo "   - Dashboard:     $DASHBOARD_PORT"
echo "   - Family Organizer:    $APP_PORT"

# --- 2. CONFIGURATION GENERATION ---
# Default App ID for self-hosting (can be anything UUID-like)
APP_ID="70000000-0000-0000-0000-000000000000"
USER_EMAIL="admin@local.com"

# Check if .env already exists
if [ -f .env ]; then
  echo "✅ .env file found. Updating port configurations..."
  # We update ports in existing .env or append if missing
  # Ideally, we regenerate the public vars but keep secrets.
  # For simplicity in this script, we re-source existing secrets 
  # but overwrite the port definitions below.
  source .env
else
  echo "📝 Generating new secure configuration..."
  DEVICE_KEY=$(openssl rand -hex 16)
  JWT_SECRET=$(openssl rand -hex 32)
  SESSION_SECRET=$(openssl rand -hex 32)
  MINIO_PASS=$(openssl rand -hex 12)
  S3_ACCESS_KEY_ID="minioadmin"
fi

# Write (or overwrite) the .env file with current Ports and Secrets
  cat > .env <<EOF
# --- Dynamic Port Config ---
MINIO_PORT=$MINIO_PORT
MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT
INSTANT_PORT=$INSTANT_PORT
DASHBOARD_PORT=$DASHBOARD_PORT
APP_PORT=$APP_PORT

# --- Public URL Config ---
NEXT_PUBLIC_INSTANT_APP_ID=$APP_ID
NEXT_PUBLIC_S3_ENDPOINT=http://localhost:$MINIO_PORT
NEXT_PUBLIC_INSTANT_API_URI=http://localhost:$INSTANT_PORT
NEXT_PUBLIC_INSTANT_WEBSOCKET_URI=ws://localhost:$INSTANT_PORT/runtime/session

# --- Secrets ---
DEVICE_ACCESS_KEY="${DEVICE_ACCESS_KEY:-$DEVICE_KEY}"
S3_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-$S3_ACCESS_KEY_ID}"
S3_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-$MINIO_PASS}"
INSTANT_JWT_SECRET="${INSTANT_JWT_SECRET:-$JWT_SECRET}"
INSTANT_SESSION_SECRET="${INSTANT_SESSION_SECRET:-$SESSION_SECRET}"
INSTANT_DB_PASSWORD="instant_password"
EOF
  
set -a; source .env; set +a

# --- START ---
echo "🚀 Starting Infrastructure..."
docker-compose up -d minio instant-postgres instant-server instant-client

# --- 4. ROBUST WAIT FOR DATABASE ---
echo "⏳ Waiting for InstantDB Server..."
MAX_RETRIES=100
COUNT=0

while true; do
  STATUS=$(docker inspect -f '{{.State.Status}}' instant-server 2>/dev/null)
  if [ "$STATUS" != "running" ]; then
     echo "❌ Error: instant-server container died."
     docker logs instant-server --tail 10
     exit 1
  fi

  # Check if tables exist
  if docker exec instant-postgres psql -U instant -d instant -c "SELECT to_regclass('public.apps');" 2>/dev/null | grep -q "apps"; then
    echo "✅ Database tables found!"
    break
  fi

  ((COUNT++))
  if [ $COUNT -ge $MAX_RETRIES ]; then
    echo "❌ Timeout waiting for InstantDB tables."
    echo "   Check logs: docker-compose logs instant-server"
    exit 1
  fi
  echo -ne "   Waiting... ($COUNT/$MAX_RETRIES)\r"
  sleep 5
done

# --- 5. INJECT APP CONFIG ---
echo -e "\n💉 Injecting App Configuration..."
docker exec -i instant-postgres psql -U instant -d instant <<EOF
-- Create User
INSERT INTO instant_users (id, email, created_at)
VALUES (gen_random_uuid(), '$USER_EMAIL', now())
ON CONFLICT (email) DO NOTHING;

-- Create App
INSERT INTO apps (id, title, creator_id, created_at)
VALUES ('$APP_ID', 'Family Organizer', (SELECT id FROM instant_users WHERE email = '$USER_EMAIL'), now())
ON CONFLICT (id) DO NOTHING;
EOF

# --- 6. START APP ---
echo "🚀 Building and Starting Family Organizer..."
docker-compose up -d --build family-organizer

echo "🎉 DEPLOYMENT COMPLETE!"
echo "---------------------------------------------------"
echo "📱 Family Organizer:     http://localhost:$APP_PORT"
echo "🎛️  Dashboard:      http://localhost:$DASHBOARD_PORT"
echo "🔐 Magic Link:     http://localhost:$APP_PORT/?activate=$DEVICE_ACCESS_KEY"
echo "🗄️  MinIO Console:  http://localhost:$MINIO_CONSOLE_PORT ($S3_ACCESS_KEY_ID / $S3_SECRET_ACCESS_KEY)"
echo "---------------------------------------------------"