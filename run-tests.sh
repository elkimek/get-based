#!/usr/bin/env bash
# Run all Get Based browser tests headlessly
# Starts a temp server, runs tests, kills server on exit

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
node "$DIR/scripts/local-full-suite-guard.mjs" || exit 2

PORT=${PORT:-8000}
REUSE_TEST_SERVER=${REUSE_TEST_SERVER:-0}
COVERAGE_ENABLED=0
if [ "$COVERAGE" = "1" ] || [ "$COVERAGE" = "true" ]; then
  COVERAGE_ENABLED=1
fi

if [ "$SKIP_TYPECHECK" != "1" ] && [ "$SKIP_TYPECHECK" != "true" ]; then
  npm run typecheck || exit 1
  npm run typecheck:checkjs || exit 1
  npm run typecheck:server || exit 1
  npm run typecheck:strict-null || exit 1
fi
npm run architecture:check || exit 1
npm run vendor:check || exit 1
npm run supply-chain:check || exit 1
node "$DIR/tests/verify-modules.js" || exit 1

# Reusing an arbitrary process on the requested port can mix the current tests
# with app files from another checkout. Only reuse when explicitly requested;
# otherwise move to the next available HTTP port and start a server we own.
server_reachable() {
  curl -s -o /dev/null -m 1 "http://localhost:$1/" 2>/dev/null
}

if server_reachable "$PORT" && [ "$REUSE_TEST_SERVER" != "1" ] && [ "$REUSE_TEST_SERVER" != "true" ]; then
  REQUESTED_PORT=$PORT
  PORT_FOUND=0
  for candidate in $(seq $((PORT + 1)) $((PORT + 50))); do
    if ! server_reachable "$candidate"; then
      PORT=$candidate
      PORT_FOUND=1
      break
    fi
  done
  if [ "$PORT_FOUND" != "1" ]; then
    echo "No available test port found after :$REQUESTED_PORT — aborting"
    exit 2
  fi
  echo "Port :$REQUESTED_PORT is already serving; using isolated test port :$PORT"
fi

# Start a server unless reuse was explicitly requested. nohup + disown fully
# detaches it from the shell, so signals sent to the shell's process group
# won't propagate. Log to /tmp so we can inspect if it dies unexpectedly.
SERVER_PID=""
if ! server_reachable "$PORT"; then
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
  rm -rf "$DIR/tests/.playwright-coverage"
  npm test -- --coverage || exit 1
else
  npm test || exit 1
fi
ensure_server
# HTTP-reliant test before the browser suite (needs the dev server up).
PORT=$PORT node "$DIR/tests/test-dev-server-origin.js" || exit 1
if [ "$COVERAGE_ENABLED" = "1" ]; then
  PLAYWRIGHT_REUSE_SERVER=1 PLAYWRIGHT_SUITE_COVERAGE=1 PLAYWRIGHT_COVERAGE_DIR="$DIR/tests/.playwright-coverage" PORT=$PORT npm run test:playwright || exit 1
else
  PLAYWRIGHT_REUSE_SERVER=1 PORT=$PORT npm run test:playwright || exit 1
fi
if [ "$COVERAGE_ENABLED" = "1" ]; then
  INCLUDE_VITEST_COVERAGE=1 REQUIRE_PLAYWRIGHT_COVERAGE_SHARDS=1 PLAYWRIGHT_COVERAGE_DIR="$DIR/tests/.playwright-coverage" PORT=$PORT node "$DIR/scripts/playwright-coverage.mjs" || exit 1
fi
