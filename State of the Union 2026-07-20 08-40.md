# State of the Union — 2026-07-20 08:40

## Project
- **Name:** open-whispr (fork of OpenWhispr/openwhispr)
- **Directory:** `D:\ClaudeCode\open-whispr`
- **Goal:** Personal push-to-talk dictation tool replacing Willow/Genspark Speechly. Hold `Ctrl+Win`, speak, release → cleaned text pasted at cursor. Fully on-device.

## Phase & Status
- **Current phase:** Setup complete — **awaiting install of the packaged app**
- **Status:** Working end-to-end in dev. Verified by Paul in Notepad + Chrome. Installer built but **not yet installed**.

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
- ~~launcher/routines.json uncommitted~~ — **DONE.** Committed as `b100092` ("registry: add OpenWhispr routines", 83 insertions, `routines.json` only) by a concurrent session and already pushed. `.bak` files cleaned up too. Nothing outstanding in the launcher repo for this project; the `web/*` changes still open there belong to other work.
- Cleanup model **actually active in DEV is `gemma-4-e4b` (5GB, 746ms)**, not the configured `llama-3.2-3b` — localStorage beats defaults. The **installed** app gets `llama-3.2-3b` automatically (fresh profile). Latency gain untested.
- **`openAsHidden` is macOS-only** — upstream's autostart handler (`ipcHandlers.js:2841`) passes it with a "Start minimized to tray" comment, but Windows ignores it, so the panel appears at login. Left unpatched; the Windows fix is `args: ['--hidden']` + startup handling, which would be the first fork change outside `settingsStore.ts`.
- History panel never spot-checked (upstream SQLite `transcriptions` table).

## Decisions made
- **Fully local, reversing the original brief.** Paul chose local LLM cleanup over Anthropic mid-session. `ANTHROPIC_API_KEY` remains in `.env` but is **unused**.
- **Defaults-only divergence.** Do NOT strip the 8-provider registry or patch `package.json` — both are high-churn upstream files; the merge cost exceeds the benefit.
- **`parakeet-unified-en-0.6b`** active (English specialist, 5.91% WER) over multilingual `parakeet-tdt-0.6b-v3` — both installed, one-click switch.
- **Kept ~6.9GB of GGUF models** as a deliberate offline fallback.
- **Left live OPENAI_API_KEY + GEMINI_API_KEY in `.env`** — Paul's call. They were absorbed into encrypted keychain storage on first launch and can now only be cleared via the app UI, not by editing `.env`.
- **No version/CHANGELOG bump** — version tracks upstream; bumping would conflict on the files upstream churns most.

## Next steps (pick up here)
1. **Install the app** — run `dist\OpenWhispr Setup 1.7.6.exe` (per-user, no admin; SmartScreen → More info → Run anyway). Click through onboarding, re-set hotkey to `Ctrl+Win`. **No model re-download** — they live in `~/.cache/openwhispr/`, outside userData.
2. **Enable startup** — Settings → General → Startup → "Launch at login". Reboot and confirm `Ctrl+Win` still dictates. Expect the panel to appear at login (`openAsHidden` is macOS-only — see blockers).
3. **Measure the installed app's cleanup latency.** It gets `llama-3.2-3b` automatically (fresh profile ⇒ fork defaults bind); dev is stuck on the 5GB `gemma-4-e4b` at 746ms. Compare against the 1169ms round-trip baseline.
4. Spot-check the history panel lists past dictations.
5. Once the installed app is confirmed good, stop using dev mode — the `Whispr:` launcher routines are dev-only.

**Nothing is broken.** The app works in dev, is documented, and is pushed. Everything above is finishing the move to the packaged build.

## Context to reload
- **NO CUDA, EVER.** AMD Radeon 780M integrated only. Never set `WHISPER_CUDA_ENABLED`/`WHISPER_VULKAN_ENABLED`, never download GPU whisper variants. Parakeet has no GPU path by construction.
- **`npm run dev` is BROKEN** — `concurrently` spawns children with the wrong cwd (fails in Git-Bash *and* cmd). Run Vite and Electron separately; see QUICKSTART.md.
- **`npm run build:win` FAILS WHILE EXITING 0** — Azure Trusted Signing needs a .NET SDK that isn't installed. Always check `ls dist/*.exe`, never the exit code. Use `electron-builder.unsigned-win.json`.
- **Defaults only bind a fresh profile.** Everything reads localStorage first — changing a default does nothing to an existing profile. This bit us twice, then worked in our favour: the installed app's empty profile picks up all the fork defaults correctly.
- **Installed ≠ dev profile.** `%APPDATA%\OpenWhispr` (packaged) vs `%APPDATA%\OpenWhispr-development` (dev). Settings and secrets do NOT carry over; **models do** (`~/.cache/openwhispr/`, outside userData — 1.3GB Parakeet + 7GB GGUF).
- **Two separate model pickers.** Transcription models (Parakeet → `parakeet-models/`) vs AI models (GGUF → `models/`). Downloading from the wrong one cost 6.9GB.
- `transcriptionMode` must be `"local"` or the local model picker (and its NVIDIA tab) is **hidden entirely** — `SettingsPage.tsx` ~:376.
- **Never print a credential value** — trips a safety filter that freezes local execution tools for the session. Use `grep -c`, never `cat`.
- Upstream's Anthropic integration is sound if ever needed: `ipcHandlers.js:3579` calls `api.anthropic.com` **directly**, not via OpenRouter.
