#!/usr/bin/env bash
set -euo pipefail

# Laravel Forge deployment script for HomeOps (Next.js standalone).
# Paste into the Forge site Deploy Script, then add a Daemon:
#   user: forge
#   directory: /home/forge/YOUR_SITE
#   command: node .next/standalone/server.js
#   environment: HOSTNAME=0.0.0.0 PORT=3010
# Restart that daemon at the end of this script (Forge will give you the supervisor name).

cd /home/forge/YOUR_SITE

git pull origin "$FORGE_SITE_BRANCH"

export NODE_ENV=production
npm ci
npm run build

# Forge daemon restart — replace with the name Forge shows for this site.
if command -v sudo >/dev/null && sudo -n supervisorctl status homeops-node >/dev/null 2>&1; then
  sudo supervisorctl restart homeops-node
fi
