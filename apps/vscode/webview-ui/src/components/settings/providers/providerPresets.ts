export type ProviderPresetApiFormat = "default" | "openai-responses"

export interface ProviderPresetInputTypes {
	text: boolean
	image: boolean
	video: boolean
	pdf: boolean
}

export interface ProviderPresetModel {
	id: string
	enabled: boolean
	contextWindow?: number
	maxTokens?: number
	supportsVision?: boolean
	inputPrice?: number
	outputPrice?: number
	temperature?: number
	inputTypes: ProviderPresetInputTypes
	capabilities: string[]
	reasoningLevels: string[]
	reasoningMapping: string
}

export interface ProviderPreset {
	id: string
	name: string
	baseUrl: string
	apiKey: string
	apiFormat: ProviderPresetApiFormat
	enabled: boolean
	models: ProviderPresetModel[]
	createdAt: number
	updatedAt: number
}

import type { ProviderModelOverrides } from "@/hooks/useProviderConfig"

export function presetModelOverrides(preset: ProviderPreset, model: ProviderPresetModel): ProviderModelOverrides {
	const capabilities: string[] = []
	if (model.inputTypes.image || model.supportsVision) {
		capabilities.push("images")
	}
	if (model.inputTypes.video) {
		capabilities.push("video")
	}
	if (model.inputTypes.pdf) {
		capabilities.push("files")
	}
	if (model.capabilities.includes("structured_output")) {
		capabilities.push("structured_output")
	}
	return {
		...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
		...(model.maxTokens ? { maxTokens: model.maxTokens } : {}),
		...(model.inputPrice !== undefined ? { inputPrice: model.inputPrice } : {}),
		...(model.outputPrice !== undefined ? { outputPrice: model.outputPrice } : {}),
		...(model.temperature !== undefined ? { temperature: model.temperature } : {}),
		...(model.supportsVision !== undefined ? { supportsVision: model.supportsVision } : {}),
		...(capabilities.length > 0 ? { capabilities } : {}),
		apiFormat: preset.apiFormat,
	}
}

export interface DetectedModelParameters {
	contextWindow?: number
	maxTokens?: number
	supportsVision?: boolean
	capabilities?: string[]
	source?: string
}

interface ModelFamilyDefaults {
	pattern: RegExp
	contextWindow?: number
	maxTokens?: number
	supportsVision?: boolean
	capabilities?: string[]
}

const MODEL_FAMILY_DEFAULTS: ModelFamilyDefaults[] = [
	{
		pattern: /deepseek[-_.]?v4/i,
		contextWindow: 1_000_000,
		maxTokens: 384_000,
		supportsVision: true,
		capabilities: ["images", "structured_output", "reasoning"],
	},
	{ pattern: /deepseek[-_.]?v3/i, contextWindow: 128_000, maxTokens: 8_192 },
	{
		pattern: /qwen.*(vl|vision)/i,
		contextWindow: 128_000,
		maxTokens: 16_384,
		supportsVision: true,
		capabilities: ["images"],
	},
	{ pattern: /qwen/i, contextWindow: 128_000, maxTokens: 16_384 },
	{ pattern: /glm[-_.]?4/i, contextWindow: 200_000, maxTokens: 16_384 },
	{
		pattern: /claude/i,
		contextWindow: 200_000,
		maxTokens: 64_000,
		supportsVision: true,
		capabilities: ["images", "structured_output", "reasoning"],
	},
	{
		pattern: /gpt[-_.]?5/i,
		contextWindow: 400_000,
		maxTokens: 128_000,
		supportsVision: true,
		capabilities: ["images", "structured_output"],
	},
	{
		pattern: /gpt[-_.]?4o/i,
		contextWindow: 128_000,
		maxTokens: 16_384,
		supportsVision: true,
		capabilities: ["images"],
	},
	{
		pattern: /gemini/i,
		contextWindow: 1_000_000,
		maxTokens: 65_536,
		supportsVision: true,
		capabilities: ["images", "video", "files", "structured_output"],
	},
	{ pattern: /kimi|moonshot/i, contextWindow: 256_000, maxTokens: 16_384 },
	{ pattern: /minimax/i, contextWindow: 200_000, maxTokens: 16_384 },
	{ pattern: /ernie/i, contextWindow: 128_000, maxTokens: 16_384 },
	{ pattern: /intern/i, contextWindow: 128_000, maxTokens: 16_384 },
	{ pattern: /agnes/i, contextWindow: 128_000, maxTokens: 16_384 },
]

export function inferModelParameters(modelId: string): DetectedModelParameters | undefined {
	const id = modelId.trim()
	if (!id) {
		return undefined
	}
	const family = MODEL_FAMILY_DEFAULTS.find((entry) => entry.pattern.test(id))
	const supportsVision = family?.supportsVision || /(vision|vl-|-vl|multimodal)/i.test(id)
	if (!family && !supportsVision) {
		return undefined
	}
	return {
		contextWindow: family?.contextWindow,
		maxTokens: family?.maxTokens,
		supportsVision,
		capabilities: family?.capabilities,
		source: "local-family",
	}
}

const MAX_PRESETS = 50
const MAX_MODELS = 100

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function optionalPositiveNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
}

function normalizeStringList(value: unknown, max: number): string[] {
	if (!Array.isArray(value)) {
		return []
	}
	const seen = new Set<string>()
	const result: string[] = []
	for (const item of value) {
		if (typeof item !== "string") {
			continue
		}
		const trimmed = item.trim()
		if (!trimmed || seen.has(trimmed)) {
			continue
		}
		seen.add(trimmed)
		result.push(trimmed)
		if (result.length >= max) {
			break
		}
	}
	return result
}

function normalizeInputTypes(value: unknown, supportsVision: boolean | undefined): ProviderPresetInputTypes {
	const record = isRecord(value) ? value : {}
	return {
		text: true,
		image: record.image === undefined ? Boolean(supportsVision) : record.image === true,
		video: record.video === true,
		pdf: record.pdf === true,
	}
}

function normalizeModel(value: unknown): ProviderPresetModel | undefined {
	if (typeof value === "string") {
		const id = value.trim()
		if (!id) {
			return undefined
		}
		return {
			id,
			enabled: true,
			inputTypes: { text: true, image: false, video: false, pdf: false },
			capabilities: [],
			reasoningLevels: [],
			reasoningMapping: "",
		}
	}
	if (!isRecord(value)) {
		return undefined
	}
	const id = typeof value.id === "string" ? value.id.trim() : ""
	if (!id) {
		return undefined
	}
	const supportsVision = value.supportsVision === true
	return {
		id,
		enabled: value.enabled !== false,
		contextWindow: optionalPositiveNumber(value.contextWindow),
		maxTokens: optionalPositiveNumber(value.maxTokens),
		inputPrice: optionalNonNegativeNumber(value.inputPrice),
		outputPrice: optionalNonNegativeNumber(value.outputPrice),
		temperature: optionalNonNegativeNumber(value.temperature),
		supportsVision,
		inputTypes: normalizeInputTypes(value.inputTypes, supportsVision),
		capabilities: normalizeStringList(value.capabilities, 20),
		reasoningLevels: normalizeStringList(value.reasoningLevels, 20),
		reasoningMapping: typeof value.reasoningMapping === "string" ? value.reasoningMapping : "",
	}
}

export function parseProviderPresets(json: string | undefined): ProviderPreset[] {
	if (!json) {
		return []
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(json)
	} catch {
		return []
	}
	if (!Array.isArray(parsed)) {
		return []
	}
	const presets: ProviderPreset[] = []
	const seenIds = new Set<string>()
	for (const item of parsed) {
		if (!isRecord(item)) {
			continue
		}
		const id = typeof item.id === "string" ? item.id.trim() : ""
		const name = typeof item.name === "string" ? item.name.trim() : ""
		const baseUrl = typeof item.baseUrl === "string" ? item.baseUrl.trim() : ""
		if (!id || !name || !baseUrl || seenIds.has(id)) {
			continue
		}
		seenIds.add(id)
		const now = Date.now()
		const models: ProviderPresetModel[] = []
		const seenModels = new Set<string>()
		if (Array.isArray(item.models)) {
			for (const rawModel of item.models) {
				const model = normalizeModel(rawModel)
				if (!model || seenModels.has(model.id)) {
					continue
				}
				seenModels.add(model.id)
				models.push(model)
				if (models.length >= MAX_MODELS) {
					break
				}
			}
		}
		presets.push({
			id,
			name,
			baseUrl,
			apiKey: typeof item.apiKey === "string" ? item.apiKey : "",
			apiFormat: item.apiFormat === "openai-responses" ? "openai-responses" : "default",
			enabled: item.enabled !== false,
			models,
			createdAt: typeof item.createdAt === "number" ? item.createdAt : now,
			updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : now,
		})
		if (presets.length >= MAX_PRESETS) {
			break
		}
	}
	return presets
}

export function serializeProviderPresets(presets: ProviderPreset[]): string {
	return JSON.stringify(presets)
}

export function createProviderPresetId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID()
	}
	return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createPresetModel(id: string, currentModelInfo?: { contextWindow?: number; maxTokens?: number; supportsVision?: boolean }): ProviderPresetModel {
	return {
		id,
		enabled: true,
		contextWindow: currentModelInfo?.contextWindow,
		maxTokens: currentModelInfo?.maxTokens,
		supportsVision: currentModelInfo?.supportsVision,
		inputTypes: {
			text: true,
			image: Boolean(currentModelInfo?.supportsVision),
			video: false,
			pdf: false,
		},
		capabilities: [],
		reasoningLevels: ["low", "high", "max"],
		reasoningMapping: "",
	}
}

export function modelBadges(model: ProviderPresetModel): string[] {
	const badges: string[] = []
	if (model.contextWindow) {
		if (model.contextWindow >= 1_000_000) {
			badges.push(`${Math.round(model.contextWindow / 100_000) / 10}M`)
		} else if (model.contextWindow >= 1000) {
			badges.push(`${Math.round(model.contextWindow / 1000)}K`)
		}
	}
	if (model.supportsVision || model.inputTypes.image) {
		badges.push("视觉")
	}
	return badges
}
