import type { BrowserWindow } from 'electron'

export interface CapturedJob {
	url: string
	title: string
	text: string
	capturedAt: string
}

const JOB_SITE_PATTERNS = [
	/linkedin\.com\/jobs\/view/,
	/indeed\.com\/viewjob/,
	/greenhouse\.io/,
	/lever\.co/,
	/myworkdayjobs\.com/,
	/boards\.greenhouse\.io/,
	/wellfound\.com\/jobs/,
]

function isJobPage(url: string): boolean {
	return JOB_SITE_PATTERNS.some((pattern) => pattern.test(url))
}

export function setupBrowserCapture(
	win: BrowserWindow,
	onCapture: (job: CapturedJob) => void,
): void {
	win.webContents.on('did-finish-load', async () => {
		const url = win.webContents.getURL()
		if (!isJobPage(url)) return

		try {
			const result = await win.webContents.executeJavaScript(`
        JSON.stringify({
          url: window.location.href,
          title: document.title,
          text: document.body.innerText.substring(0, 5000)
        })
      `)
			const job = JSON.parse(result)
			onCapture({ ...job, capturedAt: new Date().toISOString() })
		} catch (err) {
			console.error('Job capture error:', err)
		}
	})
}
