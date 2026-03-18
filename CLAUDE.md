# FSH Agent — Claude Reference

## Meta

Keep this file up to date. When you discover new patterns, gotchas, commands, or architectural facts that would help in future sessions, add them here immediately.

## After making changes

Always run Biome after editing source files:

```bash
yarn lint        # check for issues
yarn lint:fix    # check and auto-fix
yarn format      # format only
```

## Dev / build commands

Node.js is managed via nvm. Always run `nvm use 24` before any build/dev commands.

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start app in development mode (electron-vite dev) |
| `npm run build` | Production build to `out/` |
| `npm run package` | Package macOS `.dmg` to `release/` (requires build first) |

## Releases

Releases are automated via `.github/workflows/release.yml`. Push a version tag to trigger:

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions builds on `macos-latest`, runs `electron-builder`, and uploads the `.dmg` (x64 + arm64) to a GitHub Release. No code signing — macOS will show an "unidentified developer" warning; users can right-click → Open to bypass it.

## Architecture

- `src/main/` — Electron main process (Node.js). All system access lives here: OAuth, Gmail, Calendar, Downloads watcher, WebSocket server, IPC handlers.
- `src/preload/index.ts` — Exposes a typed `window.fshAgent` bridge to the renderer via `contextBridge`.
- `src/renderer/` — React UI. Communicates with main exclusively through `window.fshAgent`.

## Key patterns

- `browserWindow` can be `null` after the user closes it — always check and recreate with `createBrowserWindow()` before use, then use `!` non-null assertion on subsequent accesses.
- Events flow through `broadcast()` (WebSocket) + `mainWindow.webContents.send('event', ...)` (IPC to renderer) in parallel.
- `electron-store` (encrypted) holds tokens and settings. Access via `store.get` / `store.set` / `store.delete`.
- The `encryptionKey` in `store` is a hardcoded app-level obfuscation key — this is intentional. The store data lives on the user's local machine in `userData`; the key prevents casual plain-text reads of that file, not source-code-level attacks. It is safe to commit.
