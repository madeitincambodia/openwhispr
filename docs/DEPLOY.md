# OpenWhispr Build and Deploy

Build tooling extracted verbatim from CLAUDE.md so the always-hot context file stays inside its 12,000 character budget.

## 2026-07-26: build script inventory moved out of CLAUDE.md

### Build Scripts (scripts/)

- **download-whisper-cpp.js**: Downloads whisper.cpp binaries from GitHub releases
- **download-llama-server.js**: Downloads llama.cpp server for local LLM inference
- **download-nircmd.js**: Downloads nircmd.exe for Windows clipboard operations
- **download-windows-key-listener.js**: Downloads prebuilt Windows key listener binary
- **download-windows-mic-listener.js**: Downloads prebuilt Windows mic listener binary
- **download-sherpa-onnx.js**: Downloads sherpa-onnx binaries for Parakeet support
- **download-qdrant.js**: Downloads Qdrant vector DB binary for local semantic search
- **download-minilm.js**: Downloads all-MiniLM-L6-v2 ONNX model + tokenizer for local embeddings
- **build-globe-listener.js**: Compiles macOS Globe key listener from Swift source
- **build-macos-mic-listener.js**: Compiles macOS mic listener from Swift source
- **build-windows-key-listener.js**: Compiles Windows key listener (for local development)
- **run-electron.js**: Development script to launch Electron with proper environment
- **lib/download-utils.js**: Shared utilities for downloading and extracting files
  - `fetchLatestRelease(repo, options)`: Fetches latest release from GitHub API
  - `downloadFile(url, dest)`: Downloads file with progress and retry logic
  - `extractZip(zipPath, destDir)`: Cross-platform zip extraction
  - `parseArgs()`: Parses CLI arguments for platform/arch targeting
  - Supports `GITHUB_TOKEN` for authenticated requests (higher rate limits)

### Build targets (package.json, v1.7.6)

| Target | Command |
| --- | --- |
| Run (dev) | `npm run dev:main` (see FORK.md, `npm run dev` is broken here) |
| Run (packaged code, no build) | `npm start` |
| Renderer only | `npm run build:renderer` |
| Windows installer | `npm run prebuild:win` then `npm run build:win` |
| macOS | `npm run prebuild:mac` then `npm run build:mac` |
| Linux | `npm run prebuild:linux` then `npm run build:linux` |
| Unsigned local pack | `npm run pack` |

Build-time gotchas (ASAR unpacking, lockfile Node version, signing) live in `docs/LESSONS.md` under Common Issues and Solutions, item 4.
