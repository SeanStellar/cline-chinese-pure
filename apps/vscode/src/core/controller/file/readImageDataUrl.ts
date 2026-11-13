import { String as StringMessage, StringRequest } from "@shared/proto/cline/common"
import * as fs from "fs/promises"
import * as path from "path"
import { URI } from "vscode-uri"
import { Controller } from ".."

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const MIME_BY_EXTENSION: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
}

/** Reads a local image file and returns it as a data URL for webview attachments. */
export async function readImageDataUrl(_controller: Controller, request: StringRequest): Promise<StringMessage> {
	const filePath = URI.parse(request.value, true).fsPath
	const mime = MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()]
	if (!mime) {
		throw new Error("Unsupported image type")
	}
	const stat = await fs.stat(filePath)
	if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) {
		throw new Error("Image is not a file or exceeds 5MB")
	}
	const buffer = await fs.readFile(filePath)
	return StringMessage.create({ value: `data:${mime};base64,${buffer.toString("base64")}` })
}
