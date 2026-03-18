import http from 'node:http'
import type Store from 'electron-store'
import express from 'express'
import { WebSocket, WebSocketServer } from 'ws'
import { handleOAuthCallback } from './oauth'

export interface AgentEvent {
	type:
		| 'job_captured'
		| 'email_detected'
		| 'calendar_event'
		| 'new_pdf'
		| 'agent_status'
	payload: unknown
	timestamp: string
}

let wss: WebSocketServer | null = null
const clients = new Set<WebSocket>()
let store: Store | null = null

export function startWebSocketServer(storeInstance?: Store): void {
	if (storeInstance) store = storeInstance

	const app = express()
	app.use(express.json())

	app.get('/oauth/callback', async (req, res) => {
		const code = req.query.code as string
		if (!code) {
			res.send('Error: no code received')
			return
		}
		try {
			if (store) await handleOAuthCallback(code, store)
			res.send(
				'<html><body><h2>Authentication successful! You can close this tab.</h2></body></html>',
			)
		} catch (err: any) {
			res.send(`Error: ${err.message}`)
		}
	})

	app.get('/health', (_, res) => {
		res.json({ status: 'ok', clients: clients.size })
	})

	const server = http.createServer(app)

	wss = new WebSocketServer({ server })

	wss.on('connection', (ws: WebSocket) => {
		clients.add(ws)
		console.log(`WebSocket client connected. Total: ${clients.size}`)

		ws.send(
			JSON.stringify({
				type: 'agent_status',
				payload: { status: 'connected', version: '1.0.0' },
				timestamp: new Date().toISOString(),
			}),
		)

		ws.on('message', (data: Buffer) => {
			try {
				const msg = JSON.parse(data.toString())
				handleIncoming(msg)
			} catch (err) {
				console.error('Invalid WS message:', err)
			}
		})

		ws.on('close', () => {
			clients.delete(ws)
			console.log(`WebSocket client disconnected. Total: ${clients.size}`)
		})

		ws.on('error', (err) => {
			console.error('WebSocket error:', err)
			clients.delete(ws)
		})
	})

	server.listen(3001, () => {
		console.log('FSH Agent server running on port 3001')
	})
}

function handleIncoming(msg: { type: string; payload?: unknown }): void {
	switch (msg.type) {
		case 'ping':
			broadcast({
				type: 'agent_status',
				payload: { pong: true },
				timestamp: new Date().toISOString(),
			})
			break
		case 'request_capture':
			// Trigger will be handled by main process IPC
			break
		case 'set_config':
			if (store && msg.payload && typeof msg.payload === 'object') {
				Object.entries(msg.payload as Record<string, unknown>).forEach(
					([key, value]) => {
						store?.set(key, value)
					},
				)
			}
			break
	}
}

export function broadcast(event: AgentEvent): void {
	const data = JSON.stringify(event)
	clients.forEach((client) => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data)
		}
	})
}
