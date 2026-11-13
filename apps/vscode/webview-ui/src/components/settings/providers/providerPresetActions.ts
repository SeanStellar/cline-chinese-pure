import {
	CommitModelSelectionRequest,
	WriteProviderConfigPatch,
	WriteProviderConfigRequest,
} from "@shared/proto/cline/models"
import { toProtobufModelOverrides } from "@shared/proto-conversions/models/modelOverrides"
import type { Mode } from "@shared/storage/types"
import { ModelsServiceClient } from "@/services/grpc-client"
import { presetModelOverrides, type ProviderPreset } from "./providerPresets"

export const ACTIVE_PROVIDER_PRESET_KEY = "cline-chinese.active-provider-preset.v1"
export const PROVIDER_PRESET_SELECTED_EVENT = "cline-provider-preset-selected"

/**
 * Apply a saved provider preset to the built-in OpenAI Compatible provider:
 * writes its base URL / key, commits the chosen model (with the preset's
 * context window / max tokens / capabilities), and remembers the preset.
 */
export async function applyProviderPreset(preset: ProviderPreset, mode: Mode, modelId?: string): Promise<void> {
	await ModelsServiceClient.writeProviderConfig(
		WriteProviderConfigRequest.create({
			providerId: "openai",
			patch: WriteProviderConfigPatch.create({
				baseUrl: preset.baseUrl,
				...(preset.apiKey ? { apiKey: preset.apiKey } : {}),
			}),
		}),
	)

	const requested = modelId ? preset.models.find((model) => model.id === modelId) : undefined
	const target = requested ?? preset.models.find((model) => model.enabled) ?? preset.models[0]
	if (target) {
		await ModelsServiceClient.commitModelSelection(
			CommitModelSelectionRequest.create({
				providerId: "openai",
				mode,
				modelId: target.id,
				overrides: toProtobufModelOverrides(presetModelOverrides(preset, target)),
			}),
		)
	}

	try {
		localStorage.setItem(ACTIVE_PROVIDER_PRESET_KEY, preset.id)
	} catch {
		// ignore storage errors
	}
	window.dispatchEvent(new CustomEvent(PROVIDER_PRESET_SELECTED_EVENT, { detail: preset.id }))
}