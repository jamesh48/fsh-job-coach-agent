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
	setMessageHandler,
	startBackendConnection,
} from './backend'
import { setupBrowserCapture } from './browser'
import { startCalendarWatcher, stopCalendarWatcher } from './calendar'
import { startDownloadsWatcher } from './downloads'
import {
	DEFAULT_FILES_DIR,
	deleteFile,
	listFiles,
	readFileEvent,
	saveFile,
	startFilesWatcher,
	stopFilesWatcher,
} from './files'
import { startGmailWatcher, stopGmailWatcher } from './gmail'
import {
	initiateOAuthFlow,
	refreshTokensIfNeeded,
	startOAuthServer,
} from './oauth'
import type { AgentEvent } from './websocket'
import {
	broadcast as broadcastLocal,
	setListFilesHandler,
	setSaveFileHandler,
	startWebSocketServer,
} from './websocket'

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

	const filesDir =
		(store.get('filesWatchDir', DEFAULT_FILES_DIR) as string) ||
		DEFAULT_FILES_DIR

	const broadcastFile = (file: ReturnType<typeof listFiles>[number]): void => {
		broadcast({
			type: 'file_added',
			payload: file,
			timestamp: new Date().toISOString(),
		})
		mainWindow?.webContents.send('event', {
			type: 'file_added',
			payload: file,
			timestamp: new Date().toISOString(),
		})
	}

	const broadcastFileRemoved = (filePath: string): void => {
		broadcast({
			type: 'file_removed',
			payload: { path: filePath },
			timestamp: new Date().toISOString(),
		})
	}

	startFilesWatcher(filesDir, broadcastFile, broadcastFileRemoved)

	setListFilesHandler(() => {
		const currentDir =
			(store.get('filesWatchDir', DEFAULT_FILES_DIR) as string) ||
			DEFAULT_FILES_DIR
		listFiles(currentDir).forEach(broadcastFile)
	})

	setSaveFileHandler((filename, base64) => {
		const currentDir =
			(store.get('filesWatchDir', DEFAULT_FILES_DIR) as string) ||
			DEFAULT_FILES_DIR
		saveFile(currentDir, filename, base64)
	})

	setMessageHandler((msg) => {
		const currentDir =
			(store.get('filesWatchDir', DEFAULT_FILES_DIR) as string) ||
			DEFAULT_FILES_DIR

		if (msg.type === 'list_files') {
			listFiles(currentDir).forEach((file) => {
				forwardToBackend({
					type: 'file_added',
					payload: file,
					timestamp: new Date().toISOString(),
				})
			})
		}

		if (msg.type === 'save_file') {
			const p = msg.payload as { filename: string; base64: string } | undefined
			if (p?.filename && p?.base64) {
				saveFile(currentDir, p.filename, p.base64)
			}
		}

		if (msg.type === 'delete_file') {
			const p = msg.payload as { path: string } | undefined
			if (p?.path) {
				deleteFile(p.path)
			}
		}

		if (msg.type === 'get_file') {
			const p = msg.payload as { requestId: string; path: string } | undefined
			if (p?.requestId && p?.path) {
				const event = readFileEvent(p.path)
				if (event) {
					forwardToBackend({
						type: 'file_content',
						payload: {
							requestId: p.requestId,
							base64: event.base64,
							mimeType: event.mimeType,
						},
						timestamp: new Date().toISOString(),
					})
				}
			}
		}
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
			filesWatchDir: store.get('filesWatchDir', DEFAULT_FILES_DIR),
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
		if (settings.filesWatchDir !== undefined) {
			const newDir = settings.filesWatchDir || DEFAULT_FILES_DIR
			store.set('filesWatchDir', newDir)
			startFilesWatcher(newDir, broadcastFile)
		}
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

app.on('before-quit', () => {
	stopFilesWatcher()
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})
