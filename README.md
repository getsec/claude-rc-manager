# Agent Manager

A local, single-user web control panel for [Claude Code](https://claude.com/claude-code)
sessions, one per repo, each running as a `systemd --user` service. It gives you a live
dashboard over `systemctl --user` and `journalctl`, one-click provisioning (clone,
pre-seed trust, enable the session), an interactive terminal into any session from the
browser, and a library of coordination protocols for running several sessions on one repo
without them stepping on each other. Sessions can optionally run in Claude Code's
remote-control (RC) mode, reachable from `claude.ai/code` anywhere.

It runs entirely on your own machine as your own user. No root, no cloud, no auth. Bind
it to loopback (the default) or add your LAN IP to reach it from other devices at home.

![Dashboard](assets/screenshots/dashboard.png)

## Requirements

- Linux with systemd (uses `systemctl --user`)
- Node.js 20+ (tested on 25/26)
- tmux, since every session runs inside a private tmux PTY (see "How sessions run")
- git
- The `claude` CLI, logged in (`claude /login`). Remote-control mode needs a full-scope
  login token; the interactive terminal doesn't.
- A directory of repos at `~/remote-projects` (override with `AM_REMOTE_ROOT`)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/getsec/claude-rc-manager/main/install.sh | bash
```

Checks the requirements above, clones to `~/agent-manager`, builds the SPA, and installs
and starts the `agent-manager` user service. It never uses sudo: everything lands under
`$HOME` and runs as your own user. If something is missing it tells you what, and stops
without changing anything.

Re-running it is also the update path. It pulls, rebuilds, and restarts in place, and
refuses if you have uncommitted changes in the checkout.

Set any of these on the pipe to override them:

```bash
curl -fsSL .../install.sh | AM_BIND=127.0.0.1,192.168.1.50 bash
```

| Var | Default | Meaning |
|-----|---------|---------|
| `AM_DIR` | `~/agent-manager` | Where to clone the source |
| `AM_BIND` | `127.0.0.1` | Hosts to bind (see the security note below) |
| `AM_PORT` | `8787` | Port |
| `AM_REMOTE_ROOT` | `~/remote-projects` | Where repos are cloned |
| `AM_BRANCH` | `main` | Branch to install |

Prefer to read before you pipe? `curl -fsSL .../install.sh -o install.sh`, read it, then
`bash install.sh`.

## Manual setup

The installer does all of this for you. These are the same steps by hand.

1. Let your user services run at boot and without an active login:
   ```bash
   loginctl enable-linger "$USER"
   ```
2. Backend deps: `cd backend && npm install`
3. Build the SPA: `cd frontend && npm install && npm run build`
4. Install and start the manager service (edit `ExecStart`'s node path if needed):
   ```bash
   cp deploy/agent-manager.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now agent-manager
   ```
   On first run the backend installs `~/.config/systemd/user/claude-rc@.service` and
   seeds a built-in `compose-portblock` coordination protocol.
5. Open `http://127.0.0.1:8787`.

After pulling backend or frontend changes, run `cd frontend && npm run build` then
`systemctl --user restart agent-manager`. The server doesn't hot-reload, and an
already-open browser tab keeps the old JS bundle until you refresh it too.

### Reaching it from other machines on your LAN

By default the server binds `127.0.0.1` only. To expose it on your home network, set
`AM_BIND` to a comma-separated list including your host's LAN IP, then restart:

```bash
mkdir -p ~/.config/systemd/user/agent-manager.service.d
printf '[Service]\nEnvironment=AM_BIND=127.0.0.1,192.168.1.50\n' \
  > ~/.config/systemd/user/agent-manager.service.d/override.conf
systemctl --user daemon-reload && systemctl --user restart agent-manager
```

**A session terminal is a real keyboard into that session.** There is no auth, so
anyone who can reach this port can type into every running Claude session, and
those sessions run commands. Only bind to a network you trust.

If a LAN machine times out reaching it, the app is almost never the cause; a wrong
bind gives "connection refused," not a timeout. Check your Wi-Fi AP's client/AP
isolation setting and that both machines are on the same subnet.

## Configuration (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `AM_BIND` | `127.0.0.1` | Comma-separated hosts to bind |
| `AM_PORT` | `8787` | Port |
| `AM_REMOTE_ROOT` | `~/remote-projects` | Where repos are cloned |
| `AM_STATIC` | _(unset)_ | Path to the built SPA (`frontend/dist`) to serve |
| `AM_PROTOCOLS_DIR` | `~/.config/agent-manager/protocols` | Coordination protocol library storage |

## Using the dashboard

### Session cards

One card per `claude-rc@<name>` systemd unit:

- Status dot and pill: `active/running` (green), `failed` (red), `activating` (amber),
  or `inactive/dead` (gray).
- `restarts: N · enabled|disabled · up Xh Ym`: the uptime badge only appears while the
  session is running.
- `⎇ <branch>`: the worktree's actual current git branch. When there's a diff against
  the project's primary branch, a `+N -M` stat (lines added and removed) follows it.
  Refreshes every 15s. A worktree session also shows its worktree tag on the same line.
- Actions: `start`, `stop`, `rst`, and `terminal`, which opens a live interactive
  terminal onto the session's tmux pane. Click it and type; only one is open at a time.
  `rc` toggles remote control for that session and lights up while it's on (see
  "Remote control, or just the terminal"). `open ↗` opens the session's live
  `claude.ai/code/session_…` URL in a new tab, and appears only when the session is
  both running and RC-enabled, since otherwise there's nothing to open. `delete`
  confirms first, then removes the session: a primary session's project, or just that
  one worktree session.

![Session terminal drawer](assets/screenshots/log-drawer.png)

### Projects panel

One row per cloned repo: its session chips (`default` plus any worktree branches, each
removable), a **Remove** button (blocked with a clear error if worktree sessions still
exist, so remove those first), and an **Add session** control for creating another
worktree session on a branch.

### Adding a repo

Paste a git URL in the header and hit **Add project**. The manager clones it into
`~/remote-projects`, pre-seeds trust in `~/.claude.json`, and enables its `claude-rc@`
session, streaming each step live.

Check **multi-session** before submitting to also set the project up for several
concurrent sessions (see below). Pick a coordination protocol from the dropdown and the
manager scaffolds the coordination worktree and drops `MULTI_AGENT.md` into the primary
session as part of the same flow.

![Add repo with multi-session enabled](assets/screenshots/add-repo-multisession.png)

## Remote control, or just the terminal

Every session runs Claude inside a private tmux server, which gives you two independent
ways to reach it. Remote control is optional, and off by default on new sessions.

### The interactive terminal (nothing to enable)

Hit **terminal** on any session card. You get a real terminal attached to that session's
tmux pane: type a prompt, hit Enter, press Escape to interrupt a runaway agent, arrow
through a permission dialog. Only one terminal is open at a time.

This works whether or not remote control is on, and needs no setup beyond the manager
itself. It reaches the session from any browser that can reach this host, which means
your own machine, plus your LAN if you set `AM_BIND`.

**If you only want to drive your agents from your own machine or your home network, you
don't need remote control at all.** Leave it off.

### Remote control (reaching a session from outside your network)

RC runs Claude with `--remote-control`, which registers the session with Claude's servers
and gives it a live `claude.ai/code/session_…` URL. That URL reaches the session from
anywhere, on your phone over cellular, without exposing this box to the internet.

That is the one thing RC buys you that the terminal can't. It needs the `claude` CLI
logged in with a full-scope token (`claude /login`).

Turn it on per session:

- **New project**: check **remote control** in the header before hitting **Add project**.
- **New worktree session**: the same checkbox in **Add session**, which defaults to
  whatever the project's primary session is using.
- **An existing session**: hit **rc** on the session card.

Toggling RC restarts the session, because systemd only reads `ExecStart` when the unit
starts, and **a restart costs the agent its in-memory context**. The confirm dialog says
so before it happens. Toggling a stopped session doesn't restart anything; it picks up
the new setting on its next start.

With RC on and the session running, **open ↗** appears on the card and opens that
session's `claude.ai/code` URL in a new tab.

### Where the setting lives

The manager writes one systemd drop-in per session, and that file *is* the state. There's
no mirrored copy in the manager's own JSON to disagree with it.

```ini
# ~/.config/systemd/user/claude-rc@<name>.service.d/rc.conf
[Service]
Environment="AM_RC_ARGS=--remote-control --remote-control-session-name-prefix <name>"
```

Turning RC off writes the same file with an empty `AM_RC_ARGS`. A session with *no*
drop-in defaults to RC on, so sessions predating this feature keep working as they did.

The quotes are load-bearing. Unquoted, systemd splits `Environment=` on whitespace and
parses the rest as further assignments, silently truncating the value to
`--remote-control` and dropping the session-name prefix.

## Coordination protocols and multi-session

Running more than one Claude session on the same repo at once (say, one on `main` and one
on a feature branch) requires the sessions to coordinate so they don't collide: claiming
distinct ports, distinct database names, and so on. Agent Manager doesn't do that
coordination itself. Instead it hands each session a written protocol
(`MULTI_AGENT.md`) and lets the agent follow it.

A protocol is a reusable, named Markdown template of coordination instructions, such as
"claim the next free port block in `SESSIONS.md`, use a unique `COMPOSE_PROJECT_NAME`."
Manage the library from the **Protocols** button in the header, where you can create,
duplicate, or edit protocols, including the seeded built-in `compose-portblock`. A
protocol can define `${VAR}` placeholders with defaults, overridable per project.

![Protocols library](assets/screenshots/protocols-editor.png)

Enabling multi-session on a project (at add-repo time, or later via the project's
**enable multi-session** button) scaffolds a `<name>-coord` git worktree with a
`SESSIONS.md` ledger, renders the chosen protocol into that project's own copy of
`MULTI_AGENT.md`, and drops it, along with a `CLAUDE.local.md` importing it, into every
worktree of that project. Both files are untracked, added to the repo's shared
`.git/info/exclude`, so they never show up in `git status` or enter your commit history.

Once multi-session is enabled, a `MULTI_AGENT.md` button opens an editor for that
project's own copy; edits re-drop into every live worktree on save. **re-sync from
protocol** discards local edits and re-renders from the library protocol's current
version.

![MULTI_AGENT.md editor](assets/screenshots/multiagent-editor.png)

If you add a session to a project that isn't multi-session yet, pick a protocol right
there and the manager enables multi-session and retries automatically.

Environment variables aren't propagated to sessions yet. It's planned.

## How sessions run

`claude` is an interactive command and needs a TTY. Run headless under a plain
`Type=simple` service, it falls into `--print` mode, does one shot, and exits. So each
session runs inside its own private tmux server (`tmux -L rc-<name>`), which supplies the
PTY and keeps every session in its own cgroup. Stopping one never touches another.

That private tmux server is also what the **terminal** button attaches to, over tmux
control mode (`tmux -C attach`), so no PTY is allocated in the manager and the project
keeps zero native dependencies.

To attach and inspect a session directly:
`tmux -L rc-<name> attach -t claude-rc-<name>` (detach with `Ctrl-b d`).

To verify isolation on the box, run `systemctl --user stop claude-rc@<a>`. A second
session `<b>` must stay online in the phone app.

## Known limitation

The dashboard shows systemd health (active, failed, restart count), not the Claude app's
"green dot" connection state, which lives in Claude's servers. Use the phone app's Code
tab for authoritative online status.
