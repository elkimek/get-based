#!/usr/bin/env bash
# Run all Get Based browser tests headlessly
# Starts a temp server, runs tests, kills server on exit

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=${PORT:-8000}
COVERAGE_ENABLED=0
if [ "$COVERAGE" = "1" ] || [ "$COVERAGE" = "true" ]; then
  COVERAGE_ENABLED=1
fi

# Start server if not already running. nohup + disown fully detaches it
# from the shell — signals sent to the shell's process group won't
# propagate. Log to /tmp so we can inspect if it ever dies unexpectedly.
SERVER_PID=""
if ! curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
  nohup node "$DIR/dev-server.js" "$PORT" > /tmp/dev-server.log 2>&1 < /dev/null &
  SERVER_PID=$!
  disown "$SERVER_PID" 2>/dev/null || true
  # Poll until listen actually succeeds — a plain sleep 1 was racy on
  # slower CI runners. 10s ceiling is defensive.
  for i in $(seq 1 40); do
    if curl -s -o /dev/null -m 1 "http://localhost:$PORT/"; then break; fi
    sleep 0.25
  done
  echo "Started server on :$PORT (PID $SERVER_PID)"
fi

# Assert dev-server is reachable — fail fast with a useful message if
# something killed it between startup and here. On CI we also tail its
# log for diagnostics.
ensure_server() {
  if ! curl -s -o /dev/null -m 2 "http://localhost:$PORT/"; then
    echo "dev-server on :$PORT not reachable — aborting"
    if [ -f /tmp/dev-server.log ]; then
      echo "--- /tmp/dev-server.log (last 40 lines) ---"
      tail -40 /tmp/dev-server.log
    fi
    exit 2
  fi
}

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && echo "Stopped server"
  return 0
}
trap cleanup EXIT

# Vitest covers pure-logic node-side tests — fastest fail-fast layer.
# The legacy node-side files are wrapped by tests/_vitest-legacy.test.js.
if [ "$COVERAGE_ENABLED" = "1" ]; then
  rm -rf "$DIR/tests/.vitest-coverage"
  npm test -- --coverage || exit 1
else
  npm test || exit 1
fi
ensure_server
# HTTP-reliant test before the browser suite (needs the dev server up).
PORT=$PORT node "$DIR/tests/test-dev-server-origin.js" || exit 1
PORT=$PORT npm run test:playwright || exit 1
if [ "$COVERAGE_ENABLED" = "1" ]; then
  : "${COVERAGE_MIN:=0}"
  export COVERAGE_MIN
  INCLUDE_VITEST_COVERAGE=1 PORT=$PORT node "$DIR/scripts/playwright-coverage.mjs" || exit 1
fi
