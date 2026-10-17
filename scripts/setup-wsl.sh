#!/usr/bin/env bash
set -euo pipefail

# Run inside WSL. Clone source only; Linux dependencies must be installed there.
if ! grep -qi microsoft /proc/sys/kernel/osrelease; then
  printf '%s\n' 'Esegui questo script dal terminale WSL.' >&2
  exit 1
fi
command -v git >/dev/null || { printf '%s\n' 'Installa Git in WSL e riprova.' >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
windows_repo=$(cd -- "$script_dir/.." && pwd)
shared_repo="$(dirname -- "$windows_repo")/folio-sync.git"
target="${1:-$HOME/projects/folio}"

if [[ ! -d "$shared_repo" ]] || [[ "$(git --git-dir="$shared_repo" rev-parse --is-bare-repository)" != true ]]; then
  printf 'Repository condiviso non trovato: %s\n' "$shared_repo" >&2
  exit 1
fi
if [[ -e "$target" ]]; then
  printf 'La destinazione esiste già: %s\nNon è stata modificata.\n' "$target" >&2
  exit 1
fi
if ! git --git-dir="$shared_repo" rev-parse --verify refs/heads/main >/dev/null 2>&1; then
  printf '%s\n' 'Preparazione del repository di scambio dai sorgenti Windows...'
  git -C "$windows_repo" push "$shared_repo" refs/heads/main:refs/heads/main
fi
mkdir -p -- "$(dirname -- "$target")"
git clone --no-hardlinks --origin sync --branch main -- "$shared_repo" "$target"
git -C "$target" config core.autocrlf input
printf '\nCopia Linux creata: %s\n' "$target"
printf '%s\n' 'Le copie Windows e Linux condividono il remote Git chiamato sync.'

if command -v node >/dev/null && command -v npx >/dev/null; then
  if node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(process.platform === "linux" && (major > 22 || (major === 22 && minor >= 12)) ? 0 : 1)'; then
    printf '\nInstallazione delle dipendenze Linux...\n'
    if (cd -- "$target" && npx --yes pnpm@11.25.0 install --frozen-lockfile); then
      printf '\nPronto. Avvia l’interfaccia con:\n  cd "%s"\n  npx pnpm@11.25.0 dev\n' "$target"
    else
      printf '\nIl repository è stato copiato. Installazione dipendenze non riuscita; riprova dalla cartella Linux.\n' >&2
      exit 2
    fi
  else
    printf '\nIl repository è stato copiato. Per lo sviluppo serve Node Linux 22.12+ o 24+, non node.exe di Windows.\n'
  fi
else
  printf '\nIl repository è stato copiato. Installa Node.js in WSL, poi esegui nella cartella Linux:\n  npx --yes pnpm@11.25.0 install --frozen-lockfile\n'
fi
