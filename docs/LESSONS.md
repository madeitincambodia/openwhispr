# OpenWhispr Lessons and Gotchas

Gotcha write-ups extracted verbatim from CLAUDE.md so the always-hot context file stays inside its 12,000 character budget. The one-line rules stay in CLAUDE.md.

## 2026-07-26: gotcha detail moved out of CLAUDE.md

### Fork non-negotiables (original CLAUDE.md header, verbatim)

> ## ⚠️ THIS IS A FORK — READ [`FORK.md`](FORK.md) FIRST
>
> Paul's personal push-to-talk fork. **Read `FORK.md` before changing anything**, in
> particular before touching transcription engines, AI providers, or build flags.
>
> Non-negotiables (full rationale in `FORK.md`):
> - **No CUDA, ever.** Target machine is AMD Radeon 780M integrated — no NVIDIA GPU.
>   Never set `WHISPER_CUDA_ENABLED` or download CUDA binaries. **Vulkan is NOT banned** —
>   it is vendor-neutral and is the correct 780M path; both profiles run it enabled.
> - **Transcription stays on-device.** Defaults are Parakeet (sherpa-onnx, CPU/INT8);
>   upstream's cloud-OpenAI default would send audio off the machine.
> - **LLM cleanup is OFF by default** (`useCleanupModel: false`) — it cost ~5.3s per
>   dictation. If re-enabled it stays local; nothing routes through upstream's hosted
>   `openwhispr` cleanup, and the Anthropic key in `.env` is unused.
> - **Never print a credential value** in any tool output.
>
> Fork divergence is defaults-only in `src/stores/settingsStore.ts` (tagged `// [fork]`),
> **plus one code change**: the ffmpeg bypass on the offline-Parakeet dictation path
> (`audioManager.js` + `parakeet.js`). See FORK.md before touching either.
> Note: **`npm run dev` is broken here** (a `concurrently` cwd bug) — `FORK.md` has the
> workaround. **Windows: never use an Alt key as the dictation hotkey** — it silently
> eats the paste (F8 confirmed working).
>
> Everything below this line is upstream's own reference. Keep it that way so
> `git merge upstream/main` stays clean.

### Common Issues and Solutions

1. **No Audio Detected**:
   - Check FFmpeg path resolution
   - Verify microphone permissions
   - Check audio levels in debug logs

2. **Transcription Fails**:
   - Ensure whisper.cpp binary is available
   - Check model is downloaded
   - Check temporary file creation
   - Verify FFmpeg is executable

3. **Clipboard Not Working**:
   - macOS: Check accessibility permissions (required for AppleScript paste)
   - Linux: Native `linux-fast-paste` binary (XTest) is tried first, works for X11 and XWayland apps
     - X11: xdotool fallback if native binary unavailable
     - GNOME/KDE Wayland: xdotool (XWayland apps) → ydotool (requires ydotoold daemon)
     - wlroots Wayland (Sway, Hyprland): wtype → xdotool → ydotool
   - Windows: PowerShell SendKeys (built-in) or nircmd.exe (bundled)

4. **Build Issues**:
   - Use `npm run pack` for unsigned builds (CSC_IDENTITY_AUTO_DISCOVERY=false)
   - Signing requires Apple Developer account
   - ASAR unpacking needed for FFmpeg
   - Run `npm run download:whisper-cpp` before packaging (current platform)
   - Use `npm run download:whisper-cpp:all` for multi-platform packaging
   - afterSign.js automatically skips signing when CSC_IDENTITY_AUTO_DISCOVERY=false
   - **Lockfile**: Always use Node 24 when running `npm install` (matches CI). If your local Node version differs, use `nvm exec 24 npm install`. Running `npm install` with a different major version will produce an incompatible `package-lock.json` that breaks `npm ci` in CI.

5. **Windows Push-to-Talk Binary**:
   - Prebuilt binary downloaded automatically on Windows during build
   - If download fails, push-to-talk falls back to tap mode
   - To compile locally: install Visual Studio Build Tools or MinGW-w64
   - CI workflow (`.github/workflows/build-windows-key-listener.yml`) auto-builds on push to main

6. **Meeting Detection Not Working**:
   - Check debug logs for "event-driven" vs "polling" mode
   - macOS: Verify `macos-mic-listener` binary exists in `resources/bin/` (compiled during `npm run compile:native`)
   - Windows: Verify `windows-mic-listener.exe` exists in `resources/bin/` (downloaded during `prebuild:win`)
   - Linux: Verify `pactl` is installed (`pulseaudio-utils` or `pipewire-pulse` package)
   - If event-driven binary is missing, detection falls back to polling automatically

7. **Local Semantic Search Not Working**:
   - Qdrant binary should be in `resources/bin/qdrant-{platform}-{arch}` (auto-downloaded during `predev`/`prebuild`)
   - Embedding model should be in `~/.cache/openwhispr/embedding-models/all-MiniLM-L6-v2/model.onnx` (auto-downloaded on first app launch)
   - Run `npm run download:qdrant` and `npm run download:embedding-model` manually if missing
   - Check debug logs for "qdrant" entries (port, health check, errors)
   - If Qdrant fails to start, search still works via FTS5 keyword fallback
   - Semantic search is only available through the AI agent's `search_notes` tool, not the manual search UI

