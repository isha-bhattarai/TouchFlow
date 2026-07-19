# TouchFlow

> Transform your smartphone into a wireless touchpad, keyboard and productivity remote for your computer.

![screenshots placeholder](docs/screenshots/placeholder.png)

## Features

- 🧩 **Shared typed protocol** — one source of truth for every message between phone and PC *(Milestone 0 ✅)*
- 🖱️ Realtime touchpad — move, click, drag, two-finger scroll *(coming: Milestone 2)*
- ⌨️ Full keyboard with special keys *(Phase 2)*
- 🎵 Media, presentation & macro remotes *(Phases 3–5)*
- 📁 File transfer & clipboard sync *(Phase 6)*

## Installation

```bash
git clone https://github.com/<you>/touchflow.git
cd touchflow
npm install
npm test
```

Requires Node ≥ 20.

## Architecture

```
touchflow/
├── packages/
│   └── shared/        # @touchflow/shared — protocol types, constants, guards
├── apps/              # mobile (Expo), agent (Electron), added in Milestone 1
└── .github/workflows/ # CI: typecheck + tests on every push
```

Phone and desktop agent both import `@touchflow/shared`, so protocol drift is impossible — a changed message shape fails the build on both sides.

## Roadmap

- [x] **M0** Project foundation — monorepo, shared protocol, CI
- [ ] **M1** Connection layer — LAN discovery, pairing, JWT sessions
- [ ] **M2** Realtime touchpad
- [ ] **M3** Phase 1 polish — dark mode, battery, reconnect
- [ ] **M4+** Phases 2–7

## License

MIT

## Contributors

- Isha Bhattarai — design & engineering
