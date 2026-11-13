import { isOpenaiReasoningEffort, Mode, OPENAI_REASONING_EFFORT_OPTIONS, OpenaiReasoningEffort } from "@shared/storage/types"
import { memo } from "react"
import { Label } from "@/components/ui/label"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { getModeSpecificFields } from "./utils/providerUtils"
import {
	DEFAULT_REASONING_EFFORT_OPTION,
	REASONING_EFFORT_LABELS,
	type ReasoningEffortSelection,
} from "./utils/reasoningEffort"
import { useApiConfigurationHandlers } from "./utils/useApiConfigurationHandlers"

interface ReasoningEffortSelectorProps {
	currentMode: Mode
	label?: string
	description?: string
	allowedEfforts?: readonly OpenaiReasoningEffort[]
	/** Shown when nothing is saved. Ignored when `value` is passed. */
	defaultEffort?: OpenaiReasoningEffort
	/**
	 * The provider's saved effort, for providers that persist reasoning in their
	 * own settings. When passed, it is what the selector shows, and a "Default"
	 * entry stands for nothing saved, so every listed level is a real change.
	 * `null` means the saved effort is still loading: the selector shows no
	 * level and is disabled, since a pick could match a stale display.
	 */
	value?: ReasoningEffortSelection | null
	/** Optional callback invoked after the effort value changes. Use to persist to provider-specific stores. */
	onEffortChange?: (effort: ReasoningEffortSelection) => void
}

const ReasoningEffortSelector = ({
	currentMode,
	label = "思考强度",
	description = "点击即可应用。更高的努力程度会提升思考深度，但会消耗更多 tokens。",
	allowedEfforts = OPENAI_REASONING_EFFORT_OPTIONS,
	defaultEffort = "medium",
	value,
	onEffortChange,
}: ReasoningEffortSelectorProps) => {
	const { apiConfiguration } = useExtensionState()
	const { handleModeFieldChange } = useApiConfigurationHandlers()
	const modeFields = getModeSpecificFields(apiConfiguration, currentMode)
	const isLoading = value === null
	const savedEffort: OpenaiReasoningEffort | undefined =
		value === undefined
			? isOpenaiReasoningEffort(modeFields.reasoningEffort)
				? modeFields.reasoningEffort
				: undefined
			: isOpenaiReasoningEffort(value)
				? value
				: undefined

	// Keep a saved level the current list doesn't offer; it is what will be sent.
	const options: OpenaiReasoningEffort[] = allowedEfforts.filter((effort) => isOpenaiReasoningEffort(effort))
	if (savedEffort && !options.includes(savedEffort)) {
		options.push(savedEffort)
	}

	const showDefaultOption = value !== undefined
	const displayLabel = isLoading
		? ""
		: showDefaultOption && savedEffort === undefined
			? REASONING_EFFORT_LABELS[DEFAULT_REASONING_EFFORT_OPTION]
			: REASONING_EFFORT_LABELS[savedEffort ?? defaultEffort]

	const handleChange = (effort: OpenaiReasoningEffort) => {
		if (isLoading || savedEffort === effort) {
			return
		}
		handleModeFieldChange({ plan: "planModeReasoningEffort", act: "actModeReasoningEffort" }, effort, currentMode)
		onEffortChange?.(effort)
	}

	return (
		<div style={{ marginTop: 10, marginBottom: 5 }}>
			<div className="flex items-center justify-between gap-2">
				<Label className="text-xs font-medium">{label}</Label>
				<div className="flex items-center gap-2">
					<span className="text-xs text-(--vscode-charts-blue)" data-testid="reasoning-effort-value">
						{displayLabel}
					</span>
					{showDefaultOption && savedEffort !== undefined ? (
						<button
							className="text-[10px] text-(--vscode-textLink-foreground) hover:underline"
							onClick={() => onEffortChange?.(DEFAULT_REASONING_EFFORT_OPTION)}
							type="button">
							恢复默认
						</button>
					) : null}
				</div>
			</div>
			<div aria-label={label} className="mt-1.5 flex flex-wrap gap-1.5" role="group">
				{options.map((effort) => {
					const active = savedEffort === effort
					return (
						<button
							className={`min-w-[68px] flex-1 rounded-md border px-3 py-2 text-xs transition-colors ${
								active
									? "border-(--vscode-button-background) bg-(--vscode-button-background) font-medium text-(--vscode-button-foreground)"
									: "border-(--vscode-widget-border) text-description hover:border-(--vscode-focusBorder) hover:text-foreground"
							} ${isLoading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
							disabled={isLoading}
							key={effort}
							onClick={() => handleChange(effort)}
							type="button">
							{REASONING_EFFORT_LABELS[effort]}
						</button>
					)
				})}
			</div>
			<p
				style={{
					fontSize: "12px",
					marginTop: 3,
					marginBottom: 0,
					color: "var(--vscode-descriptionForeground)",
				}}>
				{description}
			</p>
		</div>
	)
}

export default memo(ReasoningEffortSelector)
