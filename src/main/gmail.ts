import type Store from 'electron-store'
import { google } from 'googleapis'
import { getAuthClient, refreshTokensIfNeeded } from './oauth'

let pollInterval: ReturnType<typeof setInterval> | null = null

export interface EmailEvent {
	id: string
	threadId: string
	subject: string
	from: string
	snippet: string
	date: string
}

const QUERY =
	'subject:interview OR subject:offer OR subject:application OR subject:recruiter OR subject:hiring OR subject:job OR subject:position OR subject:role OR subject:opportunity OR subject:candidat OR subject:fsh-test'

export function startGmailWatcher(
	store: Store,
	onEmail: (email: EmailEvent) => void,
): void {
	const seenIds = new Set<string>()

	const poll = async (): Promise<void> => {
		try {
			await refreshTokensIfNeeded(store)
			const auth = getAuthClient(store)
			const gmail = google.gmail({ version: 'v1', auth })

			const res = await gmail.users.messages.list({
				userId: 'me',
				q: QUERY,
				maxResults: 10,
			})

			const messages = res.data.messages || []

			for (const msg of messages) {
				if (!msg.id || seenIds.has(msg.id)) continue
				seenIds.add(msg.id)

				const detail = await gmail.users.messages.get({
					userId: 'me',
					id: msg.id,
					format: 'metadata',
					metadataHeaders: ['Subject', 'From', 'Date'],
				})

				const headers = detail.data.payload?.headers || []
				const getHeader = (name: string) =>
					headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
						?.value || ''

				onEmail({
					id: msg.id,
					threadId: msg.threadId || '',
					subject: getHeader('Subject'),
					from: getHeader('From'),
					snippet: detail.data.snippet || '',
					date: getHeader('Date'),
				})
			}
		} catch (err) {
			console.error('Gmail poll error:', err)
		}
	}

	const intervalMinutes = store.get('gmailPollInterval', 5) as number
	poll()
	pollInterval = setInterval(poll, intervalMinutes * 60 * 1000)
}

export function stopGmailWatcher(): void {
	if (pollInterval) {
		clearInterval(pollInterval)
		pollInterval = null
	}
}
