import { contextBridge, ipcRenderer } from 'electron'

const api = {
	getAuthStatus: () => ipcRenderer.invoke('get-auth-status'),
	getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
	initiateOAuth: () => ipcRenderer.invoke('initiate-oauth'),
	disconnectOAuth: () => ipcRenderer.invoke('disconnect-oauth'),
	captureCurrentPage: () => ipcRenderer.invoke('capture-current-page'),
	getSettings: () => ipcRenderer.invoke('get-settings'),
	saveSettings: (settings: unknown) =>
		ipcRenderer.invoke('save-settings', settings),
	navigateBrowser: (url: string) => ipcRenderer.invoke('navigate-browser', url),
	onEvent: (callback: (event: unknown) => void) => {
		ipcRenderer.on('event', (_, data) => callback(data))
		return () => ipcRenderer.removeAllListeners('event')
	},
	onBackendStatus: (callback: (connected: boolean) => void) => {
		ipcRenderer.on('backend-status', (_, data) => callback(data.connected))
		return () => ipcRenderer.removeAllListeners('backend-status')
	},
}

contextBridge.exposeInMainWorld('fshAgent', api)
