#!/usr/bin/env bash
# Builds all frontend examples into a single dist/ directory for Vercel deployment.
# Each browser example is built with a base path matching its directory name.
# The landing page becomes the root (/).
#
# To add a new frontend:
#   1. Add a VITE_BASE="/<name>/" pnpm -F <name> build line below
#   2. Add a cp -r line to assemble it into dist/
#   3. Add a rewrite rule in vercel.json

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"

echo "Cleaning previous build..."
rm -rf "$DIST"

echo "Building landing page..."
pnpm -F './examples/00-landing-page' build

echo "Building 02-evm-simple-bridge..."
VITE_BASE="/02-evm-simple-bridge/" pnpm -F './examples/02-evm-simple-bridge' build

echo "Building 03-multichain-bridge-dapp..."
VITE_BASE="/03-multichain-bridge-dapp/" pnpm -F './examples/03-multichain-bridge-dapp' build

echo "Assembling site..."
mkdir -p "$DIST"
cp -r "$ROOT/examples/00-landing-page/dist/." "$DIST/"
cp -r "$ROOT/examples/02-evm-simple-bridge/dist" "$DIST/02-evm-simple-bridge"
cp -r "$ROOT/examples/03-multichain-bridge-dapp/dist" "$DIST/03-multichain-bridge-dapp"

# Brand assets at root level
cp "$ROOT/packages/shared-brand/assets/favicon.ico" "$DIST/favicon.ico"

# Verify assembly: every sub-app must have an index.html
ERRORS=0
for entry in \
  "$DIST/index.html" \
  "$DIST/02-evm-simple-bridge/index.html" \
  "$DIST/03-multichain-bridge-dapp/index.html" \
  "$DIST/favicon.ico"; do
  if [[ ! -f "$entry" ]]; then
    echo "ERROR: missing $entry"
    ERRORS=$((ERRORS + 1))
  fi
done

if [[ $ERRORS -gt 0 ]]; then
  echo "Site assembly failed: $ERRORS missing file(s)"
  exit 1
fi

echo "Site built to $DIST"
echo "  /                          -> landing page"
echo "  /02-evm-simple-bridge/     -> EVM Simple Bridge"
echo "  /03-multichain-bridge-dapp/ -> Multichain Bridge DApp"
