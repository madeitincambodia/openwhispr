# OpenWhispr — Quickstart

Push-to-talk dictation, fully on-device. Hold **`Ctrl+Win`**, speak, release → cleaned
text is pasted at your cursor. Nothing touches the network.

Full fork details, upstream-merge process, and the no-CUDA rule: **[FORK.md](FORK.md)**.

---

## Everyday use — just run the app

The packaged app needs none of the dev tooling below.

```
D:\ClaudeCode\open-whispr\dist\OpenWhispr Setup 1.7.6.exe
```

Unsigned, so SmartScreen warns on first run → **More info → Run anyway**.
Enable **Settings → General → Startup → "Launch at login"** to have it always available.

---

## Routines

### Whispr: Renderer (Vite)

Starts the Vite dev server for the React renderer on `127.0.0.1:5183`. Start this
**before** the Electron app — the main process expects the dev server to be up.

```bash
npm run dev:renderer
```

> **Do not use `npm run dev`.** It's broken — `concurrently`'s `npm:` shorthand spawns
> its children with the wrong working directory. Run the two routines separately.

### Whispr: App (Electron)

Launches the Electron main process in dev mode against the Vite server. Bypasses
`predev:main` so it doesn't re-run the asset-download chain on every launch.

```bash
npx cross-env NODE_ENV=development node scripts/run-electron.js --dev
```

### Whispr: Stop All

Stops stray OpenWhispr dev processes. Targeted: kills only processes listening on this
project's dev ports (5183 Vite, 6006 parakeet-ws, 6333 Qdrant, 8080 llama-server) or
running from an executable inside the project folder. **Never blanket-kills `node.exe`**,
so other projects' dev servers survive. Exits non-zero if a port is still held.

```powershell
powershell -NoProfile -File scripts\whispr-stop.ps1 -WhatIf   # dry run
powershell -NoProfile -File scripts\whispr-stop.ps1           # for real
```

Usually unnecessary — quitting the app cleans up its own sidecars. Use it after a hard
kill or when a dev process is stranded.

---

## Prerequisites

- **Node 24** (pinned in `.nvmrc`; nvm4w at `C:\nvm4w\nodejs`). Installing with a
  different major corrupts `package-lock.json` for CI.
- `npm install`, then `npm run predev` once to fetch runtime binaries.
- **Models are separate from runtimes.** `predev` fetches sherpa-onnx/Qdrant/VAD but
  **not** model weights. In-app: Settings → Speech-to-Text → **Local** → NVIDIA tab →
  download `parakeet-unified-en-0.6b` (~624MB).
- No C++ compiler needed — native binaries download as prebuilts.
- `.env` at the project root (git-ignored). `ANTHROPIC_API_KEY` is present but **unused**
  (cleanup is local).

## Building

```bash
npm run build:renderer
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win \
  --config electron-builder.unsigned-win.json
```

> **`npm run build:win` fails but still exits 0** — it tries Azure Trusted Signing and
> dies on the missing .NET SDK. Always check `ls dist/*.exe`, never the exit code.
