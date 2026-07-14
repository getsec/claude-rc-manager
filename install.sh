#!/usr/bin/env bash
#
# Agent Manager installer.
#
#   curl -fsSL https://raw.githubusercontent.com/getsec/claude-rc-manager/main/install.sh | bash
#
# Re-running updates an existing install in place: pull, rebuild, restart.
#
# Overrides (all optional):
#   AM_DIR           where to clone            (default ~/agent-manager)
#   AM_BIND          hosts to bind, comma-sep  (default 127.0.0.1)
#   AM_PORT          port                      (default 8787)
#   AM_REMOTE_ROOT   where repos get cloned    (default ~/remote-projects)
#   AM_BRANCH        branch to install         (default main)
#
#   curl -fsSL https://raw.githubusercontent.com/.../install.sh | AM_BIND=127.0.0.1,192.168.1.50 bash
#
# Installs nothing system-wide and never asks for sudo: everything lands under
# $HOME and runs as your own user via `systemd --user`.

set -euo pipefail

REPO_URL="https://github.com/getsec/claude-rc-manager.git"
REPO_SLUG="claude-rc-manager"
NODE_MIN=20

AM_DIR="${AM_DIR:-$HOME/agent-manager}"
AM_BIND="${AM_BIND:-127.0.0.1}"
AM_PORT="${AM_PORT:-8787}"
AM_BRANCH="${AM_BRANCH:-main}"
AM_REMOTE_ROOT="${AM_REMOTE_ROOT:-}"

UNIT_DIR="$HOME/.config/systemd/user"
UNIT_NAME="agent-manager.service"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; YELLOW=''; DIM=''; RESET=''
fi

say()  { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()  { printf '%serror:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- preflight

# Per-distro install hint for a missing package, best-effort.
pkg_hint() {
  local pkg="$1" id=""
  [ -r /etc/os-release ] && id="$(. /etc/os-release 2>/dev/null && printf '%s %s' "${ID:-}" "${ID_LIKE:-}")"
  case "$id" in
    *debian*|*ubuntu*) printf 'sudo apt install %s' "$pkg" ;;
    *fedora*|*rhel*)   printf 'sudo dnf install %s' "$pkg" ;;
    *arch*)            printf 'sudo pacman -S %s' "$pkg" ;;
    *suse*)            printf 'sudo zypper install %s' "$pkg" ;;
    *alpine*)          printf 'sudo apk add %s' "$pkg" ;;
    *)                 printf 'install %s with your package manager' "$pkg" ;;
  esac
}

# Collect every problem before reporting, so one run tells you everything that
# is wrong rather than making you re-run five times.
preflight() {
  say "Checking requirements"
  local -a missing=()

  [ "$(uname -s)" = "Linux" ] || die "Agent Manager needs Linux with systemd (found $(uname -s))."

  if ! have systemctl || ! systemctl --user show-environment >/dev/null 2>&1; then
    die "no reachable 'systemctl --user' session.
    Agent Manager runs its sessions as systemd --user services, so this is required.
    If you are on a remote box, log in via SSH as a real user (not 'su'), or check
    that your distro ships systemd."
  fi

  have git  || missing+=("git — $(pkg_hint git)")
  have tmux || missing+=("tmux — $(pkg_hint tmux)")

  if ! have node; then
    missing+=("node ${NODE_MIN}+ — https://nodejs.org, or a version manager (nvm/mise/fnm)")
  else
    local major
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "$major" -lt "$NODE_MIN" ]; then
      # Distro packages routinely ship a node too old for this app; catch that
      # here rather than at runtime with a confusing syntax error.
      missing+=("node ${NODE_MIN}+ — found $(node -v). Your distro's package is too old;
      install a current node via nvm (https://github.com/nvm-sh/nvm),
      mise, fnm, or NodeSource (https://github.com/nodesource/distributions)")
    fi
  fi

  have npm || missing+=("npm — normally ships with node")

  if ! have claude; then
    missing+=("claude CLI — https://claude.com/claude-code
      then log in with:  claude /login")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    printf '\n%serror:%s missing %d requirement(s):\n\n' "$RED" "$RESET" "${#missing[@]}" >&2
    local m
    for m in "${missing[@]}"; do printf '  • %s\n' "$m" >&2; done
    printf '\nInstall the above, then re-run this installer.\n' >&2
    exit 1
  fi

  info "linux + systemd --user, git, tmux, node $(node -v), claude — ok"
}

# -------------------------------------------------------------------- fetch

fetch() {
  if [ -d "$AM_DIR/.git" ]; then
    local origin
    origin="$(git -C "$AM_DIR" remote get-url origin 2>/dev/null || echo '')"
    case "$origin" in
      *"$REPO_SLUG"*) ;;
      *) die "$AM_DIR is a git repo, but its origin is not $REPO_SLUG:
    $origin
    Refusing to touch it. Set AM_DIR=<somewhere-else> and re-run." ;;
    esac

    # Never clobber work in progress: a dirty tree here is someone's edits.
    if [ -n "$(git -C "$AM_DIR" status --porcelain 2>/dev/null)" ]; then
      die "$AM_DIR has uncommitted changes. Commit or stash them, then re-run."
    fi

    say "Updating existing install at $AM_DIR"
    git -C "$AM_DIR" fetch --quiet origin "$AM_BRANCH"
    if ! git -C "$AM_DIR" merge --ff-only "origin/$AM_BRANCH" --quiet 2>/dev/null; then
      die "cannot fast-forward $AM_DIR to origin/$AM_BRANCH (diverged history).
    Sort it out by hand, then re-run."
    fi
    info "at $(git -C "$AM_DIR" rev-parse --short HEAD) on $AM_BRANCH"

  elif [ -e "$AM_DIR" ] && [ -n "$(ls -A "$AM_DIR" 2>/dev/null)" ]; then
    die "$AM_DIR already exists and is not a $REPO_SLUG checkout.
    Refusing to overwrite it. Set AM_DIR=<somewhere-else> and re-run."

  else
    say "Cloning $REPO_SLUG into $AM_DIR"
    git clone --quiet --branch "$AM_BRANCH" "$REPO_URL" "$AM_DIR"
    info "at $(git -C "$AM_DIR" rev-parse --short HEAD) on $AM_BRANCH"
  fi
}

# -------------------------------------------------------------------- build

# npm ci is reproducible but needs a lockfile in sync with package.json.
npm_deps() {
  local dir="$1"
  if [ -f "$dir/package-lock.json" ]; then
    (cd "$dir" && npm ci --no-audit --no-fund --silent) && return 0
    warn "npm ci failed in $dir (lockfile out of sync?), falling back to npm install"
  fi
  (cd "$dir" && npm install --no-audit --no-fund --silent)
}

build() {
  say "Installing backend dependencies"
  npm_deps "$AM_DIR/backend"

  say "Installing frontend dependencies and building the SPA"
  npm_deps "$AM_DIR/frontend"
  (cd "$AM_DIR/frontend" && npm run build --silent)

  [ -d "$AM_DIR/frontend/dist" ] || die "frontend build produced no dist/ — cannot serve the UI."
  info "built $AM_DIR/frontend/dist"
}

# ------------------------------------------------------------------ service

# systemd runs the unit with a bare PATH, so ExecStart needs an absolute node.
# Version managers install to a version-pinned path (…/node/25.1.0/bin/node)
# that dies on the next upgrade, but most also publish a stable shim that always
# points at the current version — prefer that when we can find it.
resolve_node_bin() {
  local n shim
  n="$(command -v node)"
  case "$n" in
    */mise/installs/*)
      shim="${MISE_DATA_DIR:-$HOME/.local/share/mise}/shims/node"
      [ -x "$shim" ] && { printf '%s' "$shim"; return; }
      ;;
    */.asdf/installs/*)
      shim="${ASDF_DATA_DIR:-$HOME/.asdf}/shims/node"
      [ -x "$shim" ] && { printf '%s' "$shim"; return; }
      ;;
    */fnm/*|*/.fnm/*)
      shim="${FNM_DIR:-$HOME/.local/share/fnm}/aliases/default/bin/node"
      [ -x "$shim" ] && { printf '%s' "$shim"; return; }
      ;;
  esac
  printf '%s' "$n"
}

install_service() {
  say "Installing the systemd --user service"

  # Without linger the service dies when your last session logs out.
  if ! loginctl enable-linger "$USER" 2>/dev/null; then
    warn "could not enable linger for $USER — agent-manager will stop when you log out.
    Fix later with: sudo loginctl enable-linger $USER"
  fi

  local node_bin
  node_bin="$(resolve_node_bin)"
  info "node: $node_bin"

  # nvm and friends expose no stable path at all — the unit ends up pinned to
  # today's version and breaks silently on the next upgrade. Say so now.
  case "$node_bin" in
    */installs/node/*|*/.nvm/versions/*|*/versions/node/*)
      warn "this node path is pinned to the current version:
      $node_bin
    Upgrading node will break the service. Re-run this installer afterwards to
    repoint it (or edit ExecStart in $UNIT_DIR/$UNIT_NAME)."
      ;;
  esac

  mkdir -p "$UNIT_DIR"
  {
    cat <<EOF
[Unit]
Description=Agent Manager (Claude Code RC control panel)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$AM_DIR/backend
ExecStart=$node_bin src/server.js
Restart=on-failure
RestartSec=5
Environment=AM_STATIC=$AM_DIR/frontend/dist
EOF
    [ "$AM_BIND" != "127.0.0.1" ] && printf 'Environment=AM_BIND=%s\n' "$AM_BIND"
    [ "$AM_PORT" != "8787" ]      && printf 'Environment=AM_PORT=%s\n' "$AM_PORT"
    [ -n "$AM_REMOTE_ROOT" ]      && printf 'Environment=AM_REMOTE_ROOT=%s\n' "$AM_REMOTE_ROOT"
    cat <<'EOF'

[Install]
WantedBy=default.target
EOF
  } > "$UNIT_DIR/$UNIT_NAME"

  info "wrote $UNIT_DIR/$UNIT_NAME"

  systemctl --user daemon-reload
  if systemctl --user is-enabled "$UNIT_NAME" >/dev/null 2>&1; then
    systemctl --user restart "$UNIT_NAME"
    info "restarted $UNIT_NAME"
  else
    systemctl --user enable --now "$UNIT_NAME" >/dev/null 2>&1
    info "enabled + started $UNIT_NAME"
  fi
}

# ------------------------------------------------------------------- verify

bail_with_logs() {
  printf '\n%serror:%s %s\n\nLast log lines:\n\n' "$RED" "$RESET" "$1" >&2
  journalctl --user -u "$UNIT_NAME" -n 25 --no-pager >&2 || true
  printf '\nFull logs: journalctl --user -u %s -f\n' "$UNIT_NAME" >&2
  exit 1
}

verify() {
  say "Verifying"

  local first_host="${AM_BIND%%,*}" url i
  # A bare IPv6 literal needs brackets in a URL.
  case "$first_host" in
    *:*) url="http://[${first_host}]:${AM_PORT}/" ;;
    *)   url="http://${first_host}:${AM_PORT}/" ;;
  esac

  # Type=simple reports 'active' the moment it execs, before the port is
  # listening — so is-active alone proves nothing. Poll the actual HTTP
  # endpoint, which is the thing the user cares about.
  for i in $(seq 1 20); do
    systemctl --user is-failed --quiet "$UNIT_NAME" && bail_with_logs "$UNIT_NAME failed to start."
    if ! have curl; then
      systemctl --user is-active --quiet "$UNIT_NAME" && { info "service active (curl absent, skipped HTTP check)"; return; }
    elif curl -fsS --max-time 2 -o /dev/null "$url" 2>/dev/null; then
      info "service active, HTTP 200 from $url"
      return
    fi
    sleep 1
  done

  systemctl --user is-active --quiet "$UNIT_NAME" \
    || bail_with_logs "$UNIT_NAME is not running."
  bail_with_logs "$UNIT_NAME is running but never answered on $url after 20s."
}

report() {
  local first_host="${AM_BIND%%,*}"
  printf '\n%s%s Agent Manager is installed and running.%s\n\n' "$GREEN" "✓" "$RESET"
  printf '    UI:       %shttp://%s:%s%s\n' "$BOLD" "$first_host" "$AM_PORT" "$RESET"
  printf '    Source:   %s\n' "$AM_DIR"
  printf '    Logs:     journalctl --user -u %s -f\n' "$UNIT_NAME"
  printf '    Update:   re-run this installer\n\n'

  # We check that `claude` exists but not that it holds a valid token — that
  # would mean parsing its credential store. Say so instead of guessing.
  printf '    %sNext:%s if you have not already, log the claude CLI in:  %sclaude /login%s\n' \
    "$BOLD" "$RESET" "$BOLD" "$RESET"
  printf '          %sthen add a repo from the UI to create your first session.%s\n' "$DIM" "$RESET"

  case "$AM_BIND" in
    127.0.0.1|localhost|::1) ;;
    *)
      printf '\n%s%s⚠ AM_BIND is %s — not loopback-only.%s\n' "$BOLD" "$YELLOW" "$AM_BIND" "$RESET" >&2
      printf '%s  There is no authentication. A session terminal is a real keyboard into a\n' "$YELLOW" >&2
      printf '  running Claude session, and those sessions run commands. Anyone who can reach\n' >&2
      printf '  this host on port %s can type into every session you have running.\n' "$AM_PORT" >&2
      printf '  Only do this on a network you trust.%s\n' "$RESET" >&2
      ;;
  esac
  printf '\n'
}

main() {
  printf '\n%sAgent Manager installer%s\n' "$BOLD" "$RESET"
  printf '%sa local control panel for Claude Code remote-control sessions%s\n\n' "$DIM" "$RESET"
  preflight
  fetch
  build
  install_service
  verify
  report
}

# Called last, so a truncated download cannot execute a half-written script.
main "$@"
