# FSH Agent

A local Electron desktop app that acts as an AI agent bridge for your job search. It monitors your Gmail and Google Calendar for job-related activity, captures job listings from browser windows, watches your Downloads folder for new PDFs (resumes, offer letters), and exposes all events via a WebSocket API on port 3001 for integration with external tools.

## What This App Does

- **Gmail monitoring** — polls your inbox for emails with subjects matching interview, offer, application, recruiter, or hiring keywords
- **Google Calendar monitoring** — watches your next 7 days of events and flags anything that looks like an interview or recruiter call
- **Job page capture** *(in development)* — opens a built-in browser window; automatically captures job listings when you land on supported job sites (LinkedIn, Indeed, Greenhouse, Lever, Workday, Wellfound)
- **PDF watcher** *(in development)* — monitors your Downloads folder and forwards any new PDF files as base64 payloads via WebSocket
- **WebSocket + HTTP server** — exposes all events on `ws://localhost:3001` and a REST health endpoint at `http://localhost:3001/health`
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

The desktop agent connects to the FSH web app via WebSocket and must authenticate with a shared secret. This is separate from your Anthropic API key — the API key lives entirely in the web app and the agent never needs it.

**Step 1 — Set the secret in the web app**

In the FSH web app, go to **Settings → Security** and set an Agent Secret. This is the value the web app will require from any connecting agent.

**Step 2 — Enter the same secret in the desktop app**

In FSH Agent, open Settings and paste the same secret into the **Agent Secret** field, then click **Save Settings**.

The agent stores the secret locally and sends it as a query parameter when connecting (`/ws/agent?secret=<your-secret>`). If the secret is missing from the agent settings, no connection will be attempted. If it doesn't match what the web app expects, the WebSocket connection will be rejected.

---

## For Developers

This section is for people building or modifying the app from source.

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

- `src/main/` — Electron main process (Node.js). All system access lives here: OAuth, Gmail, Calendar, Downloads watcher, WebSocket server, IPC handlers.
- `src/preload/index.ts` — Exposes a typed `window.fshAgent` bridge to the renderer via `contextBridge`.
- `src/renderer/` — React UI. Communicates with main exclusively through `window.fshAgent`.

### Key Patterns

- `browserWindow` can be `null` after the user closes it — always check and recreate with `createBrowserWindow()` before use, then use `!` non-null assertion on subsequent accesses.
- Events flow through `broadcast()` (WebSocket) + `mainWindow.webContents.send('event', ...)` (IPC to renderer) in parallel.
- `electron-store` (encrypted) holds tokens and settings. Access via `store.get` / `store.set` / `store.delete`.

---

## WebSocket API

Connect to `ws://localhost:3001` to receive real-time events.

### Event Types

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
| `agent_status` | Connection confirmation or pong | `status`, `version` |
| `email_detected` | Job-related email found in Gmail | `id`, `threadId`, `subject`, `from`, `snippet`, `date` |
| `calendar_event` | Interview-like calendar event detected | `id`, `summary`, `start`, `end`, `description`, `isInterview` |
| `job_captured` | Job page captured from browser | `url`, `title`, `text`, `capturedAt` |
| `new_pdf` | New PDF added to Downloads folder | `filename`, `path`, `base64`, `size` |

### Sending Messages

```json
{ "type": "ping" }
```
Responds with an `agent_status` pong.

```json
{ "type": "set_config", "payload": { "gmailPollInterval": 10 } }
```
Updates a config value in the store.

### HTTP Endpoints

- `GET http://localhost:3001/health` — returns `{ "status": "ok", "clients": N }`
- `GET http://localhost:3001/oauth/callback` — used internally by the OAuth flow
