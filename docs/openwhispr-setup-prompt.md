# Prompt for Claude Code: Fork & set up OpenWhispr as a Claude-powered dictation tool

Paste everything below into Claude Code (running locally on this machine) to kick off the project.

---

## Context

I want to fork the open-source dictation app **OpenWhispr** (https://github.com/OpenWhispr/openwhispr) and turn it into my personal push-to-talk speech-to-text tool, replacing Willow/Genspark Speechly. You (Claude Code) will own ongoing maintenance of this project, so set it up cleanly and document your decisions as you go.

**Target location:** `D:\ClaudeCode\open-whispr`

**My hardware** (so you can make sane defaults instead of assuming a GPU is available):
- CPU: AMD Ryzen 9 8945HS (8-core/16-thread, up to ~5.1GHz boost, currently reporting 4.00GHz base)
- GPU: AMD Radeon 780M integrated graphics only — **no discrete NVIDIA GPU, no CUDA**
- RAM: 96 GB
- Storage: 2.75 TB, plenty of free space
- OS: Windows 11 Pro, version 25H2, build 26200.8894

Because there's no NVIDIA GPU, do not configure anything that assumes CUDA. CPU-only inference is fine on this chip — the goal is a snappy push-to-talk experience, not raw throughput.

## Step 0 — Project scaffolding (if applicable)

If you have a `new-project` skill or similar scaffolding workflow available in this environment, invoke it first with:
- name: `open-whispr`
- path: `D:\ClaudeCode\open-whispr`
- type: forked open-source project (not greenfield)

Use whatever conventions it sets up (README stub, .gitignore, editor config, etc.) as the base, then layer the steps below on top of the forked repo. If the skill doesn't fit a "fork an existing repo" workflow, skip it and go straight to Step 1.

## Step 1 — Fork and clone

1. Check whether the GitHub CLI (`gh`) is installed and authenticated (`gh auth status`). If it's not authenticated, stop and tell me — don't guess at credentials.
2. Fork `OpenWhispr/openwhispr` to my GitHub account using `gh repo fork OpenWhispr/openwhispr --clone=false`.
3. Clone **my fork** (not the upstream repo) into `D:\ClaudeCode\open-whispr`.
4. Add the original project as a second remote named `upstream` pointing at `https://github.com/OpenWhispr/openwhispr.git`, so I can pull in updates later without losing my customizations. Confirm `git remote -v` shows `origin` → my fork and `upstream` → the original.
5. Verify my local git identity (`user.name` / `user.email`) is set correctly before any commits happen here; ask me if it isn't already configured globally.

## Step 2 — Get it running stock, first

Before making any changes, install dependencies and get the unmodified app running in dev mode so we have a known-good baseline. Read the repo's README/CONTRIBUTING docs for the exact commands (it's an Electron/React/TypeScript app, so expect `npm install` or similar plus an Electron dev script). Confirm the app launches, the hotkey listener registers, and a basic transcription works with whatever default engine ships out of the box, before touching config.

## Step 3 — Configure the STT engine for this hardware

- Set the local transcription engine to **NVIDIA Parakeet via sherpa-onnx** as the default/primary model. It's CPU-optimized, doesn't need a GPU, and is fast and accurate for English — a good fit for this machine.
- Leave Whisper (whisper.cpp) configured as a selectable fallback engine, for cases where I need multilingual dictation (Parakeet is English-only).
- Make sure no build flags or dependencies assume CUDA is present. If the project has separate GPU/CPU build variants, use the CPU-only variant, and don't bother wiring up DirectML/Vulkan acceleration for the 780M — it's not worth the complexity for short push-to-talk clips.
- Transcription should run fully offline/on-device. Confirm no audio ever leaves the machine for the STT step itself.

## Step 4 — Wire the AI cleanup pass to Claude

OpenWhispr has a built-in "AI agent" / text-processing feature that can route through GPT, Gemini, local models, or Claude. Configure it so:

- **Anthropic Claude is the default and only enabled provider** for the post-transcription cleanup pass (punctuation, filler-word removal, light formatting). Disable/hide the other provider options in the UI if that's easy to do, so I don't accidentally leave a different key active.
- The API key comes from an `ANTHROPIC_API_KEY` environment variable or a local `.env` file — **never hardcoded, and confirm `.env` is in `.gitignore` before the first commit.**
- Default to a small, fast Claude model (e.g. the current Haiku tier) for the cleanup pass rather than a larger reasoning model — this is a low-latency, low-complexity text-cleanup task (fix punctuation, drop "um"/"uh", light paragraph formatting), not something that needs deep reasoning. Look up the current Anthropic model IDs rather than assuming a version name, since these change.
- If the existing "Claude" integration in the codebase actually routes through OpenRouter or another proxy instead of Anthropic's API directly, rewire it to call the Anthropic API directly with my own key — I want direct billing/latency, not a proxy.
- **Add a way to toggle the AI cleanup pass on/off** (a hotkey modifier, a settings toggle, whatever fits the existing UI) so I can get raw transcription with no network call when I want it, and the formatted version when I don't.
- I'll supply my own `ANTHROPIC_API_KEY` after setup — stop and ask me for it when you get to this step rather than leaving a placeholder that silently fails.

## Step 5 — Push-to-talk and paste behavior

- Confirm/configure a global hold-to-talk hotkey (not toggle-to-talk) — press and hold, speak, release.
- Confirm transcribed (and optionally Claude-cleaned) text is copied to the clipboard **and** auto-pasted at the current cursor position.
- Confirm there's a log/history of past transcriptions I can review later (check what OpenWhispr already provides here; don't build a new logging system if one exists).

## Step 6 — Windows packaging

- Get a proper Windows build working (`electron-builder` or whatever this project uses) that produces an installable `.exe`, not just a dev-mode window.
- Set it up (or tell me how) to launch on Windows login / run quietly in the background/system tray, since this needs to be available at all times like Willow was.

## Step 7 — Document the fork

Create a `CLAUDE.md` (or update one if the scaffolding step already made one) at the project root capturing:
- What was changed from upstream OpenWhispr and why (Parakeet default, Claude-only cleanup, hardware notes)
- How to pull and reconcile updates from `upstream` in the future
- Where the Anthropic key is expected to live
- Any hardware-specific decisions (no GPU accel, CPU-only) so future-you (or future Claude Code sessions) don't reintroduce a CUDA dependency by accident

## Step 8 — Verify before calling it done

Walk through and confirm each of these actually works, not just that the code compiles:
1. Hold hotkey → speak → release → raw transcription appears at cursor
2. With cleanup enabled → same flow → Claude-formatted version appears instead, punctuation/filler words cleaned up
3. Toggle cleanup off → back to raw transcription, no network call made (check via logs or network monitor)
4. Test paste behavior in at least two different apps (e.g. Notepad and a browser text field) since cursor-injection can behave differently per app
5. Confirm the `.env`/API key file is genuinely git-ignored — run `git status` and make sure it never shows up as trackable
6. Report back a short summary of what's working, what's flaky, and what (if anything) needs my decision before you keep going

---

Work through this step by step and check in with me at any point you're genuinely blocked (missing GitHub auth, need my API key, ambiguous project convention) rather than guessing on anything security- or account-related.
