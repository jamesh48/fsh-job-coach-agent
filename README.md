# FSH Agent

A local Electron desktop app that acts as an AI agent bridge for your job search. It monitors your Gmail and Google Calendar for job-related activity, captures job listings from browser windows, watches your Downloads folder for new PDFs (resumes, offer letters), syncs a local file folder to the FSH web app, and exposes all events via a WebSocket connection to the webapp.

## What This App Does

- **Gmail monitoring** — polls your inbox for emails with subjects matching interview, offer, application, recruiter, or hiring keywords
- **Google Calendar monitoring** — watches your next 7 days of events and flags anything that looks like an interview or recruiter call
- **File sync** — watches a local folder (`~/Documents/fsh-job-agent-files` by default); files are synced to the web app in real time. Upload, download, and delete files from the webapp UI.
- **Job page capture** *(in development)* — opens a built-in browser window; automatically captures job listings when you land on supported job sites (LinkedIn, Indeed, Greenhouse, Lever, Workday, Wellfound)
- **PDF watcher** *(in development)* — monitors your Downloads folder and forwards any new PDF files as base64 payloads
- **System tray** — runs quietly in the background with a tray icon for quick access

---

## For Release Users

This section is for people who downloaded the `.dmg` from the [Releases page](../../releases).

### Install

1. Download the latest `.dmg` from the [Releases page](../../releases)
2. Open the `.dmg` and drag **FSH Agent** to your Applications folder
3. Launch the app

> **macOS security warning:** Because the app is not code-signed, macOS may block it with an "unidentified developer" message. To bypass: right-click (or Control-click) the app icon → **Open** → **Open** again in the dialog.

### Google Cloud Setup

The app needs OAuth credentials from a Google Cloud project to access your Gmail and Calendar. This is a one-time setup.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or select an existing one)
2. Navigate to **APIs & Services > Library**
3. Search for and enable **Gmail API**
4. Search for and enable **Google Calendar API**
5. Navigate to **APIs & Services > Credentials**
6. Click **Create Credentials > OAuth 2.0 Client ID**
7. Set Application type to **Desktop app**
8. Give it a name (e.g., "FSH Agent") and click **Create**
9. Copy your **Client ID** and **Client Secret**
10. Under **APIs & Services > OAuth consent screen**, add your Google account as a test user (required while the app is in testing mode)

No redirect URI configuration is needed — Desktop app credentials automatically allow `http://localhost` redirects.

### First-Time Setup in the App

1. Open FSH Agent
2. Click **Show** next to Settings at the bottom of the dashboard
3. Paste your **Google Client ID** and **Google Client Secret**
4. Set your preferred **FSH Backend URL** (defaults to `https://fshjobcoach.com`)
5. Adjust poll intervals if desired
6. Click **Save Settings**
7. Click **Connect Google** — your browser will open the Google OAuth consent screen
8. Grant the requested permissions
9. Return to the app — it will show "Google Connected" and begin monitoring

### Agent Secret

The desktop agent connects to the FSH web app via WebSocket and must authenticate with a shared secret.

**Step 1 — Set the secret in the web app**

In the FSH web app, go to **Settings → Security** and set an Agent Secret.

**Step 2 — Enter the same secret in the desktop app**

In FSH Agent, open Settings and paste the same secret into the **Agent Secret** field, then click **Save Settings**.

The agent sends the secret as a query parameter when connecting (`/ws/agent?secret=<your-secret>`). If the secret is missing or doesn't match, the connection will be rejected.

### File Sync

By default the agent watches `~/Documents/fsh-job-agent-files`. Any file placed in that folder is automatically synced to the web app. You can change the watch folder in Settings.

From the web app, use the folder icon in the header to:
- Browse synced files
- Download any file
- Upload a file (it will be saved to the agent's watch folder)
- Delete a file (removes it from disk)

---

## For Developers

### Prerequisites

- [nvm](https://github.com/nvm-sh/nvm) with Node.js 24 (`nvm use 24`)
- A Google Cloud project with OAuth credentials (see Google Cloud Setup above)

### Setup

```bash
nvm use 24
npm install
npm run dev
```

### Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start app in development mode (electron-vite dev) |
| `npm run build` | Production build to `out/` |
| `npm run package` | Package macOS `.dmg` to `release/` (requires build first) |
| `yarn lint` | Check for linting issues (Biome) |
| `yarn lint:fix` | Check and auto-fix linting issues |
| `yarn format` | Format source files |

Always run Biome after editing source files.

### Releases

Releases are automated via `.github/workflows/release.yml`. Push a version tag to trigger:

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions builds on `macos-latest`, runs `electron-builder`, and uploads the `.dmg` (x64 + arm64) to a GitHub Release.

### Architecture

- `src/main/` — Electron main process (Node.js). All system access lives here: OAuth, Gmail, Calendar, Downloads watcher, file watcher, WebSocket server, backend connection, IPC handlers.
- `src/preload/index.ts` — Exposes a typed `window.fshAgent` bridge to the renderer via `contextBridge`.
- `src/renderer/` — React UI. Communicates with main exclusively through `window.fshAgent`.

#### Key files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | App entry — wires all modules together, IPC handlers |
| `src/main/backend.ts` | Outbound WebSocket connection to the webapp (`/ws/agent`); reconnects automatically |
| `src/main/files.ts` | File watcher (chokidar), `listFiles`, `saveFile`, `deleteFile` |
| `src/main/gmail.ts` | Gmail polling |
| `src/main/calendar.ts` | Google Calendar polling |
| `src/main/oauth.ts` | OAuth flow + token refresh |
| `src/main/websocket.ts` | Local WebSocket server on port 3001 (legacy/dev) |

### Key Patterns

- `browserWindow` can be `null` after the user closes it — always check and recreate with `createBrowserWindow()` before use.
- Events flow through `broadcast()` (local WebSocket + backend connection) + `mainWindow.webContents.send('event', ...)` (IPC to renderer) in parallel.
- `electron-store` (encrypted) holds tokens and settings. Access via `store.get` / `store.set` / `store.delete`.
- File communication with the webapp goes entirely through the persistent `/ws/agent` connection — no separate port needed.

---

## WebSocket Protocol (`/ws/agent`)

The agent connects outbound to `<FSH_BACKEND_URL>/ws/agent?secret=<AGENT_SECRET>`. All file and event communication flows through this single authenticated connection.

### Events sent by the agent → webapp

All events follow this shape:

```json
{
  "type": "event_type",
  "payload": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

| Type | Description | Payload fields |
|------|-------------|----------------|
| `email_detected` | Job-related email found in Gmail | `id`, `threadId`, `subject`, `from`, `snippet`, `date` |
| `calendar_event` | Interview-like calendar event detected | `id`, `summary`, `start`, `end`, `description` |
| `job_captured` | Job page captured from browser | `url`, `title`, `text` |
| `new_pdf` | New PDF added to Downloads folder | `filename`, `path`, `base64`, `size` |
| `file_added` | File added or changed in the watch folder — **metadata only, no base64** | `filename`, `path`, `size`, `mimeType` |
| `file_removed` | File deleted from the watch folder | `path` |
| `file_content` | Response to a `get_file` request | `requestId`, `base64`, `mimeType` |

### Messages received by the agent ← webapp

| Type | Description | Payload fields |
|------|-------------|----------------|
| `list_files` | Request all files in the watch folder (sent on connect) | *(none)* |
| `save_file` | Write a file to the watch folder | `filename`, `base64` |
| `delete_file` | Delete a file from the watch folder | `path` |
| `get_file` | Request the full content of a specific file for download | `requestId`, `path` |

> **File content is never sent proactively.** The agent only sends base64 in response to a `get_file` request. All other file events carry metadata only, so syncing a large folder has minimal memory and bandwidth impact.

---

## Local WebSocket Server (port 3001)

A legacy local WebSocket server runs on `ws://localhost:3001` for development use. It supports a subset of the above protocol (`list_files`, `save_file`, `email_detected`, `calendar_event`, `file_added`, `agent_status`).

- `GET http://localhost:3001/health` — returns `{ "status": "ok", "clients": N }`
