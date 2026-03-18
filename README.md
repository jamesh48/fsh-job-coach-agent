# FSH Agent

A local Electron desktop app that acts as an AI agent bridge for your job search. It monitors your Gmail and Google Calendar for job-related activity, captures job listings from browser windows, watches your Downloads folder for new PDFs (resumes, offer letters), and exposes all events via a WebSocket API on port 3001 for integration with external tools.

## What This App Does

- **Gmail monitoring** — polls your inbox for emails with subjects matching interview, offer, application, recruiter, or hiring keywords
- **Google Calendar monitoring** — watches your next 7 days of events and flags anything that looks like an interview or recruiter call
- **Job page capture** — opens a built-in browser window; automatically captures job listings when you land on supported job sites (LinkedIn, Indeed, Greenhouse, Lever, Workday, Wellfound)
- **PDF watcher** — monitors your Downloads folder and forwards any new PDF files as base64 payloads via WebSocket
- **WebSocket + HTTP server** — exposes all events on `ws://localhost:3001` and a REST health endpoint at `http://localhost:3001/health`
- **System tray** — runs quietly in the background with a tray icon for quick access

## Prerequisites

- Node.js 18 or later
- A Google Cloud project with the Gmail API and Google Calendar API enabled
- OAuth 2.0 credentials (Desktop app type)

## Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or select an existing one)
2. Navigate to **APIs & Services > Library**
3. Search for and enable **Gmail API**
4. Search for and enable **Google Calendar API**
5. Navigate to **APIs & Services > Credentials**
6. Click **Create Credentials > OAuth 2.0 Client ID**
7. Set Application type to **Desktop app**
8. Give it a name (e.g., "FSH Agent")
9. Click **Create**
10. Copy your **Client ID** and **Client Secret**
11. Under **APIs & Services > OAuth consent screen**, add your Google account as a test user (if the app is in testing mode)
12. No redirect URI configuration needed — Desktop app credentials automatically allow `http://localhost` redirects

## Installation

```bash
npm install
npm run dev
```

## First-Time Setup

1. Launch the app with `npm run dev`
2. Click **Show** next to Settings at the bottom of the dashboard
3. Paste your **Google Client ID** and **Google Client Secret**
4. Set your preferred **FSH Backend URL** (defaults to `https://fshjobcoach.com`)
5. Adjust poll intervals if desired
6. Click **Save Settings**
7. Click **Connect Google** — your browser will open the Google OAuth consent screen
8. Grant the requested permissions
9. Return to the app — it will show "Google Connected" and begin monitoring

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

## Build for Production

```bash
npm run build
```

Output goes to `out/`. To package into a distributable, add `electron-builder` or `electron-forge` to the project.
