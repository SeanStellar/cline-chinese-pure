import {
	OPENAI_REASONING_EFFORT_OPTIONS,
	type OpenaiReasoningEffort,
	type Mode,
} from "@shared/storage/types"
import { CheckIcon, SettingsIcon } from "lucide-react"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useApiConfigurationHandlers } from "@/components/settings/utils/useApiConfigurationHandlers"
import { REASONING_EFFORT_LABELS } from "@/components/settings/utils/reasoningEffort"
import {
	ACTIVE_PROVIDER_PRESET_KEY,
	applyProviderPreset,
} from "@/components/settings/providers/providerPresetActions"
import { modelBadges, parseProviderPresets, type ProviderPreset } from "@/components/settings/providers/providerPresets"

interface ModelProfileMenuProps {
	currentMode: Mode
	displayName: string
	modelId?: string
	reasoningEffort?: string
	supportsReasoning?: boolean
	anchorRef: React.RefObject<HTMLDivElement>
	onClose: () => void
}

const EFFORT_SPARKLES = [
	{ top: 22, size: 3 },
	{ top: 64, size: 2 },
	{ top: 32, size: 2.5 },
	{ top: 70, size: 3 },
	{ top: 20, size: 2 },
	{ top: 58, size: 1.5 },
	{ top: 30, size: 3 },
	{ top: 68, size: 2 },
	{ top: 36, size: 1.5 },
	{ top: 60, size: 2.5 },
	{ top: 15, size: 2 },
	{ top: 44, size: 1.5 },
	{ top: 52, size: 2 },
	{ top: 74, size: 1.5 },
	{ top: 26, size: 1.5 },
	{ top: 62, size: 2 },
]

const EFFORT_BURST_PARTICLES = [
	{ tx: 34, ty: 0, size: 4, color: "#e9d5ff", delay: 0 },
	{ tx: 30, ty: 18, size: 3, color: "#ffffff", delay: 15 },
	{ tx: 20, ty: 30, size: 4, color: "#c4b5fd", delay: 30 },
	{ tx: 0, ty: 34, size: 4.5, color: "#ffffff", delay: 10 },
	{ tx: -20, ty: 30, size: 3, color: "#93c5fd", delay: 25 },
	{ tx: -30, ty: 18, size: 4, color: "#c4b5fd", delay: 5 },
	{ tx: -34, ty: 0, size: 3, color: "#ffffff", delay: 20 },
	{ tx: -30, ty: -18, size: 4, color: "#dbeafe", delay: 35 },
	{ tx: -20, ty: -30, size: 3, color: "#a78bfa", delay: 15 },
	{ tx: 0, ty: -34, size: 4, color: "#ffffff", delay: 0 },
	{ tx: 20, ty: -30, size: 3, color: "#c4b5fd", delay: 10 },
	{ tx: 30, ty: -18, size: 4, color: "#e9d5ff", delay: 30 },
	{ tx: 14, ty: 14, size: 2.5, color: "#ffffff", delay: 5 },
	{ tx: -14, ty: 14, size: 2.5, color: "#ffffff", delay: 20 },
	{ tx: 14, ty: -14, size: 2.5, color: "#c4b5fd", delay: 25 },
	{ tx: -14, ty: -14, size: 2.5, color: "#ffffff", delay: 35 },
]

const MAX_EFFORT_TEXT_GRADIENT: React.CSSProperties = {
	backgroundImage: "linear-gradient(90deg, #2f5bff 0%, #8a5cf8 55%, #a866f8 100%)",
	WebkitBackgroundClip: "text",
	backgroundClip: "text",
	color: "transparent",
}

const ModelProfileMenu: React.FC<ModelProfileMenuProps> = ({
	currentMode,
	displayName,
	modelId,
	reasoningEffort,
	supportsReasoning = false,
	anchorRef,
	onClose,
}) => {
	const { apiConfiguration, navigateToSettingsModelPicker, providerPresets } = useExtensionState()
	const { handleModeFieldChange, handleModeFieldsChange } = useApiConfigurationHandlers()
	const panelRef = useRef<HTMLDivElement>(null)
	const [error, setError] = useState("")
	const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
	const [applying, setApplying] = useState(false)

	const presets = useMemo(() => parseProviderPresets(providerPresets), [providerPresets])
	const currentProvider =
		currentMode === "plan" ? apiConfiguration?.planModeApiProvider : apiConfiguration?.actModeApiProvider
	let storedActivePresetId: string | null = null
	try {
		storedActivePresetId = localStorage.getItem(ACTIVE_PROVIDER_PRESET_KEY)
	} catch {
		// ignore storage errors
	}
	const activePresetId =
		currentProvider === "openai" ? (presets.find((preset) => preset.id === storedActivePresetId)?.id ?? null) : null
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
		() => activePresetId ?? presets[0]?.id ?? null,
	)
	useEffect(() => {
		if (activePresetId) {
			setSelectedPresetId(activePresetId)
		}
	}, [activePresetId])
	const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0]
	const enabledModels = selectedPreset?.models.filter((model) => model.enabled) ?? []
	const activePresetModel = activePresetId
		? presets.find((preset) => preset.id === activePresetId)?.models.find((model) => model.id === modelId)
		: undefined

	const [selectedEffort, setSelectedEffort] = useState<OpenaiReasoningEffort | undefined>(
		(reasoningEffort as OpenaiReasoningEffort) || undefined,
	)

	useEffect(() => {
		setSelectedEffort((reasoningEffort as OpenaiReasoningEffort) || undefined)
	}, [reasoningEffort])

	const configuredLevels = activePresetModel?.reasoningLevels ?? []
	const effortOptions =
		configuredLevels.length > 0
			? OPENAI_REASONING_EFFORT_OPTIONS.filter(
					(effort) => configuredLevels.includes(effort) || effort === selectedEffort,
				)
			: OPENAI_REASONING_EFFORT_OPTIONS
	const effortKey = effortOptions.join(",")
	const [sliderIndex, setSliderIndex] = useState(0)

	useEffect(() => {
		const selectedIndex = selectedEffort ? effortOptions.indexOf(selectedEffort) : -1
		if (selectedIndex >= 0) {
			setSliderIndex(selectedIndex)
			return
		}
		const mediumIndex = effortOptions.indexOf("medium")
		setSliderIndex(mediumIndex >= 0 ? mediumIndex : Math.max(0, effortOptions.length - 1))
	}, [selectedEffort, effortKey])

	const effortPercent = effortOptions.length > 1 ? (sliderIndex / (effortOptions.length - 1)) * 100 : 0
	const isMaxEffort = effortOptions.length > 1 && sliderIndex === effortOptions.length - 1
	// 滑块圆点两端各缩进半径（圆点直径与轨道同高，半径 13px），填充边界按圆点中心对齐。
	const effortFillRightInset = `calc(${100 - effortPercent}% + ${13 * (effortPercent / 50 - 1)}px)`
	const effortIntensity = effortOptions.length > 1 ? sliderIndex / (effortOptions.length - 1) : 1
	const sparkleCycleSeconds = 9 - 6.5 * effortIntensity
	const effortThumbLeft = `calc(${effortPercent}% + ${13 * (1 - effortPercent / 50)}px)`
	const [burstKey, setBurstKey] = useState(0)
	const wasMaxEffort = useRef(isMaxEffort)

	useEffect(() => {
		if (isMaxEffort && !wasMaxEffort.current) {
			setBurstKey((key) => key + 1)
		}
		wasMaxEffort.current = isMaxEffort
	}, [isMaxEffort])

	useEffect(() => {
		if (!burstKey) {
			return
		}
		const timeout = window.setTimeout(() => setBurstKey(0), 900)
		return () => window.clearTimeout(timeout)
	}, [burstKey])

	// Keep the floating panel anchored to the trigger while the layout moves.
	useEffect(() => {
		const updateAnchor = () => {
			if (anchorRef.current) {
				setAnchorRect(anchorRef.current.getBoundingClientRect())
			}
		}
		updateAnchor()
		window.addEventListener("resize", updateAnchor)
		window.addEventListener("scroll", updateAnchor, true)
		return () => {
			window.removeEventListener("resize", updateAnchor)
			window.removeEventListener("scroll", updateAnchor, true)
		}
	}, [anchorRef])

	useEffect(() => {
		const handleOutsideMouseDown = (event: MouseEvent) => {
			if (anchorRef.current?.contains(event.target as Node)) {
				return
			}
			if (panelRef.current?.contains(event.target as Node)) {
				return
			}
			onClose()
		}
		document.addEventListener("mousedown", handleOutsideMouseDown)
		return () => document.removeEventListener("mousedown", handleOutsideMouseDown)
	}, [anchorRef, onClose])

	const commitSlider = (index: number) => {
		const effort = effortOptions[index]
		if (effort) {
			void handleEffortChange(effort)
		}
	}

	const handleEffortChange = async (effort: OpenaiReasoningEffort) => {
		setError("")
		setSelectedEffort(effort)
		try {
			await handleModeFieldsChange(
				{ reasoningEffort: { plan: "planModeReasoningEffort", act: "actModeReasoningEffort" } },
				{ reasoningEffort: effort },
				currentMode,
			)
		} catch (e) {
			setError(`设置思考强度失败：${e instanceof Error ? e.message : String(e)}`)
		}
	}

	const openSettings = () => {
		navigateToSettingsModelPicker({ targetSection: "api-config" })
		onClose()
	}

	const handleSelectModel = async (preset: ProviderPreset, targetModelId: string) => {
		setError("")
		setApplying(true)
		try {
			handleModeFieldChange({ plan: "planModeApiProvider", act: "actModeApiProvider" }, "openai", currentMode)
			await applyProviderPreset(preset, currentMode, targetModelId)
			onClose()
		} catch (e) {
			setError(`切换模型失败：${e instanceof Error ? e.message : String(e)}`)
		} finally {
			setApplying(false)
		}
	}

	if (!anchorRect) {
		return null
	}

	const width = Math.min(340, window.innerWidth - 16)
	const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - width - 8))

	return createPortal(
		<div
			className="z-[1000] flex flex-col overflow-hidden"
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					onClose()
				}
			}}
			ref={panelRef}
			style={{
				position: "fixed",
				left,
				bottom: Math.max(8, window.innerHeight - anchorRect.top + 6),
				width,
				maxHeight: "70vh",
				background: "var(--vscode-editorWidget-background)",
				border: "1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35))",
				borderRadius: 6,
				boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
			}}>
			<div className="border-b border-(--vscode-widget-border) px-3 py-2">
				<div className="truncate text-xs font-medium text-foreground">{displayName || "模型"}</div>
				<div className="mt-0.5 text-[10px] text-description">选择供应商，再选择模型</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
				<div className="border-b border-(--vscode-widget-border) px-3 py-2">
					<div className="mb-1.5 flex items-center justify-between">
						<span className="text-[10px] font-medium text-foreground">供应商</span>
						<button
							className="text-[10px] text-(--vscode-textLink-foreground) hover:underline"
							onClick={openSettings}
							type="button">
							管理
						</button>
					</div>
					{presets.length === 0 ? (
						<div className="text-[10px] text-description">还没有保存的供应商，先去设置里新建。</div>
					) : (
						<div className="max-h-[150px] space-y-1 overflow-y-auto pr-0.5">
							{presets.map((preset) => {
								const isCurrent = activePresetId === preset.id
								const isSelected = selectedPreset?.id === preset.id
								return (
									<button
										className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
											isSelected
												? "border-(--vscode-focusBorder) bg-(--vscode-list-activeSelectionBackground)"
												: "border-(--vscode-widget-border) hover:bg-(--vscode-list-hoverBackground)"
										}`}
										key={preset.id}
										onClick={() => setSelectedPresetId(preset.id)}
										type="button">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1">
												<span className="truncate text-xs text-foreground">{preset.name}</span>
												{isCurrent ? (
													<CheckIcon className="shrink-0 text-(--vscode-charts-green)" size={10} />
												) : null}
											</div>
											<div className="truncate text-[9px] text-description">{preset.baseUrl}</div>
										</div>
										<span className="shrink-0 text-[9px] text-description">
											{preset.models.length} 个模型
										</span>
									</button>
								)
							})}
						</div>
					)}
				</div>

				<div className="border-b border-(--vscode-widget-border) px-3 py-2">
					<div className="mb-1.5 flex items-center justify-between gap-2">
						<span className="text-[10px] font-medium text-foreground">模型</span>
						<span className="truncate text-[9px] text-description">{selectedPreset?.name ?? ""}</span>
					</div>
					{!selectedPreset ? null : enabledModels.length === 0 ? (
						<div className="text-[10px] text-description">该供应商还没有模型，去设置里添加。</div>
					) : (
						<div className="max-h-[190px] space-y-1 overflow-y-auto pr-0.5">
							{enabledModels.map((model) => {
								const isCurrent = activePresetId === selectedPreset.id && model.id === modelId
								return (
									<button
										className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition-colors ${
											isCurrent
												? "border-(--vscode-focusBorder) bg-(--vscode-list-activeSelectionBackground)"
												: "border-(--vscode-widget-border) hover:bg-(--vscode-list-hoverBackground)"
										} ${applying ? "cursor-wait opacity-70" : ""}`}
										disabled={applying}
										key={model.id}
										onClick={() => void handleSelectModel(selectedPreset, model.id)}
										type="button">
										<span className="min-w-0 flex-1 truncate text-xs text-foreground">{model.id}</span>
										{modelBadges(model).map((badge) => (
											<span
												className="shrink-0 rounded border border-(--vscode-widget-border) px-1 py-px text-[9px] text-description"
												key={badge}>
												{badge}
											</span>
										))}
										{isCurrent ? (
											<CheckIcon className="shrink-0 text-(--vscode-charts-green)" size={10} />
										) : null}
									</button>
								)
							})}
						</div>
					)}
				</div>

				{supportsReasoning && (
				<div className="border-b border-(--vscode-widget-border) px-3 py-2">
					<div className="mb-2 flex items-center justify-between">
						<span className="text-[10px] text-description">思考强度</span>
						<span
							className="text-[10px] font-medium text-(--vscode-charts-blue)"
							style={
								selectedEffort && REASONING_EFFORT_LABELS[selectedEffort] === "最大"
									? MAX_EFFORT_TEXT_GRADIENT
									: undefined
							}>
							{selectedEffort ? REASONING_EFFORT_LABELS[selectedEffort] : "默认"}
						</span>
					</div>
					{effortOptions.length === 1 ? (
						<div className="rounded-md bg-(--vscode-button-background) py-1.5 text-center text-xs font-medium text-(--vscode-button-foreground)">
							{REASONING_EFFORT_LABELS[effortOptions[0]]}
						</div>
					) : (
						<>
							<style>
								{`
								.cline-effort-base {
									background-image: linear-gradient(90deg, rgba(165, 180, 252, 0.24) 0%, rgba(196, 181, 253, 0.22) 55%, rgba(221, 214, 254, 0.18) 100%);
									box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.28);
								}
								.cline-effort-fill {
									--sparkle-peak: 0.35;
									background-image: linear-gradient(90deg, #8b9cf9 0%, #ab8bf7 55%, #c9b2fb 100%);
									transition: background-image 0.25s ease;
								}
								.cline-effort-fill.is-max {
									--sparkle-peak: 1;
									background-image: linear-gradient(90deg, #2f5bff 0%, #6d4aff 42%, #a866f8 100%);
									box-shadow: 0 0 14px rgba(124, 77, 255, 0.5), inset 0 1px 3px rgba(15, 23, 42, 0.35);
								}
								.cline-effort-sheen {
									display: none;
								}
								.cline-effort-fill.is-max .cline-effort-sheen {
									display: block;
									position: absolute;
									inset: 0;
									background: linear-gradient(105deg, transparent 38%, rgba(255, 255, 255, 0.36) 50%, transparent 62%);
									transform: translateX(-120%);
									animation: cline-effort-sheen 5.5s ease-in-out infinite;
								}
								.cline-effort-sparkle {
									left: 0;
									opacity: 0;
									box-shadow: 0 0 5px rgba(255, 255, 255, 0.95);
									animation-name: cline-effort-drift;
									animation-timing-function: linear;
									animation-iteration-count: infinite;
									animation-duration: 6s;
								}
								.cline-effort-slider {
									-webkit-appearance: none;
									appearance: none;
									position: absolute;
									inset: 0;
									width: 100%;
									height: 100%;
									margin: 0;
									background: transparent;
									outline: none;
									cursor: pointer;
									z-index: 2;
								}
								.cline-effort-slider::-webkit-slider-runnable-track {
									background: transparent;
									height: 100%;
								}
								.cline-effort-slider::-webkit-slider-thumb {
									-webkit-appearance: none;
									appearance: none;
									width: 26px;
									height: 26px;
									margin-top: 3px;
									border-radius: 50%;
									border: none;
									background: #ffffff;
									box-shadow: 0 3px 10px rgba(2, 6, 23, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.7), 0 0 14px rgba(255, 255, 255, 0.35);
									cursor: pointer;
									transition: box-shadow 0.2s ease;
								}
								.cline-effort-slider:focus-visible::-webkit-slider-thumb {
									box-shadow: 0 4px 14px rgba(2, 6, 23, 0.5), 0 0 0 4px rgba(139, 92, 246, 0.5);
								}
								.cline-effort-slider::-moz-range-track {
									background: transparent;
								}
								.cline-effort-slider::-moz-range-thumb {
									width: 38px;
									height: 38px;
									border: none;
									border-radius: 50%;
									background: #ffffff;
									box-shadow: 0 3px 10px rgba(2, 6, 23, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.7), 0 0 14px rgba(255, 255, 255, 0.35);
									cursor: pointer;
								}
								.cline-effort-burst {
									position: absolute;
									top: 50%;
									width: 0;
									height: 0;
									z-index: 3;
									pointer-events: none;
								}
								.cline-effort-burst-ring {
									position: absolute;
									left: -6px;
									top: -6px;
									width: 12px;
									height: 12px;
									border-radius: 50%;
									border: 1.5px solid rgba(255, 255, 255, 0.85);
									animation: cline-effort-burst-ring 560ms ease-out forwards;
								}
								.cline-effort-burst-flash {
									position: absolute;
									left: -4px;
									top: -4px;
									width: 8px;
									height: 8px;
									border-radius: 50%;
									background: rgba(255, 255, 255, 0.95);
									box-shadow: 0 0 18px 6px rgba(168, 102, 248, 0.65);
									animation: cline-effort-burst-flash 520ms ease-out forwards;
								}
								.cline-effort-burst-particle {
									position: absolute;
									left: 0;
									top: 0;
									border-radius: 50%;
									box-shadow: 0 0 8px rgba(255, 255, 255, 0.85);
									animation: cline-effort-burst-particle 760ms cubic-bezier(0.15, 0.7, 0.3, 1) forwards;
								}
								@keyframes cline-effort-burst-ring {
									0% { transform: scale(0.4); opacity: 0.95; }
									100% { transform: scale(4.6); opacity: 0; }
								}
								@keyframes cline-effort-burst-flash {
									0% { transform: scale(0.4); opacity: 1; }
									100% { transform: scale(5); opacity: 0; }
								}
								@keyframes cline-effort-burst-particle {
									0% { transform: translate(0, 0) scale(0.3); opacity: 0; }
									10%, 60% { opacity: 1; }
									100% { transform: translate(var(--tx), var(--ty)) scale(0.15); opacity: 0; }
								}
								@keyframes cline-effort-drift {
									0% { opacity: 0; transform: translateX(0) scale(0.8); }
									6%, 92% { opacity: var(--sparkle-peak, 0.35); }
									100% { opacity: 0; transform: translateX(340px) scale(1); }
								}
								@keyframes cline-effort-sheen {
									0%, 55% { transform: translateX(-120%); }
									85%, 100% { transform: translateX(120%); }
								}
								@media (prefers-reduced-motion: reduce) {
									.cline-effort-fill.is-max .cline-effort-sheen { display: none; animation: none; }
									.cline-effort-sparkle { animation: none; opacity: var(--sparkle-peak, 0.35); }
									.cline-effort-burst { display: none; }
								}
								`}
							</style>
							<div className="relative h-8 w-full">
								<div className="cline-effort-base absolute inset-x-0 top-1/2 h-[26px] -translate-y-1/2 rounded-full" />
								<div
									className={`cline-effort-fill absolute inset-x-0 top-1/2 h-[26px] -translate-y-1/2 overflow-hidden rounded-full ${isMaxEffort ? "is-max" : ""}`}
									style={{ clipPath: `inset(0 ${effortFillRightInset} 0 0 round 9999px)` }}>
									<div className="cline-effort-sheen" />
									{EFFORT_SPARKLES.map((sparkle, index) => (
										<span
											className="cline-effort-sparkle absolute rounded-full bg-white"
											key={`${sparkle.top}-${index}`}
											style={{
												top: `${sparkle.top}%`,
												width: sparkle.size,
												height: sparkle.size,
												animationDelay: `-${(sparkleCycleSeconds * ((index + 0.5) / EFFORT_SPARKLES.length)).toFixed(2)}s`,
												animationDuration: `${(sparkleCycleSeconds * (0.85 + (index % 3) * 0.15)).toFixed(2)}s`,
											}}
										/>
									))}
								</div>
								<input
									aria-label="思考强度"
									className="cline-effort-slider"
									max={effortOptions.length - 1}
									min={0}
									onChange={(e) => setSliderIndex(Number(e.target.value))}
									onKeyUp={(e) => commitSlider(Number((e.target as HTMLInputElement).value))}
									onPointerUp={(e) => commitSlider(Number((e.target as HTMLInputElement).value))}
									step={1}
									type="range"
									value={sliderIndex}
								/>
								{burstKey > 0 ? (
									<div className="cline-effort-burst" key={burstKey} style={{ left: effortThumbLeft }}>
										<span className="cline-effort-burst-flash" />
										<span className="cline-effort-burst-ring" />
										{EFFORT_BURST_PARTICLES.map((particle, index) => (
											<span
												className="cline-effort-burst-particle"
												key={`${particle.tx}-${particle.ty}-${index}`}
												style={
													{
														width: particle.size,
														height: particle.size,
														marginLeft: -particle.size / 2,
														marginTop: -particle.size / 2,
														background: particle.color,
														animationDelay: `${particle.delay}ms`,
														"--tx": `${particle.tx}px`,
														"--ty": `${particle.ty}px`,
													} as React.CSSProperties
												}
											/>
										))}
									</div>
								) : null}
							</div>
							<div className="mt-1.5 flex justify-between text-[10px] text-description">
								{effortOptions.map((effort, index) => (
									<span
										className={index === sliderIndex ? "font-semibold text-foreground" : ""}
										key={effort}
										style={
											REASONING_EFFORT_LABELS[effort] === "最大"
												? MAX_EFFORT_TEXT_GRADIENT
												: undefined
										}>
										{REASONING_EFFORT_LABELS[effort]}
									</span>
								))}
							</div>
						</>
					)}
				</div>
			)}
			</div>

			<div className="p-2">
				<button
					className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-(--vscode-list-hoverBackground)"
					onClick={openSettings}>
					<SettingsIcon size={12} />
					打开 API 设置
				</button>
			</div>

			{error ? <div className="px-3 pb-2 text-[10px] text-(--vscode-errorForeground)">{error}</div> : null}
		</div>,
		document.body,
	)
}

export default ModelProfileMenu
