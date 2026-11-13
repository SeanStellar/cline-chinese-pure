import { OpenAiModelsRequest } from "@shared/proto/cline/models"
import {
	BoxIcon,
	CheckIcon,
	ChevronDownIcon,
	EyeIcon,
	EyeOffIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	RefreshCwIcon,
	Trash2Icon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { ModelsServiceClient } from "@/services/grpc-client"
import {
	createPresetModel,
	inferModelParameters,
	modelBadges,
	type DetectedModelParameters,
	type ProviderPreset,
	type ProviderPresetApiFormat,
	type ProviderPresetModel,
} from "./providerPresets"

interface ProviderPresetManagerProps {
	presets: ProviderPreset[]
	activePresetId: string | null
	currentModelId: string
	busy: boolean
	error: string
	onCreate: (input: {
		name: string
		baseUrl: string
		apiKey: string
		apiFormat: ProviderPresetApiFormat
	}) => Promise<string | undefined>
	onUpdate: (presetId: string, patch: Partial<ProviderPreset>) => Promise<void>
	onDelete: (presetId: string) => Promise<void>
	onReplaceAll: (next: ProviderPreset[]) => Promise<void>
	onApply: (preset: ProviderPreset, modelId?: string) => Promise<void>
	onSaveModel: (preset: ProviderPreset, model: ProviderPresetModel, originalId?: string) => Promise<void>
	onResolveModel?: (modelId: string) => Promise<DetectedModelParameters | undefined>
}

const inputClass =
	"h-8 w-full rounded-md border border-(--vscode-input-border) bg-(--vscode-input-background) px-2 text-xs text-(--vscode-input-foreground) outline-none focus:border-(--vscode-focusBorder)"

const selectClass =
	"h-8 w-full rounded-md border border-(--vscode-input-border) bg-(--vscode-input-background) px-2 text-xs text-(--vscode-input-foreground) outline-none focus:border-(--vscode-focusBorder)"

const labelClass = "text-[11px] text-description"

const API_FORMAT_OPTIONS: Array<{ value: ProviderPresetApiFormat; label: string }> = [
	{ value: "default", label: "Chat Completions (/chat/completions)" },
	{ value: "openai-responses", label: "Responses (/responses)" },
]

const REASONING_LEVEL_OPTIONS = [
	{ value: "none", label: "最小" },
	{ value: "low", label: "低" },
	{ value: "medium", label: "中" },
	{ value: "high", label: "高" },
	{ value: "xhigh", label: "极高" },
	{ value: "max", label: "最大" },
] as const

function normalizeReasoningLevels(values: string[]): string[] {
	return values.filter((value) => REASONING_LEVEL_OPTIONS.some((option) => option.value === value))
}

function reasoningLevelOrder(value: string): number {
	const index = REASONING_LEVEL_OPTIONS.findIndex((option) => option.value === value)
	return index >= 0 ? index : REASONING_LEVEL_OPTIONS.length
}

function modelDetectionSourceLabel(source: string): string {
	switch (source) {
		case "local-family":
			return "本地推断"
		case "global-catalog":
			return "内置模型库"
		case "sdk-known-models":
		case "sdk-default":
			return "模型目录"
		case "committed-selection":
			return "已保存模型"
		default:
			return "自动识别"
	}
}

function parseOptionalNonNegativeNumber(value: string): number | undefined | null {
	const trimmed = value.trim()
	if (!trimmed) {
		return undefined
	}
	const parsed = Number(trimmed)
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function apiFormatLabel(value: ProviderPresetApiFormat): string {
	return API_FORMAT_OPTIONS.find((option) => option.value === value)?.label ?? API_FORMAT_OPTIONS[0].label
}


export function ProviderPresetManager({
	presets,
	activePresetId,
	currentModelId,
	busy,
	error,
	onCreate,
	onUpdate,
	onDelete,
	onReplaceAll,
	onApply,
	onSaveModel,
	onResolveModel,
}: ProviderPresetManagerProps) {
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
	const [isCreating, setIsCreating] = useState(false)
	const [dialogKey, setDialogKey] = useState(0)
	const [newName, setNewName] = useState("")
	const [newBaseUrl, setNewBaseUrl] = useState("")
	const [newApiKey, setNewApiKey] = useState("")
	const [newApiFormat, setNewApiFormat] = useState<ProviderPresetApiFormat>("default")
	const [createError, setCreateError] = useState("")
	const [modelDialog, setModelDialog] = useState<{ preset: ProviderPreset; model?: ProviderPresetModel; originalId?: string } | null>(
		null,
	)
	const [importingPresetId, setImportingPresetId] = useState<string | null>(null)
	const [importMessage, setImportMessage] = useState("")
	const [importError, setImportError] = useState("")
	const [transferMessage, setTransferMessage] = useState("")
	const [transferError, setTransferError] = useState("")

	const selectedPreset =
		presets.find((preset) => preset.id === selectedPresetId) ??
		presets.find((preset) => preset.id === activePresetId) ??
		presets[0]
	const selectedPresetIndex = presets.findIndex((preset) => preset.id === selectedPreset?.id)

	useEffect(() => {
		if (presets.length === 0) {
			setSelectedPresetId(null)
			return
		}
		if (selectedPresetId && presets.some((preset) => preset.id === selectedPresetId)) {
			return
		}
		setSelectedPresetId(activePresetId ?? presets[0].id)
	}, [activePresetId, presets, selectedPresetId])

	const submitCreate = async () => {
		const name = newName.trim()
		const baseUrl = newBaseUrl.trim()
		if (!name) {
			setCreateError("请填写供应商名称")
			return
		}
		if (!baseUrl) {
			setCreateError("请填写 Base URL")
			return
		}
		setCreateError("")
		try {
			const createdId = await onCreate({ name, baseUrl, apiKey: newApiKey.trim(), apiFormat: newApiFormat })
			if (createdId) {
				setSelectedPresetId(createdId)
			}
			setIsCreating(false)
			setNewName("")
			setNewApiKey("")
			setNewApiFormat("default")
		} catch (e) {
			setCreateError(e instanceof Error ? e.message : String(e))
		}
	}

	const openAddModel = (preset: ProviderPreset) => {
		setDialogKey((value) => value + 1)
		setModelDialog({ preset, model: createPresetModel("") })
	}

	const openEditModel = (preset: ProviderPreset, model: ProviderPresetModel) => {
		setDialogKey((value) => value + 1)
		setModelDialog({ preset, model, originalId: model.id })
	}

	const exportPresets = async () => {
		setTransferMessage("")
		setTransferError("")
		try {
			const sanitized = presets.map((preset) => ({ ...preset, apiKey: "" }))
			await navigator.clipboard.writeText(serializeProviderPresets(sanitized))
			setTransferMessage(`已复制 ${presets.length} 个供应商配置（不含密钥，导入后请重新填写 API Key）`)
		} catch (e) {
			setTransferError(`导出失败：${e instanceof Error ? e.message : String(e)}`)
		}
	}

	const importPresets = async () => {
		setTransferMessage("")
		setTransferError("")
		try {
			const text = await navigator.clipboard.readText()
			const imported = parseProviderPresets(text)
			if (imported.length === 0) {
				throw new Error("剪贴板中没有有效的供应商配置")
			}
			const merged = new Map(presets.map((preset) => [preset.id, preset]))
			for (const preset of imported) {
				merged.set(preset.id, preset)
			}
			await onReplaceAll([...merged.values()])
			setTransferMessage(`已导入 ${imported.length} 个供应商配置`)
		} catch (e) {
			setTransferError(`导入失败：${e instanceof Error ? e.message : String(e)}`)
		}
	}

	const movePreset = async (presetId: string, delta: number) => {
		const index = presets.findIndex((preset) => preset.id === presetId)
		const target = index + delta
		if (index < 0 || target < 0 || target >= presets.length) {
			return
		}
		const next = [...presets]
		const [item] = next.splice(index, 1)
		next.splice(target, 0, item)
		await onReplaceAll(next)
	}

	const importModelsFromApi = async (preset: ProviderPreset) => {
		setImportingPresetId(preset.id)
		setImportMessage("")
		setImportError("")
		try {
			const response = await ModelsServiceClient.refreshOpenAiModels(
				OpenAiModelsRequest.create({ providerId: "openai", baseUrl: preset.baseUrl, apiKey: preset.apiKey }),
			)
			const existing = new Set(preset.models.map((model) => model.id))
			const incoming = response.values.filter((modelId) => !existing.has(modelId))
			const models = [...preset.models]
			for (const modelId of incoming) {
				const model = createPresetModel(modelId)
				const inferred = inferModelParameters(modelId)
				if (inferred) {
					model.contextWindow = inferred.contextWindow
					model.maxTokens = inferred.maxTokens
					model.supportsVision = Boolean(inferred.supportsVision)
					model.inputTypes = {
						text: true,
						image: Boolean(inferred.supportsVision),
						video: Boolean(inferred.capabilities?.includes("video")),
						pdf: Boolean(inferred.capabilities?.includes("files")),
					}
					model.capabilities = (inferred.capabilities ?? []).filter(
						(capability) => capability === "structured_output",
					)
				}
				models.push(model)
			}
			await onUpdate(preset.id, { models, updatedAt: Date.now() })
			setImportMessage(
				incoming.length > 0
					? `连接成功，从 /models 导入 ${incoming.length} 个模型`
					: `连接成功，没有新模型（服务端返回 ${response.values.length} 个）`,
			)
		} catch (e) {
			setImportError(`连接失败：${e instanceof Error ? e.message : String(e)}`)
		} finally {
			setImportingPresetId(null)
		}
	}

	const saveModel = async (model: ProviderPresetModel) => {
		if (!modelDialog) {
			return
		}
		const { preset, originalId } = modelDialog
		let models = preset.models
		if (originalId && originalId !== model.id) {
			models = models.filter((item) => item.id !== originalId)
		}
		const existingIndex = models.findIndex((item) => item.id === model.id)
		models =
			existingIndex >= 0
				? models.map((item) => (item.id === model.id ? model : item))
				: [...models, model]
		const nextPreset: ProviderPreset = { ...preset, models, updatedAt: Date.now() }
		await onUpdate(preset.id, { models, updatedAt: nextPreset.updatedAt })
		await onSaveModel(nextPreset, model, originalId)
		setModelDialog(null)
	}

	const deleteModel = async (preset: ProviderPreset, modelId: string) => {
		const models = preset.models.filter((item) => item.id !== modelId)
		await onUpdate(preset.id, { models, updatedAt: Date.now() })
		if (preset.id === activePresetId && modelId === currentModelId) {
			const fallback = models.find((item) => item.enabled)
			await onApply({ ...preset, models }, fallback?.id)
		}
	}

	const toggleModel = async (preset: ProviderPreset, model: ProviderPresetModel, enabled: boolean) => {
		await onUpdate(preset.id, {
			models: preset.models.map((item) => (item.id === model.id ? { ...item, enabled } : item)),
			updatedAt: Date.now(),
		})
	}

	const toggleProvider = async (preset: ProviderPreset, enabled: boolean) => {
		await onUpdate(preset.id, { enabled, updatedAt: Date.now() })
		if (enabled) {
			await onApply(preset)
		}
	}

	return (
		<div>
			<div className="flex flex-wrap items-center gap-1.5">
				{presets.map((preset) => (
					<button
						className={`rounded-full border px-2.5 py-1 text-[11px] ${
							preset.id === selectedPreset?.id
								? "border-(--vscode-focusBorder) bg-(--vscode-list-activeSelectionBackground) text-foreground"
								: "border-(--vscode-widget-border) text-description hover:text-foreground"
						}`}
						key={preset.id}
						onClick={() => setSelectedPresetId(preset.id)}
						type="button">
						{preset.name}
						{preset.id === activePresetId ? " · 当前" : ""}
					</button>
				))}
				<button
					className="flex items-center gap-1 rounded-full border border-(--vscode-widget-border) px-2.5 py-1 text-[11px] text-description hover:text-foreground"
					onClick={() => {
						setNewName("")
						setNewBaseUrl("")
						setNewApiKey("")
						setNewApiFormat("default")
						setCreateError("")
						setIsCreating(true)
					}}
					type="button">
					<PlusIcon size={11} />
					新建供应商
				</button>
				<button
					className="text-[10px] text-description hover:text-foreground"
					onClick={() => void exportPresets()}
					type="button">
					导出
				</button>
				<button
					className="text-[10px] text-description hover:text-foreground"
					onClick={() => void importPresets()}
					type="button">
					导入
				</button>
			</div>

			{transferMessage ? (
				<div className="mt-1 text-[10px] text-(--vscode-charts-green)">{transferMessage}</div>
			) : null}
			{transferError ? <div className="mt-1 text-[10px] text-(--vscode-errorForeground)">{transferError}</div> : null}
			<div className="mt-1 text-[9px] text-description">密钥仅保存在本机扩展状态；导出的 JSON 不含密钥。</div>

			{isCreating && (
				<div className="mt-2 rounded-xl border border-(--vscode-widget-border) p-3">
					<div className="text-xs font-medium text-foreground">新建供应商</div>
					<div className="mt-2 grid grid-cols-1 gap-2">
						<label className="flex flex-col gap-0.5">
							<span className={labelClass}>名称</span>
							<input
								autoComplete="off"
								autoFocus
								className={inputClass}
								name="provider-preset-new-name"
								onChange={(e) => setNewName(e.target.value)}
								placeholder="例如：百度千帆"
								value={newName}
							/>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={labelClass}>Base URL</span>
							<input
								autoComplete="off"
								className={inputClass}
								name="provider-preset-new-base-url"
								onChange={(e) => setNewBaseUrl(e.target.value)}
								placeholder="https://qianfan.baidubce.com/v2/tokenplan/personal"
								value={newBaseUrl}
							/>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={labelClass}>API Key</span>
							<input
								autoComplete="new-password"
								className={inputClass}
								name="provider-preset-new-api-key"
								onChange={(e) => setNewApiKey(e.target.value)}
								placeholder="sk-..."
								type="password"
								value={newApiKey}
							/>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={labelClass}>API 格式</span>
							<select
								className={selectClass}
								onChange={(e) => setNewApiFormat(e.target.value as ProviderPresetApiFormat)}
								value={newApiFormat}>
								{API_FORMAT_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>
					</div>
					{createError ? <div className="mt-1 text-[10px] text-(--vscode-errorForeground)">{createError}</div> : null}
					<div className="mt-2 flex items-center gap-2">
						<button
							className="rounded-md px-2.5 py-1 text-[11px] text-(--vscode-button-foreground) hover:bg-(--vscode-button-hoverBackground)"
							disabled={busy}
							onClick={() => void submitCreate()}
							style={{ background: "var(--vscode-button-background)" }}
							type="button">
							保存
						</button>
						<button
							className="rounded-md px-2.5 py-1 text-[11px] text-description hover:text-foreground"
							onClick={() => setIsCreating(false)}
							type="button">
							取消
						</button>
					</div>
				</div>
			)}

			{selectedPreset ? (
				<ProviderCard
					activePresetId={activePresetId}
					busy={busy}
					currentModelId={currentModelId}
					importing={importingPresetId === selectedPreset.id}
					canMoveDown={selectedPresetIndex >= 0 && selectedPresetIndex < presets.length - 1}
					canMoveUp={selectedPresetIndex > 0}
					onMove={(delta) => void movePreset(selectedPreset.id, delta)}
					onAddModel={() => openAddModel(selectedPreset)}
					onImportModels={() => void importModelsFromApi(selectedPreset)}
					onApply={(modelId) => void onApply(selectedPreset, modelId)}
					onDelete={() => void onDelete(selectedPreset.id)}
					onDeleteModel={(modelId) => void deleteModel(selectedPreset, modelId)}
					onEditModel={(model) => openEditModel(selectedPreset, model)}
					onToggleEnabled={(enabled) => void toggleProvider(selectedPreset, enabled)}
					onToggleModel={(model, enabled) => void toggleModel(selectedPreset, model, enabled)}
					onUpdate={(patch) => void onUpdate(selectedPreset.id, { ...patch, updatedAt: Date.now() })}
					preset={selectedPreset}
				/>
			) : (
				!isCreating && (
					<div className="mt-2 rounded-xl border border-dashed border-(--vscode-widget-border) px-4 py-6 text-center text-[11px] text-description">
						还没有供应商配置，点击「新建供应商」开始
					</div>
				)
			)}
			{importMessage ? (
				<div className="mt-1 text-[10px] text-(--vscode-charts-green)">{importMessage}</div>
			) : null}
			{importError ? <div className="mt-1 text-[10px] text-(--vscode-errorForeground)">{importError}</div> : null}
			{error ? <div className="mt-1 text-[10px] text-(--vscode-errorForeground)">{error}</div> : null}

			{modelDialog ? (
				<ModelConfigDialog
					initial={modelDialog.model}
					isNew={!modelDialog.originalId}
					key={dialogKey}
					onClose={() => setModelDialog(null)}
					onResolveModel={onResolveModel}
					onSave={saveModel}
				/>
			) : null}
		</div>
	)
}

interface ProviderCardProps {
	preset: ProviderPreset
	activePresetId: string | null
	currentModelId: string
	busy: boolean
	importing: boolean
	canMoveUp: boolean
	canMoveDown: boolean
	onMove: (delta: number) => void
	onUpdate: (patch: Partial<ProviderPreset>) => void
	onApply: (modelId?: string) => void
	onDelete: () => void
	onToggleEnabled: (enabled: boolean) => void
	onAddModel: () => void
	onImportModels: () => void
	onEditModel: (model: ProviderPresetModel) => void
	onDeleteModel: (modelId: string) => void
	onToggleModel: (model: ProviderPresetModel, enabled: boolean) => void
}

function ProviderCard({
	preset,
	activePresetId,
	currentModelId,
	busy,
	importing,
	canMoveUp,
	canMoveDown,
	onMove,
	onUpdate,
	onApply,
	onDelete,
	onToggleEnabled,
	onAddModel,
	onImportModels,
	onEditModel,
	onDeleteModel,
	onToggleModel,
}: ProviderCardProps) {
	const [baseUrl, setBaseUrl] = useState(preset.baseUrl)
	const [apiKey, setApiKey] = useState(preset.apiKey)
	const [showKey, setShowKey] = useState(false)
	const [menuOpen, setMenuOpen] = useState(false)
	const [confirmDelete, setConfirmDelete] = useState(false)
	const [renaming, setRenaming] = useState(false)
	const [nameDraft, setNameDraft] = useState(preset.name)
	const nameInputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		setBaseUrl(preset.baseUrl)
		setApiKey(preset.apiKey)
		setNameDraft(preset.name)
	}, [preset.apiKey, preset.baseUrl, preset.id, preset.name])

	useEffect(() => {
		if (renaming) {
			nameInputRef.current?.focus()
		}
	}, [renaming])

	const isActive = preset.id === activePresetId
	const enabledModels = preset.models.filter((model) => model.enabled)

	const commitName = () => {
		setRenaming(false)
		const next = nameDraft.trim()
		if (!next || next === preset.name) {
			setNameDraft(preset.name)
			return
		}
		onUpdate({ name: next })
	}

	return (
		<div className="mt-2 rounded-xl border border-(--vscode-widget-border) bg-(--vscode-editorWidget-background) p-3.5">
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-(--vscode-widget-border)">
						<BoxIcon size={14} />
					</span>
					{renaming ? (
						<input
							className="h-7 min-w-0 flex-1 rounded border border-(--vscode-input-border) bg-(--vscode-input-background) px-2 text-sm text-foreground outline-none"
							onBlur={commitName}
							onChange={(e) => setNameDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									commitName()
								}
								if (e.key === "Escape") {
									setRenaming(false)
									setNameDraft(preset.name)
								}
							}}
							ref={nameInputRef}
							value={nameDraft}
						/>
					) : (
						<span className="truncate text-sm font-semibold text-foreground">{preset.name}</span>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<Switch
						checked={preset.enabled}
						disabled={busy}
						onCheckedChange={(enabled) => onToggleEnabled(enabled)}
						size="lg"
					/>
					<div className="relative">
						{menuOpen && (
							<button
								aria-label="关闭菜单"
								className="fixed inset-0 z-10 cursor-default"
								onClick={() => {
									setMenuOpen(false)
									setConfirmDelete(false)
								}}
								tabIndex={-1}
								type="button"
							/>
						)}
						<button
							aria-label="供应商操作"
							className="relative z-20 rounded p-1 text-description hover:text-foreground"
							onClick={() => setMenuOpen((value) => !value)}
							type="button">
							<MoreHorizontalIcon size={14} />
						</button>
						{menuOpen && (
							<div className="absolute right-0 z-20 mt-1 w-32 rounded-md border border-(--vscode-widget-border) bg-(--vscode-editorWidget-background) p-1 shadow-lg">
								<button
									className="w-full rounded px-2 py-1 text-left text-[11px] hover:bg-(--vscode-list-hoverBackground)"
									onClick={() => {
										setMenuOpen(false)
										setRenaming(true)
									}}
									type="button">
									重命名
								</button>
								<button
									className="w-full rounded px-2 py-1 text-left text-[11px] hover:bg-(--vscode-list-hoverBackground) disabled:opacity-50"
									disabled={!canMoveUp}
									onClick={() => {
										setMenuOpen(false)
										onMove(-1)
									}}
									type="button">
									上移
								</button>
								<button
									className="w-full rounded px-2 py-1 text-left text-[11px] hover:bg-(--vscode-list-hoverBackground) disabled:opacity-50"
									disabled={!canMoveDown}
									onClick={() => {
										setMenuOpen(false)
										onMove(1)
									}}
									type="button">
									下移
								</button>
								{confirmDelete ? (
									<button
										className="w-full rounded px-2 py-1 text-left text-[11px] text-(--vscode-errorForeground) hover:bg-(--vscode-list-hoverBackground)"
										onClick={() => {
											setMenuOpen(false)
											setConfirmDelete(false)
											onDelete()
										}}
										type="button">
										确认删除
									</button>
								) : (
									<button
										className="w-full rounded px-2 py-1 text-left text-[11px] text-(--vscode-errorForeground) hover:bg-(--vscode-list-hoverBackground)"
										onClick={() => setConfirmDelete(true)}
										type="button">
										删除供应商
									</button>
								)}
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="mt-3 grid grid-cols-1 gap-2.5">
				<label className="flex flex-col gap-0.5">
					<span className={labelClass}>Base URL</span>
					<input
						className={inputClass}
						onBlur={() => {
							const next = baseUrl.trim()
							if (next && next !== preset.baseUrl) {
								onUpdate({ baseUrl: next })
							}
						}}
						onChange={(e) => setBaseUrl(e.target.value)}
						value={baseUrl}
					/>
				</label>
				<label className="flex flex-col gap-0.5">
					<span className={labelClass}>API 格式</span>
					<select
						className={selectClass}
						onChange={(e) => onUpdate({ apiFormat: e.target.value as ProviderPresetApiFormat })}
						value={preset.apiFormat}>
						{API_FORMAT_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-0.5">
					<span className={labelClass}>API Key</span>
					<div className="relative">
						<input
							className={inputClass}
							onBlur={() => {
								const next = apiKey.trim()
								if (next !== preset.apiKey) {
									onUpdate({ apiKey: next })
								}
							}}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder={preset.apiKey ? "" : "还没有保存密钥"}
							type={showKey ? "text" : "password"}
							value={apiKey}
						/>
						<button
							aria-label={showKey ? "隐藏密钥" : "显示密钥"}
							className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-description hover:text-foreground"
							onClick={() => setShowKey((value) => !value)}
							type="button">
							{showKey ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
						</button>
					</div>
				</label>
			</div>

			<div className="mt-3.5 flex items-center justify-between gap-2">
				<span className="text-xs font-medium text-foreground">模型列表</span>
				<div className="flex items-center gap-1.5">
					<button
						className="flex items-center gap-1 rounded-md border border-(--vscode-widget-border) px-2 py-1 text-[10px] text-description hover:text-foreground disabled:opacity-50"
						disabled={busy || importing}
						onClick={onImportModels}
						title="从 /models 接口获取并导入模型"
						type="button">
						<RefreshCwIcon className={importing ? "animate-spin" : ""} size={11} />
						{importing ? "导入中…" : "从 API 导入"}
					</button>
					<button
						className="flex items-center gap-1 rounded-md border border-(--vscode-widget-border) px-2 py-1 text-[10px] text-description hover:text-foreground"
						onClick={onAddModel}
						type="button">
						<PlusIcon size={11} />
						添加模型
					</button>
				</div>
			</div>
			<div className="mt-1.5 space-y-1">
				{preset.models.length === 0 ? (
					<div className="rounded-md border border-dashed border-(--vscode-widget-border) px-3 py-3 text-center text-[10px] text-description">
						还没有模型，点击右上角「添加模型」
					</div>
				) : (
					preset.models.map((model) => {
						const isCurrent = isActive && model.id === currentModelId
						const badges = modelBadges(model)
						return (
							<div
								className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 ${
									isCurrent
										? "border-(--vscode-focusBorder) bg-(--vscode-list-activeSelectionBackground)"
										: "border-(--vscode-widget-border)"
								}`}
								key={model.id}>
								<button
									className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
									disabled={!model.enabled}
									onClick={() => onApply(model.id)}
									title={model.enabled ? `切换到 ${model.id}` : "该模型已停用"}
									type="button">
									<span className={`truncate text-xs ${model.enabled ? "text-foreground" : "text-description line-through"}`}>
										{model.id}
									</span>
									{badges.map((badge) => (
										<span
											className="shrink-0 rounded border border-(--vscode-widget-border) px-1 py-px text-[9px] text-description"
											key={badge}>
											{badge}
										</span>
									))}
									{isCurrent ? <CheckIcon className="shrink-0 text-(--vscode-charts-green)" size={11} /> : null}
								</button>
								<button
									aria-label={`编辑 ${model.id}`}
									className="shrink-0 rounded p-0.5 text-description hover:text-foreground"
									onClick={() => onEditModel(model)}
									title="编辑模型配置"
									type="button">
									<PencilIcon size={12} />
								</button>
								<button
									aria-label={`删除 ${model.id}`}
									className="shrink-0 rounded p-0.5 text-description hover:text-(--vscode-errorForeground)"
									onClick={() => onDeleteModel(model.id)}
									title="删除模型"
									type="button">
									<Trash2Icon size={12} />
								</button>
								<Switch
									checked={model.enabled}
									onCheckedChange={(enabled) => onToggleModel(model, enabled)}
									size="lg"
								/>
							</div>
						)
					})
				)}
			</div>
			<div className="mt-2 flex items-center justify-between text-[10px] text-description">
				<span>{apiFormatLabel(preset.apiFormat)}</span>
				<span>
					{enabledModels.length}/{preset.models.length} 个模型启用
					{isActive ? " · 当前供应商" : ""}
				</span>
			</div>
		</div>
	)
}

interface ModelConfigDialogProps {
	initial: ProviderPresetModel
	isNew: boolean
	onClose: () => void
	onResolveModel?: (modelId: string) => Promise<DetectedModelParameters | undefined>
	onSave: (model: ProviderPresetModel) => Promise<void>
}

function ModelConfigDialog({ initial, isNew, onClose, onResolveModel, onSave }: ModelConfigDialogProps) {
	const [open, setOpen] = useState(true)
	const [modelId, setModelId] = useState(initial.id)
	const [smartConfig, setSmartConfig] = useState(true)
	const [contextWindow, setContextWindow] = useState(isNew ? "" : (initial.contextWindow?.toString() ?? ""))
	const [maxTokens, setMaxTokens] = useState(isNew ? "" : (initial.maxTokens?.toString() ?? ""))
	const [inputPrice, setInputPrice] = useState(isNew ? "" : (initial.inputPrice?.toString() ?? ""))
	const [outputPrice, setOutputPrice] = useState(isNew ? "" : (initial.outputPrice?.toString() ?? ""))
	const [temperature, setTemperature] = useState(isNew ? "" : (initial.temperature?.toString() ?? ""))
	const [advancedOpen, setAdvancedOpen] = useState(true)
	const [inputTypes, setInputTypes] = useState(
		isNew ? { text: true, image: false, video: false, pdf: false } : initial.inputTypes,
	)
	const [capabilities, setCapabilities] = useState<string[]>(isNew ? [] : initial.capabilities)
	const initialLevels = isNew ? [] : normalizeReasoningLevels(initial.reasoningLevels)
	const [levels, setLevels] = useState<string[]>(initialLevels.length > 0 ? initialLevels : ["low", "high", "max"])
	const [reasoningMapping, setReasoningMapping] = useState(initial.reasoningMapping)
	const [error, setError] = useState("")
	const [saving, setSaving] = useState(false)
	const [detecting, setDetecting] = useState(false)
	const [detectStatus, setDetectStatus] = useState<"idle" | "found" | "not-found">("idle")
	const [detectSource, setDetectSource] = useState("")
	const [detectNonce, setDetectNonce] = useState(0)

	// A new model must always start blank. This also overwrites values a
	// browser may have restored into the inputs from an earlier dialog.
	useEffect(() => {
		if (!isNew) {
			return
		}
		setModelId("")
		setContextWindow("")
		setMaxTokens("")
		setInputPrice("")
		setOutputPrice("")
		setTemperature("")
		setInputTypes({ text: true, image: false, video: false, pdf: false })
		setCapabilities([])
		setLevels(["low", "high", "max"])
		setReasoningMapping("")
		setError("")
		setDetectStatus("idle")
		setDetectSource("")
	}, [isNew])

	useEffect(() => {
		if (!smartConfig) {
			setDetectStatus("idle")
			setDetectSource("")
			setDetecting(false)
			return
		}
		const id = modelId.trim()
		if (!id) {
			setDetectStatus("idle")
			setDetectSource("")
			setDetecting(false)
			return
		}
		let cancelled = false
		// Fill from the local family table immediately; the catalog lookup then
		// refines these values when it returns. This keeps "Add model" from
		// carrying the previously selected model's limits while a slow network
		// lookup is still in flight.
		const heuristic = inferModelParameters(id)
		if (heuristic) {
			if (heuristic.contextWindow) {
				setContextWindow(String(heuristic.contextWindow))
			}
			if (heuristic.maxTokens) {
				setMaxTokens(String(heuristic.maxTokens))
			}
			const heuristicCapabilities = heuristic.capabilities ?? []
			setInputTypes((current) => ({
				...current,
				image: current.image || Boolean(heuristic.supportsVision) || heuristicCapabilities.includes("images"),
				video: current.video || heuristicCapabilities.includes("video"),
				pdf: current.pdf || heuristicCapabilities.includes("files"),
			}))
			if (heuristicCapabilities.includes("structured_output")) {
				setCapabilities((current) =>
					current.includes("structured_output") ? current : [...current, "structured_output"],
				)
			}
			setDetectStatus("found")
			setDetectSource("本地推断")
		}
		setDetecting(true)
		const timer = setTimeout(async () => {
			try {
				const detected = await onResolveModel?.(id)
				if (cancelled) {
					return
				}
				if (detected) {
					if (detected.contextWindow) {
						setContextWindow(String(detected.contextWindow))
					}
					if (detected.maxTokens) {
						setMaxTokens(String(detected.maxTokens))
					}
					const detectedCapabilities = detected.capabilities ?? []
					setInputTypes((current) => ({
						...current,
						image: current.image || Boolean(detected.supportsVision) || detectedCapabilities.includes("images"),
						video: current.video || detectedCapabilities.includes("video"),
						pdf: current.pdf || detectedCapabilities.includes("files"),
					}))
					if (detectedCapabilities.includes("structured_output")) {
						setCapabilities((current) =>
							current.includes("structured_output") ? current : [...current, "structured_output"],
						)
					}
					setDetectStatus("found")
					setDetectSource(detected.source ? modelDetectionSourceLabel(detected.source) : "模型目录")
				} else {
					setDetectStatus(heuristic ? "found" : "not-found")
					setDetectSource(heuristic ? "本地推断" : "")
				}
			} catch {
				if (!cancelled) {
					setDetectStatus(heuristic ? "found" : "not-found")
					setDetectSource(heuristic ? "本地推断" : "")
				}
			} finally {
				if (!cancelled) {
					setDetecting(false)
				}
			}
		}, 350)
		return () => {
			cancelled = true
			clearTimeout(timer)
		}
	}, [modelId, smartConfig, onResolveModel, detectNonce])

	const reset = () => {
		setModelId(isNew ? "" : initial.id)
		setSmartConfig(true)
		setContextWindow(isNew ? "" : (initial.contextWindow?.toString() ?? ""))
		setMaxTokens(isNew ? "" : (initial.maxTokens?.toString() ?? ""))
		setInputPrice(isNew ? "" : (initial.inputPrice?.toString() ?? ""))
		setOutputPrice(isNew ? "" : (initial.outputPrice?.toString() ?? ""))
		setTemperature(isNew ? "" : (initial.temperature?.toString() ?? ""))
		setInputTypes(isNew ? { text: true, image: false, video: false, pdf: false } : initial.inputTypes)
		setCapabilities(isNew ? [] : initial.capabilities)
		const resetLevels = isNew ? [] : normalizeReasoningLevels(initial.reasoningLevels)
		setLevels(resetLevels.length > 0 ? resetLevels : ["low", "high", "max"])
		setReasoningMapping(initial.reasoningMapping)
		setError("")
		setDetectStatus("idle")
		setDetecting(false)
	}

	const toggleCapability = (value: string) => {
		setCapabilities((current) =>
			current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
		)
	}

	const toggleLevel = (level: string) => {
		setLevels((current) => {
			if (current.includes(level)) {
				return current.filter((item) => item !== level)
			}
			return [...current, level].sort((a, b) => reasoningLevelOrder(a) - reasoningLevelOrder(b))
		})
	}

	const submit = async () => {
		const id = modelId.trim()
		if (!id) {
			setError("请填写模型 ID")
			return
		}
		const parsedInputPrice = parseOptionalNonNegativeNumber(inputPrice)
		const parsedOutputPrice = parseOptionalNonNegativeNumber(outputPrice)
		const parsedTemperature = parseOptionalNonNegativeNumber(temperature)
		if (parsedInputPrice === null || parsedOutputPrice === null || parsedTemperature === null) {
			setError("价格和温度必须是有效的非负数字")
			return
		}
		setError("")
		setSaving(true)
		try {
			await onSave({
				...initial,
				id,
				contextWindow: Number(contextWindow) > 0 ? Math.floor(Number(contextWindow)) : undefined,
				maxTokens: Number(maxTokens) > 0 ? Math.floor(Number(maxTokens)) : undefined,
				inputPrice: parsedInputPrice,
				outputPrice: parsedOutputPrice,
				temperature: parsedTemperature,
				supportsVision: inputTypes.image,
				inputTypes: { ...inputTypes, text: true },
				capabilities,
				reasoningLevels: levels,
				reasoningMapping,
			})
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog
			onOpenChange={(value) => {
				setOpen(value)
				if (!value) {
					onClose()
				}
			}}
			open={open}>
			<DialogContent className="max-h-[85vh] max-w-[540px] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="text-sm">{isNew ? "添加模型" : "编辑模型配置"}</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-2.5">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-xs font-medium text-foreground">智能配置</span>
						<Switch checked={smartConfig} onCheckedChange={setSmartConfig} />
						<span className="text-[10px] text-description">
							{detecting
								? "正在识别模型参数…"
								: detectStatus === "found"
									? detectSource
										? `已自动识别 · 来源：${detectSource}`
										: "已自动识别并填入参数"
									: detectStatus === "not-found"
										? "未找到该模型，请手动填写"
										: ""}
						</span>
						{smartConfig && modelId.trim() ? (
							<button
								className="text-[10px] text-(--vscode-textLink-foreground) hover:underline"
								onClick={() => setDetectNonce((value) => value + 1)}
								type="button">
								重新识别
							</button>
						) : null}
					</div>

					<label className="flex flex-col gap-0.5">
						<span className={labelClass}>模型 ID</span>
						<input
							autoComplete="off"
							className={inputClass}
							name="provider-preset-model-id"
							onChange={(e) => {
								setModelId(e.target.value)
								setError("")
							}}
							placeholder="deepseek-v4.1-flash-1017"
							value={modelId}
						/>
					</label>

					<div className="grid grid-cols-2 gap-2">
						<label className="flex flex-col gap-0.5">
							<span className={labelClass}>上下文窗口</span>
							<input
								autoComplete="off"
								className={inputClass}
								name="provider-preset-context-window"
								onChange={(e) => setContextWindow(e.target.value)}
								placeholder="1000000"
								value={contextWindow}
							/>
						</label>
						<label className="flex flex-col gap-0.5">
							<span className={labelClass}>最大输出 Token</span>
							<input
								autoComplete="off"
								className={inputClass}
								name="provider-preset-max-tokens"
								onChange={(e) => setMaxTokens(e.target.value)}
								placeholder="384000"
								value={maxTokens}
							/>
						</label>
					</div>

					<button
						className="flex items-center gap-1 pt-1 text-xs text-description hover:text-foreground"
						onClick={() => setAdvancedOpen((value) => !value)}
						type="button">
						<ChevronDownIcon className={advancedOpen ? "" : "-rotate-90"} size={12} />
						高级配置
					</button>

					{advancedOpen && (
						<div className="flex flex-col gap-3">
							<div>
								<div className={labelClass}>输入类型</div>
								<div className="mt-1 flex flex-wrap gap-1.5">
									<label className="flex items-center gap-1 rounded border border-(--vscode-widget-border) px-2 py-1 text-[11px] text-description opacity-70">
										<input checked disabled type="checkbox" />
										文本
									</label>
									{(["image", "video", "pdf"] as const).map((type) => (
										<label
											className="flex items-center gap-1 rounded border border-(--vscode-widget-border) px-2 py-1 text-[11px]"
											key={type}>
											<input
												checked={inputTypes[type]}
												onChange={(e) => setInputTypes((current) => ({ ...current, [type]: e.target.checked }))}
												type="checkbox"
											/>
											{type === "image" ? "图片" : type === "video" ? "视频" : "PDF"}
										</label>
									))}
								</div>
							</div>

							<div>
								<div className={labelClass}>模型能力</div>
								<div className="mt-1 flex flex-wrap gap-1.5">
									{[
										{ value: "structured_output", label: "结构化输出" },
									].map((item) => (
										<label
											className="flex items-center gap-1 rounded border border-(--vscode-widget-border) px-2 py-1 text-[11px]"
											key={item.value}>
											<input
												checked={capabilities.includes(item.value)}
												onChange={() => toggleCapability(item.value)}
												type="checkbox"
											/>
											{item.label}
										</label>
									))}
								</div>
							</div>

							<div>
								<div className={labelClass}>推理等级（从低到高）</div>
								<div className="mt-1 flex flex-wrap gap-1.5">
									{REASONING_LEVEL_OPTIONS.map((option) => {
										const active = levels.includes(option.value)
										return (
											<button
												aria-pressed={active}
												className={`min-w-[64px] flex-1 rounded-md border px-3 py-2 text-xs transition-colors ${
													active
														? "border-(--vscode-button-background) bg-(--vscode-button-background) font-medium text-(--vscode-button-foreground)"
														: "border-(--vscode-widget-border) text-description hover:border-(--vscode-focusBorder) hover:text-foreground"
												}`}
												key={option.value}
												onClick={() => toggleLevel(option.value)}
												type="button">
												{option.label}
											</button>
										)
									})}
								</div>
								<div className="mt-1 text-[10px] text-description">
									点一下选中，再点一下取消；保存后聊天里的思考强度只显示选中的等级。
								</div>
							</div>

														<div className="grid grid-cols-3 gap-2">
							<label className="flex flex-col gap-0.5">
							<span className={labelClass}>输入价格 / 1M</span>
							<input
							autoComplete="off"
							className={inputClass}
							min="0"
							name="provider-preset-input-price"
							onChange={(e) => setInputPrice(e.target.value)}
							placeholder="0"
							step="0.01"
							type="number"
							value={inputPrice}
							/>
							</label>
							<label className="flex flex-col gap-0.5">
							<span className={labelClass}>输出价格 / 1M</span>
							<input
							autoComplete="off"
							className={inputClass}
							min="0"
							name="provider-preset-output-price"
							onChange={(e) => setOutputPrice(e.target.value)}
							placeholder="0"
							step="0.01"
							type="number"
							value={outputPrice}
							/>
							</label>
							<label className="flex flex-col gap-0.5">
							<span className={labelClass}>温度</span>
							<input
							autoComplete="off"
							className={inputClass}
							min="0"
							name="provider-preset-temperature"
							onChange={(e) => setTemperature(e.target.value)}
							placeholder="0"
							step="0.1"
							type="number"
							value={temperature}
							/>
							</label>
							</div>
							<div className="text-[10px] text-description">价格按每 1M tokens 计；留空表示不设置。</div>
						</div>
					)}

					{error ? <div className="text-[10px] text-(--vscode-errorForeground)">{error}</div> : null}
				</div>

				<DialogFooter className="mt-2 flex-row items-center justify-between gap-2 sm:justify-between">
					<button
						className="text-[11px] text-description underline hover:text-foreground"
						onClick={reset}
						type="button">
						重置表单
					</button>
					<div className="flex items-center gap-2">
						<button
							className="rounded-md px-3 py-1.5 text-xs text-description hover:text-foreground"
							onClick={() => {
								setOpen(false)
								onClose()
							}}
							type="button">
							取消
						</button>
						<button
							className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background disabled:opacity-50"
							disabled={saving || detecting}
							onClick={() => void submit()}
							type="button">
							保存
						</button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
