import { TooltipContent, TooltipTrigger } from "@radix-ui/react-tooltip"
import { azureOpenAiDefaultApiVersion } from "@shared/api"
import { OpenAiModelsRequest, ResolveModelInfoRequest } from "@shared/proto/cline/models"
import { UpdateSettingsRequest } from "@shared/proto/cline/state"
import { fromProtobufModelInfo } from "@shared/proto-conversions/models/typeConversion"
import type { Mode } from "@shared/storage/types"
import { VSCodeButton, VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { Tooltip } from "@/components/ui/tooltip"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useDynamicProviderSelection } from "@/hooks/useDynamicProviderSelection"
import { fromProtobufProviderModelOverrides, type ProviderModelOverrides, useProviderConfig } from "@/hooks/useProviderConfig"
import { ModelsServiceClient, StateServiceClient } from "@/services/grpc-client"
import { BaseUrlField } from "../common/BaseUrlField"
import { DebouncedTextField } from "../common/DebouncedTextField"
import { DropdownContainer } from "../common/ModelSelector"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"
import { ProviderPresetManager } from "./ProviderPresetManager"
import {
	createPresetModel,
	createProviderPresetId,
	type DetectedModelParameters,
	inferModelParameters,
	parseProviderPresets,
	presetModelOverrides,
	type ProviderPreset,
	type ProviderPresetApiFormat,
	type ProviderPresetModel,
	serializeProviderPresets,
} from "./providerPresets"

/**
 * Props for the OpenAICompatibleProvider component
 */
interface OpenAICompatibleProviderProps {
	providerId: string
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The OpenAI Compatible provider configuration component
 */
export const OpenAICompatibleProvider = ({ providerId, currentMode }: OpenAICompatibleProviderProps) => {
	const { apiConfiguration, remoteConfigSettings, providerPresets } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()
	const { config, write, commitSelection } = useProviderConfig(providerId)

	const [isCustomOpenAiModelEntryVisible, setIsCustomOpenAiModelEntryVisible] = useState(false)
	const [availableOpenAiModels, setAvailableOpenAiModels] = useState<string[]>([])
	const [isRefreshingOpenAiModels, setIsRefreshingOpenAiModels] = useState(false)
	const [openAiModelsError, setOpenAiModelsError] = useState<string | undefined>(undefined)
	const [presetList, setPresetList] = useState<ProviderPreset[]>(() => parseProviderPresets(providerPresets))
	const [activePresetId, setActivePresetId] = useState<string | null>(() => {
		try {
			return localStorage.getItem("cline-chinese.active-provider-preset.v1")
		} catch {
			return null
		}
	})
	const [presetBusy, setPresetBusy] = useState(false)
	const [presetError, setPresetError] = useState("")

	useEffect(() => {
		setPresetList(parseProviderPresets(providerPresets))
	}, [providerPresets])
	// Only the built-in "openai" provider stores its API key in the legacy
	// ApiConfiguration field; custom providers keep it in their per-provider
	// config (available only as a masked length), so there is no plaintext key
	// to seed the model-refresh request with.
	const legacyOpenAiApiKey = providerId === "openai" ? apiConfiguration?.openAiApiKey || "" : ""
	const latestOpenAiApiKeyRef = useRef(legacyOpenAiApiKey)
	const openAiModelsRequestRef = useRef(0)

	useEffect(() => {
		latestOpenAiApiKeyRef.current = legacyOpenAiApiKey
	}, [legacyOpenAiApiKey])

	const handleProviderConfigWriteError = useCallback((fieldName: string, error: unknown) => {
		console.error(`Failed to update OpenAI Compatible ${fieldName}:`, error)
	}, [])

	// Built-in "openai" persists model selection to its legacy ApiConfiguration
	// fields; custom/unknown providers persist via their per-provider committed
	// selection. Prefer the committed selection and fall back to the legacy
	// fields so the built-in provider keeps working unchanged.
	const isOpenAiProvider = providerId === "openai" || providerId === "openai-compatible"
	const { selectedModelId: legacySelectedModelId, selectedModelInfo: legacySelectedModelInfo } = useDynamicProviderSelection(
		providerId,
		apiConfiguration,
		currentMode,
	)
	const committedSelection = currentMode === "plan" ? config?.planSelection : config?.actSelection
	const selectedModelId = committedSelection?.modelId ?? legacySelectedModelId
	const selectedModelInfo = committedSelection?.modelInfo
		? fromProtobufModelInfo(committedSelection.modelInfo)
		: legacySelectedModelInfo
	const selectedModelOverrides = fromProtobufProviderModelOverrides(committedSelection?.overrides) ?? {}
	// Plan and Act have independent selections, so each mode gets its own
	// pending accumulator: a pending commit in one mode must never become
	// the base (or the model id) for an edit in the other mode, and a round
	// trip to the other mode must not disturb this mode's pending state.
	// Slots start empty; the reseed effect below fills a mode's slot before
	// it can be edited.
	const selectedModelOverridesRef = useRef<Record<Mode, PendingModelSelection>>({
		plan: { modelId: undefined, overrides: {} },
		act: { modelId: undefined, overrides: {} },
	})

	// Counts commits whose commit+read-back round-trip has not finished yet,
	// per mode.
	const pendingCommitsRef = useRef<Record<Mode, number>>({ plan: 0, act: 0 })

	useEffect(() => {
		// Do not reseed the pending-override accumulator from server state
		// while this mode's commits are in flight: an earlier commit's
		// read-back can land after a later local edit, and reseeding from
		// that stale snapshot would silently drop the already-committed
		// newer field.
		if (pendingCommitsRef.current[currentMode] > 0) {
			return
		}
		selectedModelOverridesRef.current[currentMode] = { modelId: selectedModelId, overrides: selectedModelOverrides }
	}, [committedSelection?.overrides, selectedModelId, currentMode])

	const commitOpenAiSelection = useCallback(
		(modelId: string, overrides?: ProviderModelOverrides) => {
			if (!modelId.trim()) {
				return
			}

			const mode = currentMode
			pendingCommitsRef.current[mode] += 1
			void commitSelection(mode, {
				providerId,
				modelId,
				...(overrides !== undefined ? { overrides } : {}),
			})
				.catch((error) => handleProviderConfigWriteError("model selection", error))
				.finally(() => {
					pendingCommitsRef.current[mode] -= 1
				})
		},
		[commitSelection, currentMode, handleProviderConfigWriteError, providerId],
	)

	useEffect(() => {
		return () => {
			openAiModelsRequestRef.current += 1
		}
	}, [])

	const refreshOpenAiModels = useCallback(
		async (baseUrl?: string, apiKey?: string) => {
			const trimmedBaseUrl = baseUrl?.trim()
			const requestId = openAiModelsRequestRef.current + 1
			openAiModelsRequestRef.current = requestId

			if (!trimmedBaseUrl) {
				setAvailableOpenAiModels([])
				setOpenAiModelsError(undefined)
				setIsRefreshingOpenAiModels(false)
				return
			}

			setIsRefreshingOpenAiModels(true)
			setOpenAiModelsError(undefined)

			try {
				// providerId lets the host back the request with this provider's
				// stored API key and headers — the webview only sees a masked key
				// for custom providers, so it can't send the credential itself.
				const response = await ModelsServiceClient.refreshOpenAiModels(
					OpenAiModelsRequest.create({
						providerId,
						baseUrl: trimmedBaseUrl,
						apiKey,
					}),
				)

				if (openAiModelsRequestRef.current === requestId) {
					setAvailableOpenAiModels(response.values)
				}
			} catch (error) {
				console.error("Failed to refresh OpenAI models:", error)
				if (openAiModelsRequestRef.current === requestId) {
					setAvailableOpenAiModels([])
					setOpenAiModelsError(error instanceof Error ? error.message : String(error))
				}
			} finally {
				if (openAiModelsRequestRef.current === requestId) {
					setIsRefreshingOpenAiModels(false)
				}
			}
		},
		[providerId],
	)

	useEffect(() => {
		void refreshOpenAiModels(config?.baseUrl, latestOpenAiApiKeyRef.current)
	}, [config?.baseUrl, refreshOpenAiModels])

	const handleOpenAiModelSelection = useCallback(
		(modelId: string, overridesOverride?: ProviderModelOverrides) => {
			if (isOpenAiProvider) {
				handleModeFieldChange({ plan: "planModeOpenAiModelId", act: "actModeOpenAiModelId" }, modelId, currentMode)
			}
			// Model metadata here is user-authored (prices, context window,
			// capabilities), not catalog data, so it must survive a model-id
			// edit like it did when the legacy extension kept it in a single
			// id-independent blob. Recommit the displayed overrides under the
			// new id; otherwise an unknown id resolves to safe defaults whose
			// zero prices misbill paid requests as $0.
			const overrides = overridesOverride ?? selectedModelOverridesRef.current[currentMode].overrides
			const hasOverrides = Object.keys(overrides).length > 0
			selectedModelOverridesRef.current[currentMode] = { modelId, overrides }
			commitOpenAiSelection(modelId, hasOverrides ? overrides : undefined)
		},
		[commitOpenAiSelection, currentMode, handleModeFieldChange, isOpenAiProvider],
	)

	const rememberActivePreset = (presetId: string | null) => {
		setActivePresetId(presetId)
		try {
			if (presetId) {
				localStorage.setItem("cline-chinese.active-provider-preset.v1", presetId)
			} else {
				localStorage.removeItem("cline-chinese.active-provider-preset.v1")
			}
		} catch {
			// ignore storage errors
		}
	}

	useEffect(() => {
		const handler = (event: Event) => {
			const presetId = (event as CustomEvent<string>).detail
			if (presetId) {
				setActivePresetId(presetId)
			}
		}
		window.addEventListener("cline-provider-preset-selected", handler)
		return () => window.removeEventListener("cline-provider-preset-selected", handler)
	}, [])

	const persistPresets = async (next: ProviderPreset[]) => {
		const previous = presetList
		setPresetBusy(true)
		setPresetError("")
		setPresetList(next)
		try {
			await StateServiceClient.updateSettings(
				UpdateSettingsRequest.create({ providerPresets: serializeProviderPresets(next) }),
			)
		} catch (e) {
			// Roll the optimistic list back so a failed save cannot leave a
			// phantom provider in the UI that was never persisted.
			setPresetList(previous)
			setPresetError(`保存供应商配置失败：${e instanceof Error ? e.message : String(e)}`)
			throw e
		} finally {
			setPresetBusy(false)
		}
	}

	const applyProviderPreset = async (preset: ProviderPreset, modelId?: string) => {
		setPresetError("")
		try {
			await write({
				baseUrl: preset.baseUrl,
				...(preset.apiKey ? { apiKey: preset.apiKey } : {}),
			})
			const requested = modelId && preset.models.some((model) => model.id === modelId && model.enabled) ? modelId : undefined
			const target = preset.models.find((model) => model.id === requested) ?? preset.models.find((model) => model.enabled)
			if (target) {
				handleOpenAiModelSelection(target.id, presetModelOverrides(preset, target))
			}
			rememberActivePreset(preset.id)
		} catch (e) {
			setPresetError(`应用供应商配置失败：${e instanceof Error ? e.message : String(e)}`)
		}
	}

	const handleCreateProviderPreset = async (input: {
		name: string
		baseUrl: string
		apiKey: string
		apiFormat: ProviderPresetApiFormat
	}) => {
		if (presetList.some((preset) => preset.name.trim() === input.name.trim())) {
			throw new Error("已存在同名供应商")
		}
		const now = Date.now()
		const model = selectedModelId
			? createPresetModel(selectedModelId, {
					contextWindow: selectedModelInfo?.contextWindow,
					maxTokens: selectedModelInfo?.maxTokens,
					supportsVision: selectedModelInfo?.supportsImages,
				})
			: undefined
		const preset: ProviderPreset = {
			id: createProviderPresetId(),
			name: input.name,
			baseUrl: input.baseUrl,
			apiKey: input.apiKey,
			apiFormat: input.apiFormat,
			enabled: true,
			models: model ? [model] : [],
			createdAt: now,
			updatedAt: now,
		}
		await persistPresets([preset, ...presetList])
		await applyProviderPreset(preset)
		return preset.id
	}

	const handleUpdateProviderPreset = async (presetId: string, patch: Partial<ProviderPreset>) => {
		const existing = presetList.find((preset) => preset.id === presetId)
		if (!existing) {
			return
		}
		const updated: ProviderPreset = { ...existing, ...patch, updatedAt: patch.updatedAt ?? Date.now() }
		await persistPresets(presetList.map((preset) => (preset.id === presetId ? updated : preset)))
		const shouldReapply = ["baseUrl", "apiKey", "apiFormat"].some((key) => key in patch)
		if (shouldReapply && activePresetId === presetId && updated.enabled) {
			await applyProviderPreset(updated, selectedModelId || undefined)
		}
	}

	const handleDeleteProviderPreset = async (presetId: string) => {
		await persistPresets(presetList.filter((preset) => preset.id !== presetId))
		if (activePresetId === presetId) {
			rememberActivePreset(null)
		}
	}

	const handleSavePresetModel = async (preset: ProviderPreset, model: ProviderPresetModel, originalId?: string) => {
		if (activePresetId === preset.id && (originalId ?? model.id) === selectedModelId) {
			handleOpenAiModelSelection(model.id, presetModelOverrides(preset, model))
		}
	}

	const resolvePresetModel = useCallback(
		async (modelId: string): Promise<DetectedModelParameters | undefined> => {
			const trimmed = modelId.trim()
			if (!trimmed) {
				return undefined
			}
			try {
				// The provider catalog lookup can wait on a slow /models endpoint.
				// Cap it so automatic detection still resolves quickly from the
				// bundled catalog / local family table.
				const response = await Promise.race([
					ModelsServiceClient.resolveModelInfo(
						ResolveModelInfoRequest.create({ providerId, modelId: trimmed }),
					),
					new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1200)),
				])
				if (!response) {
					return inferModelParameters(trimmed)
				}
				const sameModel = !response.modelId || response.modelId.toLowerCase() === trimmed.toLowerCase()
				if (response.modelInfo && sameModel) {
					const info = fromProtobufModelInfo(response.modelInfo)
					const detected: DetectedModelParameters = {
						contextWindow: info.contextWindow,
						maxTokens: info.maxTokens,
						supportsVision: info.supportsImages,
						capabilities: info.capabilities ? [...info.capabilities] : undefined,
						source: response.source,
					}
					if (detected.contextWindow || detected.maxTokens || detected.supportsVision) {
						return detected
					}
				}
			} catch (error) {
				console.error("Failed to resolve model info:", error)
			}
			return inferModelParameters(trimmed)
		},
		[providerId],
	)

	return (
		<div className="flex flex-col gap-3" style={{ maxWidth: 920 }}>
			<div className="flex flex-col gap-2">
				<div>
					<div className="text-xs font-semibold text-foreground">供应商配置</div>
					<div className="mt-0.5 text-[10px] text-description">保存多套供应商，切换时自动写入 Base URL、密钥和模型</div>
				</div>
				<ProviderPresetManager
					activePresetId={activePresetId}
					busy={presetBusy}
					currentModelId={selectedModelId || ""}
					error={presetError}
					onApply={applyProviderPreset}
					onCreate={handleCreateProviderPreset}
					onDelete={handleDeleteProviderPreset}
					onReplaceAll={persistPresets}
					onResolveModel={resolvePresetModel}
					onSaveModel={handleSavePresetModel}
					onUpdate={handleUpdateProviderPreset}
					presets={presetList}
				/>
			</div>

			<SettingsCard description="服务端返回的模型列表；上方供应商卡片里也可以手动维护模型" title="从 API 选择模型">
			<label htmlFor="openai-compatible-model-picker">
				<span style={{ fontWeight: 500 }}>模型 ID</span>
				{isRefreshingOpenAiModels && <span> 正在加载模型…</span>}
			</label>
			{openAiModelsError && <div role="alert">{openAiModelsError}</div>}
			{availableOpenAiModels.length > 0 ? (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 8,
						marginBottom: 10,
					}}>
					<DropdownContainer className="dropdown-container">
						<VSCodeDropdown
							aria-label="模型 ID"
							className="w-full"
							id="openai-compatible-model-picker"
							// Force VSCodeDropdown to re-initialize after async
							// model-list/selection hydration, otherwise it ignores the
							// value prop for dynamically rendered options.
							// https://github.com/microsoft/vscode-webview-ui-toolkit/issues/433
							key={`${selectedModelId ?? ""}:${isCustomOpenAiModelEntryVisible}:${availableOpenAiModels.join("\u0000")}`}
							onChange={(event) => {
								const modelId = (event.target as HTMLSelectElement).value
								if (modelId === "__custom__") {
									setIsCustomOpenAiModelEntryVisible(true)
									return
								}

								setIsCustomOpenAiModelEntryVisible(false)
								handleOpenAiModelSelection(modelId)
							}}
							value={selectedModelId && availableOpenAiModels.includes(selectedModelId) ? selectedModelId : ""}>
							{selectedModelId && !availableOpenAiModels.includes(selectedModelId) && (
								<VSCodeOption value="">{selectedModelId}（不在当前列表中）</VSCodeOption>
							)}
							{availableOpenAiModels.map((modelId) => (
								<VSCodeOption className="break-words whitespace-normal max-w-full" key={modelId} value={modelId}>
									{modelId}
								</VSCodeOption>
							))}
							<VSCodeOption value="__custom__">使用自定义模型 ID…</VSCodeOption>
						</VSCodeDropdown>
					</DropdownContainer>

					{(isCustomOpenAiModelEntryVisible ||
						(selectedModelId && !availableOpenAiModels.includes(selectedModelId))) && (
						<DebouncedTextField
							initialValue={selectedModelId || ""}
							onChange={(value) => handleOpenAiModelSelection(value)}
							placeholder={"输入模型 ID..."}
							style={{ width: "100%" }}>
							<span style={{ fontWeight: 500 }}>自定义模型 ID</span>
						</DebouncedTextField>
					)}
				</div>
			) : (
				<DebouncedTextField
					initialValue={selectedModelId || ""}
					onChange={(value) => handleOpenAiModelSelection(value)}
					placeholder={"输入模型 ID..."}
					style={{ width: "100%", marginBottom: 10 }}
				/>
			)}

			</SettingsCard>

			<SettingsCard title="高级设置">
			{/* OpenAI Compatible Custom Headers */}
			{(() => {
				const headers = config?.headers ?? {}
				const headerEntries = Object.entries(headers)

				return (
					<div style={{ marginBottom: 10 }}>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
							}}>
							<Tooltip>
								<TooltipTrigger>
									<div className="flex items-center gap-2">
										<span style={{ fontWeight: 500 }}>自定义请求头</span>
										{remoteConfigSettings?.openAiHeaders !== undefined && (
											<i className="codicon codicon-lock text-description text-sm" />
										)}
									</div>
								</TooltipTrigger>
								<TooltipContent hidden={remoteConfigSettings?.openAiHeaders === undefined}>
									此设置由你组织的远程配置管理
								</TooltipContent>
							</Tooltip>
							<VSCodeButton
								disabled={remoteConfigSettings?.openAiHeaders !== undefined}
								onClick={() => {
									const currentHeaders = { ...headers }
									const headerCount = Object.keys(currentHeaders).length
									const newKey = `header${headerCount + 1}`
									currentHeaders[newKey] = ""
									void write({ headers: currentHeaders }).catch((error) =>
										handleProviderConfigWriteError("headers", error),
									)
								}}>
								添加请求头
							</VSCodeButton>
						</div>

						<div>
							{headerEntries.map(([key, value], index) => (
								<div key={index} style={{ display: "flex", gap: 5, marginTop: 5 }}>
									<DebouncedTextField
										disabled={remoteConfigSettings?.openAiHeaders !== undefined}
										initialValue={key}
										onChange={(newValue) => {
											const currentHeaders = config?.headers ?? {}
											if (newValue && newValue !== key) {
												const { [key]: _, ...rest } = currentHeaders
												void write({
													headers: {
														...rest,
														[newValue]: value,
													},
												}).catch((error) => handleProviderConfigWriteError("headers", error))
											}
										}}
										placeholder="请求头名称"
										style={{ width: "40%" }}
									/>
									<DebouncedTextField
										disabled={remoteConfigSettings?.openAiHeaders !== undefined}
										initialValue={value}
										onChange={(newValue) => {
											void write({
												headers: {
													...(config?.headers ?? {}),
													[key]: newValue,
												},
											}).catch((error) => handleProviderConfigWriteError("headers", error))
										}}
										placeholder="请求头值"
										style={{ width: "40%" }}
									/>
									<VSCodeButton
										appearance="secondary"
										disabled={remoteConfigSettings?.openAiHeaders !== undefined}
										onClick={() => {
											const { [key]: _, ...rest } = config?.headers ?? {}
											void write({ headers: rest }).catch((error) =>
												handleProviderConfigWriteError("headers", error),
											)
										}}>
										删除
									</VSCodeButton>
								</div>
							))}
						</div>
					</div>
				)
			})()}

			{remoteConfigSettings?.azureApiVersion !== undefined ? (
				<Tooltip>
					<TooltipTrigger>
						<BaseUrlField
							disabled={true}
							initialValue={apiConfiguration?.azureApiVersion}
							label="设置 Azure API 版本"
							onChange={(value) => handleFieldChange("azureApiVersion", value)}
							placeholder={`默认：${azureOpenAiDefaultApiVersion}`}
							showLockIcon={true}
						/>
					</TooltipTrigger>
					<TooltipContent>此设置由你组织的远程配置管理</TooltipContent>
				</Tooltip>
			) : (
				<BaseUrlField
					initialValue={apiConfiguration?.azureApiVersion}
					label="设置 Azure API 版本"
					onChange={(value) => handleFieldChange("azureApiVersion", value)}
					placeholder={`默认：${azureOpenAiDefaultApiVersion}`}
				/>
			)}

			<VSCodeCheckbox
				checked={apiConfiguration?.azureIdentity || false}
				onChange={(e: any) => {
					const isChecked = e.target.checked === true
					return handleFieldChange("azureIdentity", isChecked)
				}}>
				使用 Azure 身份验证
			</VSCodeCheckbox>

			</SettingsCard>
		</div>
	)
}

interface SettingsCardProps {
	title: string
	description?: string
	children: ReactNode
}

const SettingsCard = ({ title, description, children }: SettingsCardProps) => (
	<section className="rounded-lg border border-(--vscode-widget-border) p-3">
		<div className="mb-2">
			<div className="text-xs font-semibold text-foreground">{title}</div>
			{description ? <div className="mt-0.5 text-[10px] text-description">{description}</div> : null}
		</div>
		{children}
	</section>
)

type PendingModelSelection = { modelId: string | undefined; overrides: ProviderModelOverrides }
