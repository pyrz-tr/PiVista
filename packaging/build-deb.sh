#!/bin/bash
# Builds dist/pivista_<version>_all.deb. Pure JavaScript, so one package fits every Pi.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:-$(node -p "require('./package.json').version")}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

npm ci --omit=dev --no-audit --no-fund
mkdir -p "$STAGE/opt/pivista" "$STAGE/DEBIAN" dist
cp -r server ui system scripts package.json package-lock.json node_modules README.md "$STAGE/opt/pivista/"
sed "s/@VERSION@/$VERSION/" packaging/debian/control > "$STAGE/DEBIAN/control"
install -m 755 packaging/debian/postinst packaging/debian/prerm "$STAGE/DEBIAN/"
find "$STAGE/opt/pivista" -type d -exec chmod 755 {} +
dpkg-deb --root-owner-group --build "$STAGE" "dist/pivista_${VERSION}_all.deb"
echo "Built dist/pivista_${VERSION}_all.deb"
