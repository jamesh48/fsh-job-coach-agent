import {
	AccountCircleOutlined,
	CableOutlined,
	CalendarMonthOutlined,
	CancelOutlined,
	CheckCircleOutlined,
	ChevronRight,
	DescriptionOutlined,
	FolderOutlined,
	LinkOutlined,
	SaveOutlined,
	SearchOutlined,
	SettingsOutlined,
	WorkOutlined,
} from '@mui/icons-material'
import {
	Alert,
	AppBar,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Collapse,
	CssBaseline,
	createTheme,
	Divider,
	IconButton,
	InputAdornment,
	List,
	ListItem,
	ListItemIcon,
	ListItemText,
	MenuItem,
	Select,
	Snackbar,
	Stack,
	TextField,
	ThemeProvider,
	Toolbar,
	Tooltip,
	Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'

const theme = createTheme({
	palette: {
		mode: 'dark',
		primary: { main: '#3b82f6' },
		success: { main: '#10b981' },
		warning: { main: '#f59e0b' },
		error: { main: '#ef4444' },
		background: {
			default: '#0f172a',
			paper: '#1e293b',
		},
		divider: '#334155',
		text: {
			primary: '#f1f5f9',
			secondary: '#94a3b8',
		},
	},
	shape: { borderRadius: 10 },
	components: {
		MuiCard: {
			styleOverrides: {
				root: { border: '1px solid #334155' },
			},
		},
		MuiOutlinedInput: {
			styleOverrides: {
				root: {
					'& fieldset': { borderColor: '#334155' },
					'&:hover fieldset': { borderColor: '#475569' },
				},
			},
		},
	},
})

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
	filesWatchDir?: string
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

const EVENT_META: Record<
	string,
	{ label: string; color: string; icon: React.ReactNode }
> = {
	job_captured: {
		label: 'Job',
		color: '#10b981',
		icon: <WorkOutlined fontSize="small" />,
	},
	email_detected: {
		label: 'Email',
		color: '#3b82f6',
		icon: <DescriptionOutlined fontSize="small" />,
	},
	calendar_event: {
		label: 'Calendar',
		color: '#8b5cf6',
		icon: <CalendarMonthOutlined fontSize="small" />,
	},
	new_pdf: {
		label: 'PDF',
		color: '#f59e0b',
		icon: <DescriptionOutlined fontSize="small" />,
	},
	file_added: {
		label: 'File',
		color: '#06b6d4',
		icon: <FolderOutlined fontSize="small" />,
	},
	agent_status: {
		label: 'Status',
		color: '#6b7280',
		icon: <CableOutlined fontSize="small" />,
	},
}

const POLL_INTERVALS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
const snapToInterval = (value: number): number =>
	POLL_INTERVALS.find((n) => n >= value) ?? 60

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
	const [snackbar, setSnackbar] = useState<{
		open: boolean
		message: string
		severity: 'success' | 'error'
	}>({ open: false, message: '', severity: 'success' })

	const addEvent = useCallback((event: AgentEvent) => {
		setEvents((prev) => [event, ...prev].slice(0, 20))
	}, [])

	useEffect(() => {
		window.fshAgent.getAuthStatus().then((s) => setAuthStatus(s.connected))
		window.fshAgent
			.getBackendStatus()
			.then((s) => setBackendConnected(s.connected))
		window.fshAgent.getSettings().then((s) =>
			setSettings({
				...s,
				gmailPollInterval: snapToInterval(s.gmailPollInterval),
				calendarPollInterval: snapToInterval(s.calendarPollInterval),
			}),
		)

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
				setSnackbar({
					open: true,
					message: result.error || 'OAuth failed',
					severity: 'error',
				})
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
		setSnackbar({ open: true, message: 'Settings saved', severity: 'success' })
	}

	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />

			{/* Header */}
			<AppBar
				position="static"
				elevation={0}
				sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
			>
				<Toolbar sx={{ gap: 1.5 }}>
					<Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
						FSH Agent
					</Typography>
					<Chip
						size="small"
						icon={authStatus ? <CheckCircleOutlined /> : <CancelOutlined />}
						label={authStatus ? 'Google Connected' : 'Google Disconnected'}
						color={authStatus ? 'success' : 'default'}
						variant="outlined"
					/>
					<Chip
						size="small"
						icon={
							backendConnected ? <CheckCircleOutlined /> : <CancelOutlined />
						}
						label={
							backendConnected ? 'Backend Connected' : 'Backend Disconnected'
						}
						color={backendConnected ? 'success' : 'default'}
						variant="outlined"
					/>
				</Toolbar>
			</AppBar>

			<Box
				sx={{
					maxWidth: 820,
					mx: 'auto',
					p: 3,
					display: 'flex',
					flexDirection: 'column',
					gap: 2,
				}}
			>
				{/* Google Auth */}
				<Card>
					<CardContent>
						<Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
							<AccountCircleOutlined color="primary" />
							<Typography
								variant="subtitle2"
								color="text.secondary"
								fontWeight={700}
								textTransform="uppercase"
								letterSpacing={0.5}
							>
								Google Authentication
							</Typography>
						</Stack>
						<Stack direction="row" alignItems="center" spacing={2}>
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ flex: 1 }}
							>
								{authStatus
									? 'Connected to Gmail and Google Calendar'
									: 'Connect to enable email and calendar monitoring'}
							</Typography>
							{authStatus ? (
								<Button
									variant="outlined"
									color="error"
									size="small"
									startIcon={<CancelOutlined />}
									onClick={handleDisconnect}
								>
									Disconnect
								</Button>
							) : (
								<Button
									variant="contained"
									size="small"
									startIcon={
										connecting ? (
											<CircularProgress size={14} color="inherit" />
										) : (
											<AccountCircleOutlined />
										)
									}
									onClick={handleConnect}
									disabled={connecting}
								>
									{connecting ? 'Opening browser...' : 'Connect Google'}
								</Button>
							)}
						</Stack>
						{!authStatus && (
							<Typography
								variant="caption"
								color="text.disabled"
								display="block"
								mt={1}
							>
								Requires Google Client ID &amp; Secret — configure in Settings
								below
							</Typography>
						)}
					</CardContent>
				</Card>

				{/* Actions */}
				<Card>
					<CardContent>
						<Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
							<SearchOutlined color="primary" />
							<Typography
								variant="subtitle2"
								color="text.secondary"
								fontWeight={700}
								textTransform="uppercase"
								letterSpacing={0.5}
							>
								Actions
							</Typography>
						</Stack>
						<Stack direction="row" spacing={1} flexWrap="wrap">
							<Button
								variant="outlined"
								size="small"
								startIcon={<LinkOutlined />}
								onClick={() => window.fshAgent.captureCurrentPage()}
							>
								Capture Current Page
							</Button>
							<Button
								variant="outlined"
								size="small"
								startIcon={<WorkOutlined />}
								onClick={() =>
									window.fshAgent.navigateBrowser('https://linkedin.com/jobs')
								}
							>
								LinkedIn Jobs
							</Button>
							<Button
								variant="outlined"
								size="small"
								startIcon={<SearchOutlined />}
								onClick={() =>
									window.fshAgent.navigateBrowser('https://indeed.com')
								}
							>
								Indeed
							</Button>
						</Stack>
					</CardContent>
				</Card>

				{/* Events */}
				<Card>
					<CardContent sx={{ pb: '12px !important' }}>
						<Stack direction="row" alignItems="center" spacing={1} mb={1}>
							<CableOutlined color="primary" />
							<Typography
								variant="subtitle2"
								color="text.secondary"
								fontWeight={700}
								textTransform="uppercase"
								letterSpacing={0.5}
							>
								Recent Events
							</Typography>
							{events.length > 0 && (
								<Chip
									label={events.length}
									size="small"
									sx={{ ml: 'auto !important', height: 20, fontSize: 11 }}
								/>
							)}
						</Stack>
						{events.length === 0 ? (
							<Typography variant="body2" color="text.disabled" py={1}>
								No events yet. Events will appear here as they are detected.
							</Typography>
						) : (
							<List disablePadding dense>
								{events.map((event, i) => {
									const meta = EVENT_META[event.type]
									return (
										<>
											<ListItem
												key={`${event.type}-${event.timestamp}`}
												disableGutters
												alignItems="flex-start"
												sx={{ py: 0.75 }}
											>
												<ListItemIcon
													sx={{
														minWidth: 36,
														mt: 0.25,
														color: meta?.color ?? '#6b7280',
													}}
												>
													{meta?.icon ?? <CableOutlined fontSize="small" />}
												</ListItemIcon>
												<ListItemText
													primary={
														<Stack
															direction="row"
															alignItems="center"
															spacing={1}
														>
															<Chip
																label={meta?.label ?? event.type}
																size="small"
																sx={{
																	height: 18,
																	fontSize: 10,
																	fontWeight: 700,
																	bgcolor: `${meta?.color ?? '#6b7280'}20`,
																	color: meta?.color ?? '#6b7280',
																	border: `1px solid ${meta?.color ?? '#6b7280'}40`,
																}}
															/>
															<Typography
																variant="caption"
																color="text.disabled"
															>
																{new Date(event.timestamp).toLocaleTimeString()}
															</Typography>
														</Stack>
													}
													secondary={
														<Typography
															variant="caption"
															color="text.secondary"
															sx={{ wordBreak: 'break-all' }}
														>
															{JSON.stringify(event.payload).substring(0, 120)}
														</Typography>
													}
												/>
											</ListItem>
											{i < events.length - 1 && (
												<Divider
													component="li"
													sx={{ borderColor: '#1e293b' }}
												/>
											)}
										</>
									)
								})}
							</List>
						)}
					</CardContent>
				</Card>

				{/* Settings */}
				<Card>
					<CardContent
						sx={{ pb: showSettings ? undefined : '12px !important' }}
					>
						<Stack direction="row" alignItems="center" spacing={1}>
							<SettingsOutlined color="primary" />
							<Typography
								variant="subtitle2"
								color="text.secondary"
								fontWeight={700}
								textTransform="uppercase"
								letterSpacing={0.5}
								sx={{ flex: 1 }}
							>
								Settings
							</Typography>
							<Tooltip title={showSettings ? 'Hide' : 'Show'}>
								<IconButton
									size="small"
									onClick={() => setShowSettings(!showSettings)}
								>
									<ChevronRight
										sx={{
											transform: showSettings ? 'rotate(90deg)' : 'none',
											transition: 'transform 0.2s',
										}}
									/>
								</IconButton>
							</Tooltip>
						</Stack>

						<Collapse in={showSettings}>
							<Stack spacing={2} mt={2}>
								<TextField
									label="Google Client ID"
									size="small"
									fullWidth
									placeholder="your-client-id.apps.googleusercontent.com"
									value={settings.googleClientId || ''}
									onChange={(e) =>
										setSettings({ ...settings, googleClientId: e.target.value })
									}
									InputProps={{
										startAdornment: (
											<InputAdornment position="start">
												<AccountCircleOutlined
													sx={{ fontSize: 16, color: 'text.disabled' }}
												/>
											</InputAdornment>
										),
									}}
								/>
								<TextField
									label="Google Client Secret"
									size="small"
									fullWidth
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
								<TextField
									label="FSH Backend URL"
									size="small"
									fullWidth
									value={settings.fshBackendUrl}
									onChange={(e) =>
										setSettings({ ...settings, fshBackendUrl: e.target.value })
									}
								/>
								<TextField
									label="Agent Secret"
									size="small"
									fullWidth
									type="password"
									placeholder="Shared secret for backend connection"
									value={settings.agentSecret || ''}
									onChange={(e) =>
										setSettings({ ...settings, agentSecret: e.target.value })
									}
								/>
								<TextField
									label="Files Watch Directory"
									size="small"
									fullWidth
									placeholder="/Users/you/Documents/fsh-job-agent-files"
									value={settings.filesWatchDir || ''}
									onChange={(e) =>
										setSettings({ ...settings, filesWatchDir: e.target.value })
									}
									InputProps={{
										startAdornment: (
											<InputAdornment position="start">
												<FolderOutlined
													sx={{ fontSize: 16, color: 'text.disabled' }}
												/>
											</InputAdornment>
										),
									}}
									helperText="Absolute path. Files here are sent to the FSH backend."
								/>
								<Stack direction="row" spacing={2}>
									<Box flex={1}>
										<Typography
											variant="caption"
											color="text.secondary"
											display="block"
											mb={0.5}
										>
											Gmail Poll Interval (min)
										</Typography>
										<Select
											size="small"
											fullWidth
											value={settings.gmailPollInterval}
											onChange={(e) =>
												setSettings({
													...settings,
													gmailPollInterval: Number(e.target.value),
												})
											}
										>
											{POLL_INTERVALS.map((n) => (
												<MenuItem key={n} value={n}>
													{n}
												</MenuItem>
											))}
										</Select>
									</Box>
									<Box flex={1}>
										<Typography
											variant="caption"
											color="text.secondary"
											display="block"
											mb={0.5}
										>
											Calendar Poll Interval (min)
										</Typography>
										<Select
											size="small"
											fullWidth
											value={settings.calendarPollInterval}
											onChange={(e) =>
												setSettings({
													...settings,
													calendarPollInterval: Number(e.target.value),
												})
											}
										>
											{POLL_INTERVALS.map((n) => (
												<MenuItem key={n} value={n}>
													{n}
												</MenuItem>
											))}
										</Select>
									</Box>
								</Stack>
								<Box>
									<Button
										variant="contained"
										size="small"
										startIcon={<SaveOutlined />}
										onClick={handleSaveSettings}
									>
										Save Settings
									</Button>
								</Box>
							</Stack>
						</Collapse>
					</CardContent>
				</Card>
			</Box>

			<Snackbar
				open={snackbar.open}
				autoHideDuration={3000}
				onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
			>
				<Alert
					severity={snackbar.severity}
					variant="filled"
					sx={{ width: '100%' }}
				>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</ThemeProvider>
	)
}
