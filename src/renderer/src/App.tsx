import { useCallback, useEffect, useState } from 'react'

interface AgentEvent {
	type: string
	payload: unknown
	timestamp: string
}

interface Settings {
	gmailPollInterval: number
	calendarPollInterval: number
	fshBackendUrl: string
	googleClientId?: string
	googleClientSecret?: string
	agentSecret?: string
}

declare global {
	interface Window {
		fshAgent: {
			getAuthStatus: () => Promise<{ connected: boolean }>
			getBackendStatus: () => Promise<{ connected: boolean }>
			initiateOAuth: () => Promise<{ success: boolean; error?: string }>
			disconnectOAuth: () => Promise<{ success: boolean }>
			captureCurrentPage: () => Promise<unknown>
			getSettings: () => Promise<Settings>
			saveSettings: (settings: Settings) => Promise<{ success: boolean }>
			navigateBrowser: (url: string) => Promise<void>
			onEvent: (callback: (event: AgentEvent) => void) => () => void
			onBackendStatus: (callback: (connected: boolean) => void) => () => void
		}
	}
}

const EVENT_TYPE_COLORS: Record<string, string> = {
	job_captured: '#10b981',
	email_detected: '#3b82f6',
	calendar_event: '#8b5cf6',
	new_pdf: '#f59e0b',
	agent_status: '#6b7280',
}

export default function App(): JSX.Element {
	const [authStatus, setAuthStatus] = useState(false)
	const [backendConnected, setBackendConnected] = useState(false)
	const [events, setEvents] = useState<AgentEvent[]>([])
	const [settings, setSettings] = useState<Settings>({
		gmailPollInterval: 5,
		calendarPollInterval: 15,
		fshBackendUrl: 'https://fshjobcoach.com',
	})
	const [showSettings, setShowSettings] = useState(false)
	const [connecting, setConnecting] = useState(false)
	const [settingsSaved, setSettingsSaved] = useState(false)

	const addEvent = useCallback((event: AgentEvent) => {
		setEvents((prev) => [event, ...prev].slice(0, 10))
	}, [])

	useEffect(() => {
		// Load initial state
		window.fshAgent.getAuthStatus().then((s) => setAuthStatus(s.connected))
		window.fshAgent
			.getBackendStatus()
			.then((s) => setBackendConnected(s.connected))
		window.fshAgent.getSettings().then(setSettings)

		// Listen for events
		const cleanupEvents = window.fshAgent.onEvent(addEvent)
		const cleanupBackend = window.fshAgent.onBackendStatus(setBackendConnected)
		return () => {
			cleanupEvents()
			cleanupBackend()
		}
	}, [addEvent])

	const handleConnect = async (): Promise<void> => {
		setConnecting(true)
		try {
			const result = await window.fshAgent.initiateOAuth()
			if (result.success) {
				setAuthStatus(true)
			} else {
				alert(result.error || 'OAuth failed')
			}
		} finally {
			setConnecting(false)
		}
	}

	const handleDisconnect = async (): Promise<void> => {
		await window.fshAgent.disconnectOAuth()
		setAuthStatus(false)
	}

	const handleSaveSettings = async (): Promise<void> => {
		await window.fshAgent.saveSettings(settings)
		setSettingsSaved(true)
		setTimeout(() => setSettingsSaved(false), 2000)
	}

	const styles = {
		app: {
			fontFamily:
				'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
			background: '#0f172a',
			color: '#e2e8f0',
			minHeight: '100vh',
			padding: '0',
		} as React.CSSProperties,
		header: {
			background: '#1e293b',
			borderBottom: '1px solid #334155',
			padding: '16px 24px',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
		} as React.CSSProperties,
		title: {
			margin: 0,
			fontSize: '20px',
			fontWeight: 700,
			color: '#f1f5f9',
			letterSpacing: '-0.5px',
		} as React.CSSProperties,
		badge: (color: string) =>
			({
				display: 'inline-flex',
				alignItems: 'center',
				gap: '6px',
				background: `${color}20`,
				color: color,
				border: `1px solid ${color}40`,
				borderRadius: '20px',
				padding: '4px 12px',
				fontSize: '12px',
				fontWeight: 600,
			}) as React.CSSProperties,
		dot: (color: string) =>
			({
				width: '6px',
				height: '6px',
				borderRadius: '50%',
				background: color,
			}) as React.CSSProperties,
		main: {
			padding: '24px',
			maxWidth: '800px',
			margin: '0 auto',
		} as React.CSSProperties,
		card: {
			background: '#1e293b',
			border: '1px solid #334155',
			borderRadius: '12px',
			padding: '20px',
			marginBottom: '16px',
		} as React.CSSProperties,
		cardTitle: {
			margin: '0 0 16px 0',
			fontSize: '14px',
			fontWeight: 600,
			color: '#94a3b8',
			textTransform: 'uppercase' as const,
			letterSpacing: '0.5px',
		},
		btn: (variant: 'primary' | 'danger' | 'secondary') => {
			const colors = {
				primary: { bg: '#3b82f6', hover: '#2563eb' },
				danger: { bg: '#ef4444', hover: '#dc2626' },
				secondary: { bg: '#334155', hover: '#475569' },
			}
			return {
				padding: '8px 16px',
				borderRadius: '8px',
				border: 'none',
				background: colors[variant].bg,
				color: '#fff',
				fontWeight: 600,
				fontSize: '14px',
				cursor: 'pointer',
				transition: 'background 0.15s',
			} as React.CSSProperties
		},
		input: {
			width: '100%',
			padding: '8px 12px',
			background: '#0f172a',
			border: '1px solid #334155',
			borderRadius: '8px',
			color: '#e2e8f0',
			fontSize: '14px',
			boxSizing: 'border-box' as const,
		} as React.CSSProperties,
		label: {
			display: 'block',
			fontSize: '13px',
			color: '#94a3b8',
			marginBottom: '6px',
		} as React.CSSProperties,
		formGroup: {
			marginBottom: '14px',
		} as React.CSSProperties,
		eventItem: {
			display: 'flex',
			alignItems: 'flex-start',
			gap: '12px',
			padding: '10px 0',
			borderBottom: '1px solid #1e293b',
		} as React.CSSProperties,
		eventBadge: (type: string) =>
			({
				flexShrink: 0,
				padding: '2px 8px',
				borderRadius: '4px',
				fontSize: '11px',
				fontWeight: 600,
				background: `${EVENT_TYPE_COLORS[type] || '#6b7280'}20`,
				color: EVENT_TYPE_COLORS[type] || '#6b7280',
				border: `1px solid ${EVENT_TYPE_COLORS[type] || '#6b7280'}40`,
			}) as React.CSSProperties,
		row: {
			display: 'flex',
			gap: '12px',
			alignItems: 'center',
		} as React.CSSProperties,
	}

	return (
		<div style={styles.app}>
			<div style={styles.header}>
				<h1 style={styles.title}>FSH Agent</h1>
				<div style={styles.row}>
					<span style={styles.badge(authStatus ? '#10b981' : '#6b7280')}>
						<span style={styles.dot(authStatus ? '#10b981' : '#6b7280')} />
						{authStatus ? 'Google Connected' : 'Google Disconnected'}
					</span>
					<span style={styles.badge(backendConnected ? '#10b981' : '#6b7280')}>
						<span
							style={styles.dot(backendConnected ? '#10b981' : '#6b7280')}
						/>
						{backendConnected ? 'Backend Connected' : 'Backend Disconnected'}
					</span>
				</div>
			</div>

			<div style={styles.main}>
				{/* Auth Card */}
				<div style={styles.card}>
					<p style={styles.cardTitle}>Google Authentication</p>
					<div style={styles.row}>
						<span style={{ flex: 1, fontSize: '14px', color: '#94a3b8' }}>
							{authStatus
								? 'Connected to Gmail and Google Calendar'
								: 'Connect to enable email and calendar monitoring'}
						</span>
						{authStatus ? (
							<button
								type="button"
								style={styles.btn('danger')}
								onClick={handleDisconnect}
							>
								Disconnect
							</button>
						) : (
							<button
								type="button"
								style={styles.btn('primary')}
								onClick={handleConnect}
								disabled={connecting}
							>
								{connecting ? 'Opening browser...' : 'Connect Google'}
							</button>
						)}
					</div>
					{!authStatus && (
						<p
							style={{
								fontSize: '12px',
								color: '#64748b',
								marginTop: '10px',
								marginBottom: 0,
							}}
						>
							Requires Google Client ID &amp; Secret — configure in Settings
							below
						</p>
					)}
				</div>

				{/* Actions Card */}
				<div style={styles.card}>
					<p style={styles.cardTitle}>Actions</p>
					<div style={styles.row}>
						<button
							type="button"
							style={styles.btn('secondary')}
							onClick={() => window.fshAgent.captureCurrentPage()}
						>
							Capture Current Page
						</button>
						<button
							type="button"
							style={styles.btn('secondary')}
							onClick={() =>
								window.fshAgent.navigateBrowser('https://linkedin.com/jobs')
							}
						>
							Open LinkedIn Jobs
						</button>
						<button
							type="button"
							style={styles.btn('secondary')}
							onClick={() =>
								window.fshAgent.navigateBrowser('https://indeed.com')
							}
						>
							Open Indeed
						</button>
					</div>
				</div>

				{/* Events Feed */}
				<div style={styles.card}>
					<p style={styles.cardTitle}>Recent Events ({events.length})</p>
					{events.length === 0 ? (
						<p style={{ color: '#475569', fontSize: '14px', margin: 0 }}>
							No events yet. Events will appear here as they are detected.
						</p>
					) : (
						<div>
							{events.map((event) => (
								<div
									key={`${event.type}-${event.timestamp}`}
									style={styles.eventItem}
								>
									<span style={styles.eventBadge(event.type)}>
										{event.type}
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div
											style={{
												fontSize: '13px',
												color: '#cbd5e1',
												wordBreak: 'break-all',
											}}
										>
											{JSON.stringify(event.payload).substring(0, 100)}
										</div>
										<div
											style={{
												fontSize: '11px',
												color: '#475569',
												marginTop: '2px',
											}}
										>
											{new Date(event.timestamp).toLocaleTimeString()}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Settings */}
				<div style={styles.card}>
					<div style={{ ...styles.row, marginBottom: '16px' }}>
						<p style={{ ...styles.cardTitle, margin: 0 }}>Settings</p>
						<button
							type="button"
							style={{
								...styles.btn('secondary'),
								fontSize: '12px',
								padding: '4px 10px',
							}}
							onClick={() => setShowSettings(!showSettings)}
						>
							{showSettings ? 'Hide' : 'Show'}
						</button>
					</div>
					{showSettings && (
						<div>
							<div style={styles.formGroup}>
								<label htmlFor="googleClientId" style={styles.label}>
									Google Client ID
								</label>
								<input
									id="googleClientId"
									style={styles.input}
									type="text"
									placeholder="your-client-id.apps.googleusercontent.com"
									value={settings.googleClientId || ''}
									onChange={(e) =>
										setSettings({ ...settings, googleClientId: e.target.value })
									}
								/>
							</div>
							<div style={styles.formGroup}>
								<label htmlFor="googleClientSecret" style={styles.label}>
									Google Client Secret
								</label>
								<input
									id="googleClientSecret"
									style={styles.input}
									type="password"
									placeholder="GOCSPX-..."
									value={settings.googleClientSecret || ''}
									onChange={(e) =>
										setSettings({
											...settings,
											googleClientSecret: e.target.value,
										})
									}
								/>
							</div>
							<div style={styles.formGroup}>
								<label htmlFor="fshBackendUrl" style={styles.label}>
									FSH Backend URL
								</label>
								<input
									id="fshBackendUrl"
									style={styles.input}
									type="text"
									value={settings.fshBackendUrl}
									onChange={(e) =>
										setSettings({ ...settings, fshBackendUrl: e.target.value })
									}
								/>
							</div>
							<div style={styles.formGroup}>
								<label htmlFor="agentSecret" style={styles.label}>
									Agent Secret
								</label>
								<input
									id="agentSecret"
									style={styles.input}
									type="password"
									placeholder="Shared secret for backend connection"
									value={settings.agentSecret || ''}
									onChange={(e) =>
										setSettings({ ...settings, agentSecret: e.target.value })
									}
								/>
							</div>
							<div style={{ ...styles.row, gap: '16px' }}>
								<div style={{ flex: 1 }}>
									<label htmlFor="gmailPollInterval" style={styles.label}>
										Gmail Poll Interval (minutes)
									</label>
									<input
										id="gmailPollInterval"
										style={styles.input}
										type="number"
										min={1}
										max={60}
										value={settings.gmailPollInterval}
										onChange={(e) =>
											setSettings({
												...settings,
												gmailPollInterval: Number(e.target.value),
											})
										}
									/>
								</div>
								<div style={{ flex: 1 }}>
									<label htmlFor="calendarPollInterval" style={styles.label}>
										Calendar Poll Interval (minutes)
									</label>
									<input
										id="calendarPollInterval"
										style={styles.input}
										type="number"
										min={1}
										max={60}
										value={settings.calendarPollInterval}
										onChange={(e) =>
											setSettings({
												...settings,
												calendarPollInterval: Number(e.target.value),
											})
										}
									/>
								</div>
							</div>
							<div style={{ marginTop: '16px' }}>
								<button
									type="button"
									style={styles.btn('primary')}
									onClick={handleSaveSettings}
								>
									{settingsSaved ? 'Saved!' : 'Save Settings'}
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
