import { shell } from 'electron'
import type Store from 'electron-store'
import type { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'

const SCOPES = [
	'https://www.googleapis.com/auth/gmail.readonly',
	'https://www.googleapis.com/auth/calendar.readonly',
]

let oauthClient: OAuth2Client | null = null
let resolveOAuth: ((value: any) => void) | null = null

export function getAuthClient(store: Store): OAuth2Client {
	if (!oauthClient) {
		const clientId = store.get('googleClientId', '') as string
		const clientSecret = store.get('googleClientSecret', '') as string
		oauthClient = new google.auth.OAuth2(
			clientId,
			clientSecret,
			'http://localhost:3001/oauth/callback',
		)

		const tokens = store.get('tokens') as any
		if (tokens) {
			oauthClient.setCredentials(tokens)
		}
	}
	return oauthClient
}

export async function refreshTokensIfNeeded(store: Store): Promise<void> {
	const client = getAuthClient(store)
	const tokens = store.get('tokens') as any
	if (!tokens) return

	const expiryDate = tokens.expiry_date
	const isExpired = expiryDate && Date.now() >= expiryDate - 5 * 60 * 1000

	if (isExpired && tokens.refresh_token) {
		const { credentials } = await client.refreshAccessToken()
		store.set('tokens', credentials)
		client.setCredentials(credentials)
	}
}

export async function startOAuthServer(store: Store): Promise<void> {
	// OAuth callback is handled by the Express server in websocket.ts
	// This just sets up the client
	getAuthClient(store)
}

export async function initiateOAuthFlow(store: Store): Promise<void> {
	return new Promise((resolve, reject) => {
		const client = getAuthClient(store)

		const clientId = store.get('googleClientId', '') as string
		const clientSecret = store.get('googleClientSecret', '') as string

		if (!clientId || !clientSecret) {
			reject(
				new Error(
					'Google Client ID and Secret not configured. Please add them in Settings.',
				),
			)
			return
		}

		const authUrl = client.generateAuthUrl({
			access_type: 'offline',
			scope: SCOPES,
			prompt: 'consent',
		})

		resolveOAuth = resolve
		shell.openExternal(authUrl)

		// Timeout after 5 minutes
		setTimeout(
			() => {
				reject(new Error('OAuth timeout'))
			},
			5 * 60 * 1000,
		)
	})
}

export async function handleOAuthCallback(
	code: string,
	store: Store,
): Promise<void> {
	const client = getAuthClient(store)
	const { tokens } = await client.getToken(code)
	client.setCredentials(tokens)
	store.set('tokens', tokens)

	if (resolveOAuth) {
		resolveOAuth(tokens)
		resolveOAuth = null
	}
}
