import type Store from 'electron-store'
import { WebSocket } from 'ws'
import type { AgentEvent } from './websocket'

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 2000
let store: Store | null = null
let stopped = false
let onStatusChange: ((connected: boolean) => void) | null = null
let messageHandler:
	| ((msg: { type: string; payload?: unknown }) => void)
	| null = null

export function setMessageHandler(
	fn: (msg: { type: string; payload?: unknown }) => void,
): void {
	messageHandler = fn
}

export function startBackendConnection(
	storeInstance: Store,
	statusCallback?: (connected: boolean) => void,
): void {
	store = storeInstance
	onStatusChange = statusCallback ?? null
	stopped = false
	connect()
}

export function stopBackendConnection(): void {
	stopped = true
	if (reconnectTimer) {
		clearTimeout(reconnectTimer)
		reconnectTimer = null
	}
	ws?.close()
	ws = null
}

export function isBackendConnected(): boolean {
	return ws?.readyState === WebSocket.OPEN
}

export function forwardToBackend(event: AgentEvent): void {
	if (ws?.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(event))
	}
}

function connect(): void {
	if (!store) return

	const backendUrl = store.get('fshBackendUrl', '') as string
	const secret = store.get('agentSecret', '') as string

	if (!backendUrl || !secret) return

	const normalized = /^https?:\/\//.test(backendUrl)
		? backendUrl
		: `http://${backendUrl}`

	const wsUrl = normalized
		.replace(/^https:\/\//, 'wss://')
		.replace(/^http:\/\//, 'ws://')
		.replace(/\/$/, '')

	let url: string
	try {
		url = new URL(`${wsUrl}/ws/agent`).toString()
		url += `?secret=${encodeURIComponent(secret)}`
	} catch {
		console.error('Invalid backend URL:', backendUrl)
		return
	}

	ws = new WebSocket(url)

	ws.on('open', () => {
		reconnectDelay = 2000
		onStatusChange?.(true)
	})

	ws.on('message', (data: Buffer) => {
		try {
			const msg = JSON.parse(data.toString()) as {
				type: string
				payload?: unknown
			}
			messageHandler?.(msg)
		} catch {
			// ignore malformed messages
		}
	})

	ws.on('close', () => {
		ws = null
		onStatusChange?.(false)
		if (!stopped) scheduleReconnect()
	})

	ws.on('error', (err) => {
		console.error('Backend WS error:', err.message)
		ws = null
		onStatusChange?.(false)
		if (!stopped) scheduleReconnect()
	})
}

function scheduleReconnect(): void {
	if (reconnectTimer) return
	console.log(`Reconnecting to backend in ${reconnectDelay / 1000}s...`)
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null
		reconnectDelay = Math.min(reconnectDelay * 2, 30000)
		connect()
	}, reconnectDelay)
}
