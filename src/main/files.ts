import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import chokidar from 'chokidar'

export interface FileMetadata {
	filename: string
	path: string
	size: number
	mimeType: string
}

export interface FileEvent extends FileMetadata {
	base64: string
}

const MIME_TYPES: Record<string, string> = {
	pdf: 'application/pdf',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	txt: 'text/plain',
	md: 'text/markdown',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	csv: 'text/csv',
	json: 'application/json',
	zip: 'application/zip',
}

function getMimeType(filename: string): string {
	const ext = path.extname(filename).slice(1).toLowerCase()
	return MIME_TYPES[ext] ?? 'application/octet-stream'
}

export const DEFAULT_FILES_DIR = path.join(
	homedir(),
	'Documents',
	'fsh-job-agent-files',
)

let watcher: ReturnType<typeof chokidar.watch> | null = null

function readFileMetadata(filePath: string): FileMetadata | null {
	try {
		const size = statSync(filePath).size
		return {
			filename: path.basename(filePath),
			path: filePath,
			size,
			mimeType: getMimeType(filePath),
		}
	} catch {
		return null
	}
}

export function readFileEvent(filePath: string): FileEvent | null {
	try {
		const buffer = readFileSync(filePath)
		return {
			filename: path.basename(filePath),
			path: filePath,
			base64: buffer.toString('base64'),
			size: buffer.length,
			mimeType: getMimeType(filePath),
		}
	} catch {
		return null
	}
}

export function deleteFile(filePath: string): void {
	try {
		unlinkSync(filePath)
	} catch {
		// ignore if already gone
	}
}

export function startFilesWatcher(
	dir: string,
	onFile: (file: FileMetadata) => void,
	onRemove?: (filePath: string) => void,
): void {
	stopFilesWatcher()

	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}

	watcher = chokidar.watch(dir, {
		ignored: /(^|[/\\])\../,
		persistent: true,
		ignoreInitial: false,
		awaitWriteFinish: {
			stabilityThreshold: 2000,
			pollInterval: 100,
		},
	})

	watcher.on('add', (filePath: string) => {
		const meta = readFileMetadata(filePath)
		if (meta) onFile(meta)
	})

	watcher.on('change', (filePath: string) => {
		const meta = readFileMetadata(filePath)
		if (meta) onFile(meta)
	})

	watcher.on('unlink', (filePath: string) => {
		onRemove?.(filePath)
	})
}

export function stopFilesWatcher(): void {
	watcher?.close()
	watcher = null
}

export function saveFile(dir: string, filename: string, base64: string): void {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
	const filePath = path.join(dir, filename)
	writeFileSync(filePath, Buffer.from(base64, 'base64'))
}

export function listFiles(dir: string): FileMetadata[] {
	if (!existsSync(dir)) return []
	try {
		return readdirSync(dir)
			.filter((name) => !name.startsWith('.'))
			.filter((name) => statSync(path.join(dir, name)).isFile())
			.map((name) => readFileMetadata(path.join(dir, name)))
			.filter((e): e is FileMetadata => e !== null)
	} catch {
		return []
	}
}
