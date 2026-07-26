# OpenWhispr Technical Reference for AI Assistants

> ## THIS IS A FORK, READ `FORK.md` FIRST
>
> Paul's personal push-to-talk fork. **Read `FORK.md` before changing anything**, in
> particular before touching transcription engines, AI providers, or build flags.
>
> Non-negotiables (full rationale in `FORK.md`, original wording in `docs/LESSONS.md`):
> - **No CUDA, ever.** Target machine is AMD Radeon 780M integrated (no NVIDIA GPU).
>   Never set `WHISPER_CUDA_ENABLED` or download CUDA binaries. **Vulkan is NOT banned**:
>   it is vendor-neutral and is the correct 780M path; both profiles run it enabled.
> - **Transcription stays on-device.** Defaults are Parakeet (sherpa-onnx, CPU/INT8);
>   upstream's cloud-OpenAI default would send audio off the machine.
> - **LLM cleanup is OFF by default** (`useCleanupModel: false`), it cost ~5.3s per
>   dictation. If re-enabled it stays local; nothing routes through upstream's hosted
>   `openwhispr` cleanup, and the Anthropic key in `.env` is unused.
> - **Never print a credential value** in any tool output.
>
> Fork divergence is defaults-only in `src/stores/settingsStore.ts` (tagged `// [fork]`),
> **plus one code change**: the ffmpeg bypass on the offline-Parakeet dictation path
> (`audioManager.js` + `parakeet.js`). See `FORK.md` before touching either.

## Quick Reference

| Thing | Value |
| --- | --- |
| Version | 1.7.6 (Electron 41, React 19, Tailwind v4, Vite; Node 24 pinned in `.nvmrc`) |
| Run | `npm run dev:main` (plain `npm run dev` is broken here, see `FORK.md`) |
| Build, Windows | `npm run prebuild:win` then `npm run build:win`; unsigned local pack is `npm run pack` |
| Tests | `node --test` over `test/` |
| Dictation hotkey | F8 (confirmed working on this machine) |
| Caches | `~/.cache/openwhispr/` (whisper-models, parakeet-models, embedding-models, qdrant-data) |
| Full reference | `docs/REFERENCE.md` |

## Architecture in Brief

Electron desktop dictation app. Two windows (a minimal always-on-top dictation overlay and a
full control panel) share one React codebase with URL-based routing. The main process owns IPC,
the SQLite history database and every sidecar; the renderer runs with context isolation behind
`preload.js`; a separate ONNX utility process hosts all `onnxruntime-node` inference so native
crashes confine to the worker and it respawns with backoff. Audio path is MediaRecorder to Blob
to ArrayBuffer to IPC to temp file to whisper.cpp or sherpa-onnx (Parakeet), with the temp file
deleted after. Local semantic search runs a Qdrant sidecar plus all-MiniLM-L6-v2 embeddings,
fused with FTS5 keyword hits and falling back to FTS5 alone. Per-file responsibilities, IPC
surface, schema and settings keys: `docs/REFERENCE.md`.

## Project-Specific Gotchas (one line each)

- Never use an Alt key as the dictation hotkey on Windows: it silently eats the paste.
- `npm run dev` is broken here (a `concurrently` cwd bug); use `npm run dev:main`.
- Always run `npm install` on Node 24, or the regenerated `package-lock.json` breaks `npm ci` in CI.
- Run `npm run download:whisper-cpp` before packaging, and keep FFmpeg unpacked from the ASAR.
- The macOS Dock icon follows the control panel and its state must be reported explicitly, never derived from window show/hide events (those are occlusion events).
- If Qdrant or the embedding model is missing, semantic search silently degrades to FTS5 keyword search, and it is only reachable through the agent's `search_notes` tool.
- Meeting detection falls back from event-driven to polling whenever a native listener binary is absent, so check the debug log for "event-driven" before believing it.
- Every user-facing string needs an i18n key in all locale files; never hardcode UI text.
- Push-to-talk is unavailable on GNOME and Hyprland Wayland (a native shortcut fires one toggle, not key-down and key-up).
- Longer write-ups for all of the above, plus the seven standing failure modes: `docs/LESSONS.md`.

## Where Credentials Live

- 12 secrets (7 BYOK API keys plus 5 enterprise cloud creds, listed as `SECRET_KEYS` in `src/helpers/environment.js`) are encrypted at rest via Electron `safeStorage` into the OS keychain and stored as per-key files under `userData/secure-keys/`. Linux without a keyring falls back to plaintext.
- Non-secret settings persist to `.env` via `saveAllKeysToEnvFile()`: `LOCAL_TRANSCRIPTION_PROVIDER`, `PARAKEET_MODEL`, `VOICE_AGENT_KEY`, `OPENWHISPR_LOG_LEVEL`.
- CLI bridge bearer token: `~/.openwhispr/cli-bridge.json` (loopback only, ports 8200 to 8219).
- Never print, echo, or copy a credential value into output, a file, or a commit.

## Where the Detail Went

| Topic | File |
| --- | --- |
| Upstream technical reference: file structure, helper modules, components, hooks, services, whisper.cpp and Parakeet integration, semantic search, FFmpeg, database schema, settings keys, language and model catalogues, API integrations, debug mode, push-to-talk, custom dictionary, Wayland hotkeys, meeting detection, voice agent, i18n rules, testing checklist, platform notes, code style, performance and security notes | `docs/REFERENCE.md` |
| Build script inventory and per-platform build targets | `docs/DEPLOY.md` |
| Fork non-negotiables in their original wording, and the seven Common Issues and Solutions write-ups | `docs/LESSONS.md` |
| Fork rationale, divergence detail, dev workaround | `FORK.md` |
| Feature history and release notes | `CHANGELOG.md` |
| Outbound hosts the app needs | `docs/network-allowlist.md` |
| Debugging, first-run setup, troubleshooting | `DEBUG.md`, `QUICKSTART.md`, `LOCAL_WHISPER_SETUP.md`, `TROUBLESHOOTING.md` |
| Most recent session handoff | `State of the Union 2026-07-20 18-58.md` |
