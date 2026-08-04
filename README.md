# Pi Calm

Pi Calm is a presentation-only extension for [Pi](https://github.com/earendil-works/pi) 0.83 or newer. It makes the interactive transcript quieter without changing model context, tool execution, session data, exports, or shared output.

When enabled, Calm:

- hides collapsed-thinking labels while preserving expandable reasoning;
- hides textual call/result rows for built-in and custom tools;
- keeps image results visible without their surrounding tool shell;
- uses one native spinner row: `⠙ Thinking...` for model work and `⠧ Working: read...` for tool execution;
- hides Blackhole observer/reflector/dropper running notices and post-compaction stats while preserving warnings, errors, and manual memory output;
- restores the complete stock transcript for `/export` and `/share`.

Calm is off by default. Run `/calm` to toggle it. The preference is stored as `on` or `off` in `~/.pi/agent/calm` with owner-only permissions.

## Install

```bash
pi install git:github.com/Ailurr/pi-calm
```

Reload an existing Pi session after installation:

```text
/reload
```

## Development

```bash
npm install
npm test
npm run typecheck
```

## Attribution

This repository is derived from the standalone Calm extension in [kunchenguid/dotfiles](https://github.com/kunchenguid/dotfiles/tree/main/home/.pi/agent/extensions/calm), which was adapted from Firstmate. The original MIT copyright and permission notice are preserved in `LICENSE` and source headers.
