import type Store from 'electron-store'
import { google } from 'googleapis'
import { getAuthClient, refreshTokensIfNeeded } from './oauth'

let pollInterval: ReturnType<typeof setInterval> | null = null

export interface CalendarEvent {
	id: string
	summary: string
	start: string
	end: string
	description: string
	isInterview: boolean
}

const INTERVIEW_KEYWORDS = [
	'interview',
	'call',
	'meeting',
	'hiring',
	'recruiter',
	'screen',
	'technical',
]

function isInterviewEvent(event: {
	summary?: string | null
	description?: string | null
}): boolean {
	const text = `${event.summary || ''} ${event.description || ''}`.toLowerCase()
	return INTERVIEW_KEYWORDS.some((kw) => text.includes(kw))
}

export function startCalendarWatcher(
	store: Store,
	onEvent: (event: CalendarEvent) => void,
): void {
	const seenIds = new Set<string>()

	const poll = async (): Promise<void> => {
		try {
			await refreshTokensIfNeeded(store)
			const auth = getAuthClient(store)
			const calendar = google.calendar({ version: 'v3', auth })

			const now = new Date()
			const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

			const res = await calendar.events.list({
				calendarId: 'primary',
				timeMin: now.toISOString(),
				timeMax: weekFromNow.toISOString(),
				singleEvents: true,
				orderBy: 'startTime',
			})

			const events = res.data.items || []

			for (const event of events) {
				if (!event.id) continue
				const isInterview = isInterviewEvent(event)

				if (isInterview && !seenIds.has(event.id)) {
					seenIds.add(event.id)
					onEvent({
						id: event.id,
						summary: event.summary || '',
						start: event.start?.dateTime || event.start?.date || '',
						end: event.end?.dateTime || event.end?.date || '',
						description: event.description || '',
						isInterview,
					})
				}
			}
		} catch (err) {
			console.error('Calendar poll error:', err)
		}
	}

	const intervalMinutes = store.get('calendarPollInterval', 15) as number
	poll()
	pollInterval = setInterval(poll, intervalMinutes * 60 * 1000)
}

export function stopCalendarWatcher(): void {
	if (pollInterval) {
		clearInterval(pollInterval)
		pollInterval = null
	}
}
