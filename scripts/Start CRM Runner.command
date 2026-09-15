#!/bin/sh
cd "$(dirname "$0")/.." || exit 1
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js is required. Install it on this computer, then open this launcher again.'
  read -r answer
  exit 1
fi
node scripts/crm-runner.mjs
printf '%s\n' 'Press Enter to close.'
read -r answer
