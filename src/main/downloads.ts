import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path, { join } from 'node:path'
import chokidar from 'chokidar'

export interface PdfEvent {
	filename: string
	path: string
	base64: string
	size: number
}

let watcher: ReturnType<typeof chokidar.watch> | null = null

export function startDownloadsWatcher(onPdf: (pdf: PdfEvent) => void): void {
	const downloadsDir = join(homedir(), 'Downloads')

	watcher = chokidar.watch(downloadsDir, {
		ignored: /(^|[/\\])\../,
		persistent: true,
		ignoreInitial: true,
		awaitWriteFinish: {
			stabilityThreshold: 2000,
			pollInterval: 100,
		},
	})

	watcher.on('add', (filePath: string) => {
		if (!filePath.toLowerCase().endsWith('.pdf')) return
		if (!existsSync(filePath)) return

		try {
			const buffer = readFileSync(filePath)
			const base64 = buffer.toString('base64')
			const filename = path.basename(filePath)

			onPdf({
				filename,
				path: filePath,
				base64,
				size: buffer.length,
			})
		} catch (err) {
			console.error('PDF read error:', err)
		}
	})
}

export function stopDownloadsWatcher(): void {
	watcher?.close()
	watcher = null
}
