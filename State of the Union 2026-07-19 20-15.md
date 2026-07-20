# State of the Union — 2026-07-19 20:15

## Project
- **Name:** open-whispr (fork of OpenWhispr/openwhispr)
- **Directory:** `D:\ClaudeCode\open-whispr`
- **Goal:** Personal push-to-talk dictation tool replacing Willow/Genspark Speechly. Hold `Ctrl+Win`, speak, release → cleaned text pasted at cursor. Fully on-device.

## Phase & Status
- **Current phase:** Setup complete — in daily use
- **Status:** Working end-to-end. Verified by Paul in Notepad + Chrome.

## What we accomplished this session
- Forked + cloned; `origin` → madeitincambodia/openwhispr, `upstream` → OpenWhispr/openwhispr
- Flipped defaults to a fully-local pipeline (see Decisions) — **nothing touches the network**
- Verified: 420ms transcription, 1169ms round-trip on 4.9s audio, CPU-only
- Built Windows installer: `dist/OpenWhispr Setup 1.7.6.exe` (234MB) + portable
- Wrote `FORK.md`, `QUICKSTART.md`, targeted stop script
- Registered 3 `Whispr:` routines + a `Whispr` group in the Command Centre launcher
- Committed + pushed `2cd9742c` + `a3e3ba38` to `origin/main`

## Files created or modified
- `src/stores/settingsStore.ts` — 6 default changes, each tagged `// [fork]`
- `FORK.md` — **new**, the fork's real doc (divergence, no-CUDA rule, upstream merges, bug workarounds)
- `QUICKSTART.md` — **new**, routines + prerequisites + build steps
- `CLAUDE.md` — 21-line fork warning at top; upstream's 822 lines left intact for clean merges
- `scripts/whispr-stop.ps1` — **new**, targeted dev-process kill
- `.claude/launch.json` — **new**, 3 `Whispr:` routines (force-added; `.claude/` is gitignored)
- `D:\ClaudeCode\PROJECTS.md` — row under *Python / Desktop Tools*
- `D:\ClaudeCode\docs\TECHNIQUES.md` — 3 entries
- `D:\ClaudeCode\launcher\routines.json` — **57 → 60**; ids `whispr-renderer`, `whispr-app`, `whispr-stop` (category `AI`)
- `D:\ClaudeCode\launcher\groups.json` — `Whispr` group (id `whispr`) referencing those 3. Gitignored user-state, so it lives on this machine only. Written with Paul's explicit approval.

## Open questions / blockers
- **`launcher/routines.json` is modified but UNCOMMITTED.** The `launcher` repo also has unrelated in-flight work from another session — `server/main.py`, `web/app.js`, `web/index.html`, `web/style.css`, untracked `server/skills.py`. **Commit `routines.json` alone**; do not sweep the rest in. Paul hasn't decided yet.
- `launcher/routines.json.bak` + `launcher/groups.json.bak` left as safety copies — delete once the Command Centre renders the Whispr group correctly.
- Cleanup model **actually active is `gemma-4-e4b` (5GB, 746ms)**, not the configured `llama-3.2-3b`. localStorage beats defaults. Switching may get round-trip under 1s — untested.
- History panel never spot-checked (upstream SQLite `transcriptions` table).

## Decisions made
- **Fully local, reversing the original brief.** Paul chose local LLM cleanup over Anthropic mid-session. `ANTHROPIC_API_KEY` remains in `.env` but is **unused**.
- **Defaults-only divergence.** Do NOT strip the 8-provider registry or patch `package.json` — both are high-churn upstream files; the merge cost exceeds the benefit.
- **`parakeet-unified-en-0.6b`** active (English specialist, 5.91% WER) over multilingual `parakeet-tdt-0.6b-v3` — both installed, one-click switch.
- **Kept ~6.9GB of GGUF models** as a deliberate offline fallback.
- **Left live OPENAI_API_KEY + GEMINI_API_KEY in `.env`** — Paul's call. They were absorbed into encrypted keychain storage on first launch and can now only be cleared via the app UI, not by editing `.env`.
- **No version/CHANGELOG bump** — version tracks upstream; bumping would conflict on the files upstream churns most.

## Next steps (pick up here)
1. **Verify the launcher.** Open the Command Centre, confirm the `Whispr` group shows all 3 routines and that "Whispr: Renderer (Vite)" then "Whispr: App (Electron)" actually launch the app. Then delete the two `.bak` files.
2. **Commit the registry** — `cd D:\ClaudeCode\launcher && git add routines.json && git commit` (that file ONLY — see blockers).
3. Switch cleanup model to `llama-3.2-3b-instruct-q4_k_m` in Settings → AI Models → Language Models; measure round-trip vs the 1169ms / 746ms baseline.
4. Spot-check the history panel lists past dictations.
5. Consider disabling the auto-started `llama-server` if local cleanup is ever turned off — it holds RAM/CPU for nothing.

**Nothing is broken.** The app works, is installed, is documented, and is pushed. Everything above is polish.

## Context to reload
- **NO CUDA, EVER.** AMD Radeon 780M integrated only. Never set `WHISPER_CUDA_ENABLED`/`WHISPER_VULKAN_ENABLED`, never download GPU whisper variants. Parakeet has no GPU path by construction.
- **`npm run dev` is BROKEN** — `concurrently` spawns children with the wrong cwd (fails in Git-Bash *and* cmd). Run Vite and Electron separately; see QUICKSTART.md.
- **`npm run build:win` FAILS WHILE EXITING 0** — Azure Trusted Signing needs a .NET SDK that isn't installed. Always check `ls dist/*.exe`, never the exit code. Use `electron-builder.unsigned-win.json`.
- **Defaults only bind a fresh profile.** Everything reads localStorage first — changing a default does nothing to an existing profile. This bit us twice.
- **Two separate model pickers.** Transcription models (Parakeet → `parakeet-models/`) vs AI models (GGUF → `models/`). Downloading from the wrong one cost 6.9GB.
- `transcriptionMode` must be `"local"` or the local model picker (and its NVIDIA tab) is **hidden entirely** — `SettingsPage.tsx` ~:376.
- **Never print a credential value** — trips a safety filter that freezes local execution tools for the session. Use `grep -c`, never `cat`.
- Upstream's Anthropic integration is sound if ever needed: `ipcHandlers.js:3579` calls `api.anthropic.com` **directly**, not via OpenRouter.
