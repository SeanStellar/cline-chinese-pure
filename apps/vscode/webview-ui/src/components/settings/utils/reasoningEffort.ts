import type { OpenaiReasoningEffort } from "@shared/storage/types"
import type { ProviderConfigWritePatch } from "@/hooks/useProviderConfig"

/** Selector entry for "nothing saved": no level is requested and the provider or model default applies. */
export const DEFAULT_REASONING_EFFORT_OPTION = "default"

export type ReasoningEffortSelection = OpenaiReasoningEffort | typeof DEFAULT_REASONING_EFFORT_OPTION

export const REASONING_EFFORT_LABELS: Record<ReasoningEffortSelection, string> = {
	[DEFAULT_REASONING_EFFORT_OPTION]: "默认",
	none: "最小",
	low: "低",
	medium: "中",
	high: "高",
	xhigh: "极高",
	max: "最大",
}

/** The provider-config patch that saves a `ReasoningEffortSelector` choice. */
export function reasoningEffortPatch(effort: ReasoningEffortSelection): ProviderConfigWritePatch {
	if (effort === DEFAULT_REASONING_EFFORT_OPTION) {
		return { clearReasoning: true }
	}
	return effort === "none" ? { reasoning: { enabled: false, effort: "none" } } : { reasoning: { enabled: true, effort } }
}
