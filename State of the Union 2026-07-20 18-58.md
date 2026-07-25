# State of the Union — 2026-07-20 18:58

## Project
- **Name:** open-whispr (fork of OpenWhispr/openwhispr)
- **Directory:** `D:\ClaudeCode\open-whispr`
- **Goal:** Personal push-to-talk dictation. Hold hotkey, speak, release → text pasted at cursor. Fully on-device.

## Phase & Status
- **Current phase:** Installed, working, tuned — **done and in daily use**
- **Status:** Not blocked. Packaged app installed and verified. All work committed + pushed to `origin/main`.

## What we accomplished this session
- Diagnosed and fixed a **~7.7s → ~1s** dictation round trip (about 8x)
- Root causes were three separate things, none of them "the models are slow":
  1. **LLM cleanup ~5,300ms** — `llamaServer.js` `IDLE_TIMEOUT_MS` (5 min) unloads the model, pre-warm only at app start, no re-warm hook ⇒ most dictations paid a full cold load, and cleanup blocks the paste. Turned cleanup off.
  2. **ffmpeg 1,697ms of a 2,243ms transcription** — converting webm→16kHz mono WAV that the renderer's AudioWorklet already had. Bypassed it.
  3. **Alt hotkey ate the paste** — `RightAlt` release activates the Win32 menu bar, swallowing the injected Ctrl+V. Changed to `F8`.
- Parakeet ASR was healthy the whole time (494ms) — never the problem
- Built + installed the new packaged app; verified live (`skippedFfmpeg: true` on every run)
- Committed `7ea72960` (perf) + `d4a831fb` (docs), both pushed

## Files created or modified
- `src/helpers/audioManager.js` — PCM capture for offline Parakeet, `_takeCapturedPcm()`, flush await on stop, preview-session guard
- `src/helpers/parakeet.js` — `options.format === "pcm16"` → `pcm16ToWav` wrap, skipping ffmpeg
- `src/stores/settingsStore.ts` — `useCleanupModel` default → `false`
- `test/helpers/parakeetPcmDirect.test.js` — **new**, 6 tests locking the WAV short-circuit contract
- `FORK.md` — ffmpeg bypass section, Vulkan correction, Alt-hotkey trap, no-version-bump policy
- `CLAUDE.md` — fork block: 3 stale claims corrected
- `QUICKSTART.md` — F8 hotkey + Alt warning, cleanup-off rationale
- `D:\ClaudeCode\PROJECTS.md` — row 77 refreshed
- `D:\ClaudeCode\docs\TECHNIQUES.md` — 3 entries (model-size-vs-startup diagnostic, ffmpeg bypass, Alt-hotkey paste)

## Open questions / blockers
- **ffmpeg variance never explained** — 125ms–7,125ms in-app vs a steady 138–141ms standalone. Defender real-time is OFF, so not AV. Leading hypothesis: main-process event-loop blocking around the synchronous `writeFileSync`/`readFileSync` in `_ensureWav`. We routed around it; **it still affects file-upload transcription, meeting audio, whisper.cpp and diarization**, which all still use ffmpeg.
- **No focus-restore logic exists anywhere** in the paste path — no capture/restore of the previous foreground window. F8 works, but any hotkey that disturbs focus hits the same wall. That's the fix if it recurs.
- **History panel still never spot-checked** (carried over from last session).
- `openAsHidden` is macOS-only, so the panel appears at login on Windows (unpatched, low priority).

## Decisions made
- **Cleanup off, not "use a smaller model"** — the cost was process startup, not inference; a smaller model would not have helped. Re-enabling means raising `IDLE_TIMEOUT_MS` + re-warming on record-start.
- **Bypass ffmpeg, don't remove it** — still load-bearing for whisper.cpp, file upload, `splitAudioFile`, diarization, URL audio. `_ensureWav` stays; webm path stays as automatic fallback.
- **Accepted the first code change outside `settingsStore.ts`** — worth the merge cost for ~1.5s. If upstream reworks the worklet, re-derive rather than force-resolve; the only contract that matters is "hand `_ensureWav` a 16kHz mono WAV".
- **Vulkan is fine and stays on** — FORK.md's old blanket ban was wrong; Vulkan is vendor-neutral and correct for the 780M. Only CUDA is banned.
- **No version/CHANGELOG bump** — tracks upstream; now recorded in FORK.md so it survives handoff rotation.

## Next steps (pick up here)
1. **Just use it.** Nothing is outstanding. Confirm F8 dictation still works after a reboot.
2. Spot-check the history panel lists past dictations (long-carried, never done).
3. Optional: if file-upload or meeting transcription feels slow, that's the unexplained ffmpeg variance — start at `_ensureWav`'s synchronous file I/O.
4. Optional: if paste ever fails again on a non-Alt key, add foreground-window capture/restore around the paste in `clipboard.js`.

## Context to reload
- **NO CUDA, ever** (AMD Radeon 780M). **Vulkan is NOT banned** — it is enabled and correct.
- **Never use an Alt key as the dictation hotkey** — silently eats the paste, logs look perfectly healthy.
- **`npm run dev` is BROKEN** (concurrently cwd bug) — run Vite and Electron separately, see QUICKSTART.
- **`npm run build:win` FAILS WHILE EXITING 0** — always check `ls dist/*.exe`, never the exit code. Use `electron-builder.unsigned-win.json`.
- **Defaults only bind a fresh profile** — localStorage wins. Changing a default does nothing to an existing install.
- **Installed ≠ dev profile:** packaged is `%APPDATA%\open-whispr` (lowercase, from package.json `name`), dev is `%APPDATA%\OpenWhispr-development`. Models are shared via `~/.cache/openwhispr/`.
- **Debug logs are the ground truth** — `%APPDATA%\open-whispr\logs\`. Timing lives in `transcriptionProcessingDurationMs`, `pasteMs`, `skippedFfmpeg`.
- **Never print a credential value** — freezes local execution tools for the session.
