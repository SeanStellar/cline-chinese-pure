import { describe, expect, it } from "vitest"
import {
	inferModelParameters,
	modelBadges,
	parseProviderPresets,
	presetModelOverrides,
	serializeProviderPresets,
	type ProviderPreset,
	type ProviderPresetModel,
} from "./providerPresets"

const basePreset: ProviderPreset = {
	id: "p1",
	name: "百度千帆",
	baseUrl: "https://qianfan.example/v1",
	apiKey: "sk-test",
	apiFormat: "default",
	enabled: true,
	models: [],
	createdAt: 1,
	updatedAt: 1,
}

function model(overrides: Partial<ProviderPresetModel> = {}): ProviderPresetModel {
	return {
		id: "m1",
		enabled: true,
		inputTypes: { text: true, image: false, video: false, pdf: false },
		capabilities: [],
		reasoningLevels: ["low", "high", "max"],
		reasoningMapping: "",
		...overrides,
	}
}

describe("providerPresets", () => {
	it("migrates legacy string models and fills defaults", () => {
		const [preset] = parseProviderPresets(
			JSON.stringify([{ id: "p1", name: "Legacy", baseUrl: "https://x/v1", models: ["m1", "m1", " m2 "] }]),
		)
		expect(preset.apiFormat).toBe("default")
		expect(preset.enabled).toBe(true)
		expect(preset.apiKey).toBe("")
		expect(preset.models.map((item) => item.id)).toEqual(["m1", "m2"])
		expect(preset.models[0]).toEqual(expect.objectContaining({ id: "m1", enabled: true }))
		expect(preset.models[0].inputTypes).toEqual({ text: true, image: false, video: false, pdf: false })
	})

	it("round-trips the current model shape", () => {
		const preset: ProviderPreset = {
			...basePreset,
			models: [
				model({
					id: "deepseek-v4.1-flash-1017",
					contextWindow: 1_000_000,
					maxTokens: 384_000,
					supportsVision: true,
					inputTypes: { text: true, image: true, video: false, pdf: false },
					capabilities: ["structured_output"],
				}),
			],
		}
		const parsed = parseProviderPresets(serializeProviderPresets([preset]))
		expect(parsed[0]).toEqual(preset)
	})

	it("infers known model families", () => {
		expect(inferModelParameters("deepseek-v4.1-flash-1017")).toEqual({
			contextWindow: 1_000_000,
			maxTokens: 384_000,
			supportsVision: true,
			capabilities: ["images", "structured_output", "reasoning"],
			source: "local-family",
		})
		expect(inferModelParameters("claude-sonnet-4-6")).toEqual(
			expect.objectContaining({
				contextWindow: 200_000,
				maxTokens: 64_000,
				supportsVision: true,
			}),
		)
		expect(inferModelParameters("totally-unknown-model")).toBeUndefined()
	})

	it("derives context and vision badges", () => {
		expect(modelBadges(model({ contextWindow: 1_000_000, supportsVision: true }))).toEqual(["1M", "视觉"])
		expect(modelBadges(model({ contextWindow: 128_000 }))).toEqual(["128K"])
	})

	it("maps preset model settings to runtime overrides", () => {
		const preset: ProviderPreset = { ...basePreset, apiFormat: "openai-responses" }
		const configured = model({
			contextWindow: 200_000,
			maxTokens: 64_000,
			supportsVision: true,
			inputTypes: { text: true, image: true, video: true, pdf: true },
			capabilities: ["structured_output"],
			reasoningLevels: ["low", "high"],
		})
		expect(presetModelOverrides(preset, configured)).toEqual({
			contextWindow: 200_000,
			maxTokens: 64_000,
			supportsVision: true,
			capabilities: ["images", "video", "files", "structured_output"],
			apiFormat: "openai-responses",
		})
	})
})