# FORK.md — Paul's OpenWhispr Fork

> Personal push-to-talk dictation tool, replacing Willow/Genspark Speechly.
> Fork of [OpenWhispr/openwhispr](https://github.com/OpenWhispr/openwhispr).
> `origin` → `madeitincambodia/openwhispr` · `upstream` → `OpenWhispr/openwhispr`
>
> Upstream's own architecture reference lives in `CLAUDE.md` — **do not rewrite it**.
> Fork-specific divergence is documented *here* so upstream merges stay clean.

---

## Target hardware (drives several decisions)

| | |
|---|---|
| CPU | AMD Ryzen 9 8945HS — 8C/16T, ~5.1GHz boost |
| GPU | **AMD Radeon 780M integrated only — no NVIDIA, no CUDA** |
| RAM | 96 GB |
| OS | Windows 11 Pro 25H2 (build 26200.8894) |

**HARD RULE — never reintroduce a CUDA dependency.** There is no NVIDIA GPU on this
machine. `nvidia-smi` returns nothing; the app logs `[gpu] No NVIDIA GPUs detected`.

Specifically, do **not**:
- set `WHISPER_CUDA_ENABLED=true` in `.env`
- download the CUDA whisper variants via `download-cuda-whisper-binary`
  (`src/helpers/whisperCudaManager.js`)

### ⚠️ Vulkan is NOT banned — the CUDA rule does not extend to it

An earlier draft of this file lumped Vulkan in with CUDA. **That was wrong**, and the
running app already contradicts it. Vulkan is vendor-neutral and is precisely the right
acceleration path for a Radeon 780M; CUDA is NVIDIA-proprietary and genuinely unusable
here. Only the CUDA ban is load-bearing.

Both profiles (`.env` in `%APPDATA%\OpenWhispr-development` and `%APPDATA%\open-whispr`)
set `LLAMA_VULKAN_ENABLED=true` and `WHISPER_VULKAN_ENABLED=true`, and it works — the
2026-07-20 logs show `llama-server-vulkan.exe` spawning cleanly and enumerating
`Vulkan0 : AMD Radeon 780M Graphics (78885 MiB, 74940 MiB free)`.

The two checklist items at the bottom of this file that assert Vulkan binaries must be
absent are stale for the same reason. Leave Vulkan enabled.

Current state of the *transcription* path is CPU-only by construction:
- **Parakeet has no GPU path at all.** `scripts/download-sherpa-onnx.js` pins
  sherpa-onnx v1.13.4 and fetches only `*-shared` CPU builds. Nothing to disable.
- **Whisper is on the CPU binary.** `resources/bin/whisper-server-win32-x64.exe`
  (no `-cuda`/`-vulkan` suffix — the suffix is how the runtime distinguishes GPU
  builds, see `src/helpers/ipcHandlers.js` ~:2052).
- `onnxruntime-node` ships DirectML DLLs, not CUDA. Harmless, unused.

---

## What changed from upstream, and why

Divergence is **defaults only** in
[`src/stores/settingsStore.ts`](src/stores/settingsStore.ts), each tagged `// [fork]`,
**plus one deliberate code change** — the ffmpeg bypass documented below. Keep it that
way: it is what makes `git merge upstream/main` nearly conflict-free.

| Setting | Upstream | This fork | Why |
|---|---|---|---|
| `useLocalWhisper` | `false` | `true` | Upstream defaults to **cloud OpenAI** (`gpt-4o-mini-transcribe`) — audio would leave the machine. Requirement is fully offline STT. |
| `localTranscriptionProvider` | `"whisper"` | `"nvidia"` | Parakeet via sherpa-onnx: CPU-optimised INT8, fast and accurate, no GPU needed. |
| `parakeetModel` | `""` | `"parakeet-tdt-0.6b-v3"` | Pinned explicitly. Upstream leaves it empty and relies on ~6 call sites each hardcoding the same fallback id. Multilingual (25 languages), ~680MB. |
| `cleanupProvider` | `"openai"` | `"local"` | Fully-local pipeline (decision 2026-07-19). |
| `cleanupModel` | `""` | `"llama-3.2-3b-instruct-q4_k_m"` | Cleanup = punctuation, filler removal, light formatting. A small local GGUF is plenty; the 3B is chosen over Gemma-4-E4B for latency (push-to-talk feel). |
| `cleanupMode` | `"openwhispr"` | `"local"` | **Privacy fix.** Upstream routes dictated text through OpenWhispr's *hosted cloud* when signed in (see the `isSignedIn && cleanupMode === "openwhispr" && cleanupCloudMode === "openwhispr"` check in `settingsStore.ts`). |
| `transcriptionMode` | `"openwhispr"` | `"local"` | On-device. **Also gates the UI** — `SettingsPage.tsx` ~:376 only renders the local model picker (and its NVIDIA/Parakeet tab) when this is `"local"`. Leaving it hosted hides the Parakeet download entirely. |
| `useCleanupModel` | `true` | `false` | **Latency.** Cleanup cost ~5.3s per dictation for marginal gain — see below. Parakeet already punctuates and capitalises well. |

### Why cleanup is off (measured 2026-07-20)

The packaged app was taking **6–7s** per dictation. Instrumented breakdown from
`%APPDATA%\open-whispr\logs\`: transcription 2,243ms, cleanup **~5,300ms**, paste 163ms.

Cleanup is slow for a structural reason, not a model-choice one — swapping
`llama-3.2-3b` for `gemma-4-e4b` barely moved the number, because the time is not
inference:

- `llamaServer.js:21` sets `IDLE_TIMEOUT_MS = 5 * 60 * 1000`. Five minutes after the
  last inference the server is killed and the model unloaded.
- Pre-warming happens **only at app start** (`main.js:1017`). There is no re-warm hook.
- So intermittent dictation — the normal pattern — pays a full cold load on nearly
  every run: process spawn, GGUF read, weight load, 500ms-grid readiness poll, and a
  re-prefill of the 557-token cleanup system prompt whose KV cache died with the process.
- Cleanup **blocks the paste entirely** (`audioManager.js` `processWithOpenWhisprCloud`
  returns only after reasoning completes; `useAudioRecording.js:164-170` awaits it), so
  the whole cost is user-visible.

If cleanup is ever wanted back, the fix is to raise or disable `IDLE_TIMEOUT_MS` and
re-warm on record-start — **not** to pick a smaller model. That would be the first fork
change outside `settingsStore.ts`, so weigh the merge cost.

### Code change: ffmpeg bypass on the offline-Parakeet dictation path

**The only non-defaults divergence.** Measured 2026-07-20 in the packaged app: a dictation
spent **1,697ms of its 2,243ms transcription inside a single ffmpeg subprocess**, converting
webm/opus → 16 kHz mono WAV. Parakeet's own inference was only 494ms (dev measured 420ms —
ASR was never the problem).

That conversion is pure waste. The renderer's AudioWorklet already produces **16 kHz mono
Int16** — precisely what sherpa-onnx consumes — and `parakeetServer._ensureWav` short-circuits
without touching ffmpeg when handed a 16 kHz mono WAV. The old path decoded audio the renderer
already had, via an 83 MB subprocess and four synchronous temp-file operations.

Standalone, that same conversion runs in a steady **138–141ms**. In-app it ranged **125ms to
7,125ms** across six dictations. Root cause of the *variance* was never confirmed — Defender
real-time protection is off on this machine, so AV scanning is ruled out; the leading
hypothesis is main-process event-loop blocking around the synchronous `writeFileSync`/
`readFileSync` in `_ensureWav`. Bypassing the conversion sidesteps the question.

**What changed** (all additive, no signature changes):

| File | Change |
|---|---|
| `audioManager.js` (worklet setup) | Run the PCM worklet for offline Parakeet too, not just preview/streaming. Guarded so it does **not** start a preview IPC session — that would spin up main's chunked-transcription pipeline for a preview nobody asked for. |
| `audioManager.js` (`onstop`) | Await the worklet flush for direct capture. Without this the final partial chunk is dropped and the last ~50ms is clipped. |
| `audioManager.js` (`_takeCapturedPcm`) | Concatenate chunks; return `null` below 3,200 bytes (100ms) so short captures fall back. |
| `audioManager.js` (`cleanupPreview`) | Skip `stopDictationPreview` when no preview session was started. |
| `parakeet.js` | On `options.format === "pcm16"`, wrap with `pcm16ToWav` (pure JS, no I/O) before `serverManager.transcribe`. |

**ffmpeg is NOT removed** — it stays load-bearing for whisper.cpp (`whisperServer.js`,
`whisper.js`), file-upload transcription, `splitAudioFile`, diarization, and URL audio
download. `_ensureWav` also stays, since `transcribeLocalParakeet` has five main-process
call sites and some pass arbitrary encoded audio (mp3/m4a). This is a bypass for **one hot
path**, with automatic fallback to the original webm path if worklet setup fails.

Guarded by [`test/helpers/parakeetPcmDirect.test.js`](test/helpers/parakeetPcmDirect.test.js).
If those break, the path silently reverts to ffmpeg and the regression returns.

**On merge conflicts:** `audioManager.js` is an upstream-churn file. If upstream reworks the
worklet or `processWithLocalParakeet`, re-derive the bypass rather than force-resolving —
the contract that matters is only "hand `_ensureWav` a 16 kHz mono WAV".

### No version or CHANGELOG bumps in this fork

`CHANGELOG.md` and `package.json` version **track upstream** and are deliberately left
alone, even when fork commits ship real changes. Both are among the files upstream churns
hardest, so bumping them buys nothing and costs a conflict on every `git merge
upstream/main`. Fork history lives in git log and in this file. (Overrides the usual
"bump the version + CHANGELOG in the same commit" house rule — noted here because that
rule is otherwise automatic.)

### Defaults only bind a fresh profile

Every one of these reads `localStorage` first (`readString`/`readBoolean`). If this
machine has ever run stock OpenWhispr, **stored values win** and the app may still be
on cloud OpenAI. Verify in Settings, or clear the relevant localStorage keys.

---

## Things upstream already does correctly — do NOT "fix" these

Investigated and confirmed; changing them would be wasted work or a regression.

- **Anthropic is called directly.** `src/helpers/ipcHandlers.js:3579` →
  `https://api.anthropic.com/v1/messages` with `X-API-Key` and
  `anthropic-version: 2023-06-01`. It goes over IPC to the main process purely to
  dodge browser CORS, *not* through a proxy. The `proxyFetch` wrapper is
  corporate-HTTP-proxy support, not an LLM proxy. **OpenRouter is a separate,
  independently selectable provider — Anthropic does not route through it.**
- **The cleanup on/off toggle already exists.** `useCleanupModel` (default `true`),
  UI switch at `src/components/SettingsPage.tsx:460` in `AiModelsSection`.
  When off, no network call is made. Nothing was built for this.
- **Key storage is already strong.** AES-256-GCM (`src/helpers/secretCrypto.js`) with
  the master key in the Windows keychain (service `OpenWhispr`), backed up via
  Electron `safeStorage`. A plaintext `.env` is migrated into encrypted storage and
  then deleted, with round-trip verification before deletion
  (`src/helpers/environment.js` ~:191-213).

### Other providers: default-away, don't strip

Upstream registers 8 providers in `src/services/ai/inferenceProviders/index.ts`,
shared across 4 scopes (`dictationCleanup`, `dictationAgent`, `noteFormatting`,
`chatIntelligence`). **Deliberate decision: leave the registry alone.** Cleanup is
pinned to Anthropic and no other provider can activate without a key. Stripping the
registry would risk unrelated features and make every upstream merge painful.

---

## Architecture: fully local, no network in the dictation path

**Decision (2026-07-19): everything runs on-device.** The original brief called for
Anthropic Claude cleanup; Paul reversed this in favour of a fully-local pipeline.

```
hold hotkey → mic → Parakeet (sherpa-onnx, CPU INT8)  → raw text
                  → llama.cpp GGUF (local)            → cleaned text
                  → clipboard + auto-paste at cursor
```

Nothing touches the network. No API cost, no key rotation, no data egress.
Consequently the "cleanup off ⇒ zero network calls" requirement is satisfied
trivially — cleanup *on* is also zero network calls.

Measured on this machine (4.9s of audio):

| Stage | Time |
|---|---|
| Parakeet transcription | **420 ms** |
| Cleanup (Gemma-4-E4B) | 746 ms |
| Full round-trip | 1169 ms |

Gemma-4-E4B (5.03GB) was the first model tried. `llama-3.2-3b-instruct-q4_k_m`
(1.88GB) is the configured default — smaller and expected to cut cleanup latency
substantially. Switch in Settings → AI Models → Language Models.

---

## Where the Anthropic key lives

> **Currently unused** — cleanup is local (see above). Retained in case the local
> pipeline is ever swapped back to a cloud provider. Upstream's Anthropic
> integration is sound if so: `src/helpers/ipcHandlers.js:3579` calls
> `https://api.anthropic.com/v1/messages` **directly** (over IPC purely to dodge
> browser CORS — *not* via OpenRouter or any other proxy).

`ANTHROPIC_API_KEY` in `D:\ClaudeCode\open-whispr\.env`.

- `.env` is git-ignored (`.gitignore:153`). Verified never tracked.
- **Never hardcode the key, and never print its value** — a plaintext credential in
  any tool output trips a safety filter that freezes local execution tools for the
  rest of the session. Check presence with `grep -c`, never `cat`.
- On first run the app migrates it into encrypted keychain storage and strips the
  plaintext from `.env`. This is expected upstream behaviour.

### ⚠️ Known state: other live keys present

`.env` also contains **live-looking `OPENAI_API_KEY` and `GEMINI_API_KEY`**
(Groq/Tinfoil/Mistral are `.env.example` placeholders). Paul chose on 2026-07-19 to
leave these in place.

Consequence: they were absorbed into the encrypted keychain store on first launch.
**Deleting them from `.env` will no longer remove them** — they must be cleared via
the app's own settings UI. They stay unused given the Anthropic-only defaults, but
this is a known standing risk, recorded deliberately rather than silently.

### Local GGUF models kept as an offline fallback

`~/.cache/openwhispr/models/` holds `Llama-3.2-3B-Instruct-Q4_K_M.gguf` (~560MB) and
`google_gemma-4-E4B-it-Q4_K_M.gguf` (~4.6GB), pulled 2026-07-19.

These are **local LLM** models for the `local` cleanup provider — *not* transcription
models. They are unused under the Anthropic-only default. Paul chose to keep them as
a deliberate offline / zero-API-cost fallback: switch `cleanupProvider` to `"local"`
in Settings → AI Models to use them.

> **Don't confuse the two model pickers.** Settings has separate pickers for
> *transcription* models (Parakeet/whisper — speech→text, `parakeet-models/`) and
> *AI* models (GGUF — text→text, `models/`). Downloading from the wrong one is easy
> and was hit during setup.

### `.gitignore` gap worth knowing

`.env`, `.env.test`, `.env.local`, `.env.production` are ignored — but **`.env.*` is
not globbed**. A file like `.env.staging` or `.env.development` would **not** be
ignored. Add the glob before creating any such file.

---

## Reconciling updates from upstream

```bash
git fetch upstream
git log --oneline HEAD..upstream/main          # review first
git merge upstream/main                        # or: git rebase upstream/main
```

**Conflict-prone files, in order of likelihood:**

1. `src/stores/settingsStore.ts` — where all fork divergence lives. Search for
   `// [fork]` markers; re-apply the defaults table above if upstream reorders.
2. `src/models/modelRegistryData.json` — upstream refreshes model lists often.
   Verify `claude-haiku-4-5` still exists in the `anthropic` block; if the id is
   retired, update `cleanupModel` to the current Haiku-tier alias.
3. `package.json` — do **not** regenerate `package-lock.json` on a different Node
   major. Repo pins Node 24 in `.nvmrc`; this machine runs 24.16.0 via nvm4w.

**After every merge, re-verify:**
- [ ] `npm run typecheck` passes
- [ ] No CUDA binaries in `resources/bin/` (`ls resources/bin | grep -i cuda` → empty).
      Vulkan binaries are expected and correct — do not remove them.
- [ ] `WHISPER_CUDA_ENABLED` absent from `.env`. `LLAMA_VULKAN_ENABLED` /
      `WHISPER_VULKAN_ENABLED` may be `true` — that is the AMD acceleration path.
- [ ] Cleanup still points at Anthropic, not `openwhispr` or `openai`
- [ ] `useLocalWhisper` still `true` (upstream may reintroduce the cloud default)
- [ ] `git status` never shows `.env`

---

## Dev workflow

### ⚠️ `npm run dev` is broken on this machine

`concurrently`'s `npm:dev:renderer` / `npm:dev:main` shorthand spawns children with
the wrong cwd — they look for `package.json` at `D:\ClaudeCode\package.json` instead
of `D:\ClaudeCode\open-whispr\`. Reproduced identically under Git-Bash **and** `cmd`,
so it is not shell path-translation; it is `concurrently` itself. Both halves work
fine standalone.

Run the two processes separately instead:

```bash
# Terminal 1 — renderer (binds 127.0.0.1:5183)
cd src && ../node_modules/.bin/vite --host 127.0.0.1

# Terminal 2 — Electron main
NODE_ENV=development node scripts/run-electron.js --dev
```

Left unpatched on purpose: `package.json` is a high-churn upstream file, and
carrying a diff there costs more than the workaround.

### Launcher routines (`.claude/launch.json`)

Three configurations, all prefixed **`Whispr:`** so they group together:

| Routine | What it does |
|---|---|
| **Whispr: Renderer (Vite)** | `npm run dev:renderer` → binds `127.0.0.1:5183`. Safe: only the `concurrently` wrapper is broken, this script works standalone. |
| **Whispr: App (Electron)** | `npx cross-env NODE_ENV=development node scripts/run-electron.js --dev`. Bypasses `predev:main` so it doesn't re-run the download chain on every launch. |
| **Whispr: Stop All** | `powershell -NoProfile -File scripts/whispr-stop.ps1` |

Start order: **Renderer first, then App** (Electron expects the dev server up).

### `scripts/whispr-stop.ps1`

Targeted shutdown for orphaned dev processes. Kills only processes that either
listen on a project dev port (**5183** Vite, **6006** parakeet-ws, **6333** Qdrant,
**8080** llama-server) *or* run from an executable under the project directory.

**It never does a blanket `kill node.exe`** — anything outside
`D:\ClaudeCode\open-whispr` is explicitly skipped and logged, so other dev servers
survive. Supports `-WhatIf` for a dry run, and exits non-zero if a port is still
held afterwards.

Normally unnecessary: quitting the Electron app cleans up its own sidecars via
`sidecarRegistry` (verified — no orphaned llama-server/sherpa/qdrant after quit).
This is for when the app is hard-killed or a dev process is stranded.

```powershell
powershell -NoProfile -File scripts\whispr-stop.ps1 -WhatIf   # dry run
powershell -NoProfile -File scripts\whispr-stop.ps1           # for real
```

### First-run asset downloads

`predev` fetches **runtimes**, not **models**:

| Fetched by `predev` | Needs separate action |
|---|---|
| sherpa-onnx binaries (offline + streaming ws servers) | **Parakeet model weights (~680MB)** — download via Settings → transcription model picker → NVIDIA tab |
| Qdrant, MiniLM embeddings, whisper-VAD, yt-dlp, AEC helper | whisper.cpp binary — `npm run download:whisper-cpp` |
| Windows key-listener / fast-paste / text-monitor | |

Native binaries download as prebuilts, so **no C++ compiler is required** — which
matters here: Visual Studio Professional 2026 is installed *without* the C++ desktop
workload, so `cl.exe` is unavailable.

### Harmless log noise

```
STT config fetch error: OpenWhispr API URL not configured
```
Expected. `VITE_OPENWHISPR_API_URL` is intentionally empty for a local-only setup.
Cosmetic, not a failure.

---

## Verification checklist

Engine-level checks (automatable):

- [x] App launches; Vite serves on `:5183`; Electron main starts
- [x] Push-to-talk registers — native `windows-key-listener.exe`, `Control+Super`,
      low-level `WH_KEYBOARD_LL` hook = true **hold**-to-talk, not toggle
- [x] Parakeet is the active provider (`provider not whisper` in logs)
- [x] No CUDA (`No NVIDIA GPUs detected`; no GPU binaries present)
- [x] `.env` git-ignored and never tracked
- [x] Parakeet weights downloaded — **both** `parakeet-unified-en-0.6b` (active,
      English specialist) and `parakeet-tdt-0.6b-v3` (multilingual, one-click switch)
- [x] `parakeet-ws` server starts on :6006, `runtime: offline`, `--num-threads=4` (CPU)
- [x] Cleanup runs locally ⇒ **zero** network calls in the dictation path

Verified by a human, 2026-07-19:

- [x] Hold hotkey → speak → release → text appears at cursor
- [x] Paste works in **Notepad** and in **Chrome**
      (cursor injection differs per app; Windows path is PowerShell SendKeys with
      an `nircmd.exe` fallback — see `src/helpers/clipboard.js`)
- [ ] History persists — SQLite `transcriptions` table, viewable in the app
- [ ] Compare cleanup latency: `llama-3.2-3b` vs `gemma-4-e4b` (746 ms baseline)

---

## Windows build

### ⚠️ `npm run build:win` fails — use the unsigned config

Upstream's `--win` target signs via **Azure Trusted Signing**, which needs the .NET
SDK and the `sign` CLI tool. Neither is installed here, so the build dies with
`Failed to install package: sign 0.9.1-beta...` / `No .NET SDKs were found` —
**and still exits 0**, so check for artifacts, never the exit code.

Use upstream's own unsigned config instead (it just nulls `azureSignOptions`):

```bash
npm run build:renderer
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win \
  --config electron-builder.unsigned-win.json
```

Produces:
- `dist/OpenWhispr Setup 1.7.6.exe` — NSIS installer (~234MB)
- `dist/OpenWhispr 1.7.6.exe` — portable (~233MB)

Unsigned means SmartScreen will warn on first run ("More info" → "Run anyway").
Fixing that needs a real code-signing certificate.

### Launch at login / background operation

Already built in — **Settings → General → Startup → "Launch at login"**
(`src/components/SettingsPage.tsx:2708` → IPC `set-auto-start-enabled`,
`src/helpers/ipcHandlers.js:2841`). No fork code required.

> ⚠️ **Upstream bug — `openAsHidden` does nothing on Windows.** The handler passes
> `app.setLoginItemSettings({openAtLogin: enabled, openAsHidden: true})` with the
> comment *"Start minimized to tray"*, but `openAsHidden` is **macOS-only** in
> Electron. On Windows the app starts with its panel visible. Tolerable for a
> dictation overlay, so left unpatched. The correct Windows approach is
> `args: ['--hidden']` + handling that flag at startup — that would be the first
> fork change outside `settingsStore.ts`, so weigh the merge cost first.

### ⚠️ Never use an Alt key as the dictation hotkey (Windows)

**Symptom:** dictation works perfectly — correct transcript, `Paste completed` logged, sane
`pasteMs` — but the text never appears in the target app. It is sitting in the clipboard.
Manual Ctrl+V works. Nothing in the logs looks wrong.

**Cause:** `DICTATION_KEY=RightAlt`. Two compounding Windows behaviours:

1. A **standalone Alt press-and-release activates the focused window's menu bar**. On
   release, Notepad (and most Win32 apps) move focus off the text area, so the Ctrl+V the
   app injects a moment later goes to the menu and is swallowed.
2. **RightAlt is AltGr on many layouts** (= Ctrl+Alt). If Windows still considers it
   logically down, the injected Ctrl+V arrives as Ctrl+Alt+V, which is not paste.

**Fix:** pick a hotkey with no Alt in it. `F8` is confirmed working (2026-07-20); the fork
default `Ctrl+Win` is also fine.

**Why this hid for so long:** before the ffmpeg bypass, paste fired ~7.7s after key release
— long enough that the user would typically click back into the target window, which clears
the menu-bar state. At ~1s there is no time to, so the speedup made a latent bug reliably
visible. Do not misread this as a regression in the PCM path; the paste tier and `pasteMs`
(141–209ms) are unchanged from before.

**Relevant limitation:** the app has **no focus-restore logic at all** — no capture of the
previous foreground window, no restore before paste. It relies entirely on the target window
holding focus. If a non-Alt hotkey ever shows the same symptom, that is the thing to build.

### Installed app uses a different profile from dev

`%APPDATA%\OpenWhispr` (packaged, from `productName`) vs
`%APPDATA%\OpenWhispr-development` (dev). Settings and encrypted secrets do **not**
carry over; **models do** — they live in `~/.cache/openwhispr/`, outside userData.

This is why the installed app picks up `llama-3.2-3b` for cleanup while the dev
profile stays on `gemma-4-e4b`: a fresh localStorage lets the `// [fork]` defaults
bind, whereas the dev profile's stored values were written before those defaults
existed. Same mechanism as the "defaults only bind a fresh profile" warning above —
here it works in our favour.

---

## Still to do

- End-to-end voice verification (see checklist above)
