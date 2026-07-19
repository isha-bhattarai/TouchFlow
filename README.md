# TouchFlow

> Transform your smartphone into a wireless touchpad, keyboard and productivity remote for your computer.

![screenshots placeholder](docs/screenshots/placeholder.png)

## Features

- 🧩 **Shared typed protocol** — one source of truth for every message between phone and PC *(M0 ✅)*
- 🖥️ **Desktop agent** — Electron window with rotating 6-digit pairing code, JWT device auth, live device list *(M1 ✅)*
- 🖱️ Realtime touchpad — move, click, drag, two-finger scroll *(coming: M3)*
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

**Run the desktop agent:**

```bash
cd apps/agent
npm run dev:server   # headless — prints LAN address + pairing code
# or, with the window:
npm run build && npm start
```

## Architecture

```
touchflow/
├── packages/
│   └── shared/        # @touchflow/shared — protocol types, constants, guards
├── apps/
│   └── agent/         # Electron desktop agent — pairing server + status window
│       ├── src/server/  # Express + Socket.io, PairingService, JWT auth
│       ├── src/ui/      # React renderer (glass dark UI)
│       └── electron/    # main process
└── .github/workflows/ # CI: typecheck + tests on every push
```

Phone and desktop agent both import `@touchflow/shared`, so protocol drift is impossible — a changed message shape fails the build on both sides.

## Roadmap

- [x] **M0** Project foundation — monorepo, shared protocol, CI
- [x] **M1** Desktop agent — pairing server, JWT auth, agent window
- [ ] **M2** Mobile app — connect flow, token storage, status screen
- [ ] **M3** Realtime touchpad
- [ ] **M4+** Phases 2–7

## License

MIT

## Contributors

- Isha Bhattarai — design & engineering
