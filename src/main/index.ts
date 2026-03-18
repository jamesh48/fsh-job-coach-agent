import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	Notification,
	nativeImage,
	shell,
	Tray,
} from 'electron'
import Store from 'electron-store'
import {
	forwardToBackend,
	isBackendConnected,
	startBackendConnection,
} from './backend'
import { setupBrowserCapture } from './browser'
import { startCalendarWatcher, stopCalendarWatcher } from './calendar'
import { startDownloadsWatcher } from './downloads'
import { startGmailWatcher, stopGmailWatcher } from './gmail'
import {
	initiateOAuthFlow,
	refreshTokensIfNeeded,
	startOAuthServer,
} from './oauth'
import type { AgentEvent } from './websocket'
import { broadcast as broadcastLocal, startWebSocketServer } from './websocket'

function broadcast(event: AgentEvent): void {
	broadcastLocal(event)
	forwardToBackend(event)
}

// Initialize store
const store = new Store({
	encryptionKey: 'fsh-agent-secret-key',
})

let mainWindow: BrowserWindow | null = null
let browserWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createMainWindow(): void {
	mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			sandbox: false,
			contextIsolation: true,
			nodeIntegration: false,
		},
	})

	mainWindow.on('ready-to-show', () => {
		mainWindow?.show()
	})

	mainWindow.webContents.setWindowOpenHandler((details) => {
		shell.openExternal(details.url)
		return { action: 'deny' }
	})

	if (is.dev && process.env.ELECTRON_RENDERER_URL) {
		mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
	} else {
		mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
	}
}

function createBrowserWindow(): void {
	browserWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
		},
	})

	browserWindow.loadURL('about:blank')
	browserWindow.on('closed', () => {
		browserWindow = null
	})
	setupBrowserCapture(browserWindow, (job) => {
		broadcast({
			type: 'job_captured',
			payload: job,
			timestamp: new Date().toISOString(),
		})
		mainWindow?.webContents.send('event', {
			type: 'job_captured',
			payload: job,
			timestamp: new Date().toISOString(),
		})

		new Notification({
			title: 'Job Captured',
			body: `${job.title} - ${job.url}`,
		}).show()
	})
}

function createTray(): void {
	const icon = nativeImage.createEmpty()
	tray = new Tray(icon)

	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Show Dashboard', click: () => mainWindow?.show() },
		{
			label: 'Show Browser',
			click: () => {
				browserWindow?.show()
			},
		},
		{ type: 'separator' },
		{ label: 'Quit', click: () => app.quit() },
	])

	tray.setToolTip('FSH Agent')
	tray.setContextMenu(contextMenu)
	tray.on('click', () => mainWindow?.show())
}

app.whenReady().then(async () => {
	electronApp.setAppUserModelId('com.fsh.agent')

	app.on('browser-window-created', (_, window) => {
		optimizer.watchWindowShortcuts(window)
	})

	createMainWindow()
	createBrowserWindow()
	createTray()

	// Start servers and watchers
	await startOAuthServer(store as any)
	startWebSocketServer(store as any)
	startBackendConnection(store as any, (connected) => {
		mainWindow?.webContents.send('backend-status', { connected })
	})

	const tokens = store.get('tokens') as any
	if (tokens) {
		try {
			await refreshTokensIfNeeded(store as any)
			startGmailWatcher(store as any, (email) => {
				broadcast({
					type: 'email_detected',
					payload: email,
					timestamp: new Date().toISOString(),
				})
				mainWindow?.webContents.send('event', {
					type: 'email_detected',
					payload: email,
					timestamp: new Date().toISOString(),
				})
			})
			startCalendarWatcher(store as any, (event) => {
				broadcast({
					type: 'calendar_event',
					payload: event,
					timestamp: new Date().toISOString(),
				})
				mainWindow?.webContents.send('event', {
					type: 'calendar_event',
					payload: event,
					timestamp: new Date().toISOString(),
				})
			})
		} catch (err) {
			console.error('Failed to start watchers:', err)
		}
	}

	startDownloadsWatcher((pdf) => {
		broadcast({
			type: 'new_pdf',
			payload: pdf,
			timestamp: new Date().toISOString(),
		})
		mainWindow?.webContents.send('event', {
			type: 'new_pdf',
			payload: pdf,
			timestamp: new Date().toISOString(),
		})
	})

	// IPC handlers
	ipcMain.handle('get-auth-status', () => {
		const tokens = store.get('tokens')
		return { connected: !!tokens }
	})

	ipcMain.handle('get-backend-status', () => {
		return { connected: isBackendConnected() }
	})

	ipcMain.handle('initiate-oauth', async () => {
		try {
			await initiateOAuthFlow(store as any)
			return { success: true }
		} catch (err: any) {
			return { success: false, error: err.message }
		}
	})

	ipcMain.handle('disconnect-oauth', () => {
		store.delete('tokens')
		stopGmailWatcher()
		stopCalendarWatcher()
		return { success: true }
	})

	ipcMain.handle('capture-current-page', () => {
		if (!browserWindow) createBrowserWindow()
		browserWindow?.show()
		browserWindow?.webContents
			.executeJavaScript(`
      JSON.stringify({ url: window.location.href, title: document.title, text: document.body.innerText.substring(0, 5000) })
    `)
			.then((result) => {
				const job = JSON.parse(result)
				broadcast({
					type: 'job_captured',
					payload: job,
					timestamp: new Date().toISOString(),
				})
				mainWindow?.webContents.send('event', {
					type: 'job_captured',
					payload: job,
					timestamp: new Date().toISOString(),
				})
			})
		return { triggered: true }
	})

	ipcMain.handle('get-settings', () => {
		return {
			gmailPollInterval: store.get('gmailPollInterval', 5),
			calendarPollInterval: store.get('calendarPollInterval', 15),
			fshBackendUrl: store.get('fshBackendUrl', 'https://fshjobcoach.com'),
			googleClientId: store.get('googleClientId', ''),
			googleClientSecret: store.get('googleClientSecret', ''),
			agentSecret: store.get('agentSecret', ''),
		}
	})

	ipcMain.handle('save-settings', (_, settings) => {
		store.set('gmailPollInterval', settings.gmailPollInterval)
		store.set('calendarPollInterval', settings.calendarPollInterval)
		store.set('fshBackendUrl', settings.fshBackendUrl)
		if (settings.googleClientId !== undefined)
			store.set('googleClientId', settings.googleClientId)
		if (settings.googleClientSecret !== undefined)
			store.set('googleClientSecret', settings.googleClientSecret)
		if (settings.agentSecret !== undefined)
			store.set('agentSecret', settings.agentSecret)
		return { success: true }
	})

	ipcMain.handle('navigate-browser', (_, url) => {
		if (!browserWindow) createBrowserWindow()
		browserWindow?.loadURL(url)
		browserWindow?.show()
	})

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})
