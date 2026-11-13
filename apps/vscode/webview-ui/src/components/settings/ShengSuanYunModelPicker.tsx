import { type ModelInfo, shengSuanYunDefaultModelId, shengSuanYunDefaultModelInfo } from "@shared/api"
import { EmptyRequest } from "@shared/proto/cline/common"
import { Mode } from "@shared/storage/types"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import React, { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import { useMount } from "react-use"
import styled from "styled-components"
import { useDynamicProviderSelection } from "@/hooks/useDynamicProviderSelection"
import { ModelsServiceClient } from "@/services/grpc-client"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { ModelInfoView } from "./common/ModelInfoView"
import { getModeSpecificFields } from "./utils/providerUtils"
import { useApiConfigurationHandlers } from "./utils/useApiConfigurationHandlers"

export interface ShengSuanYunModelPickerProps {
	isPopup?: boolean
	currentMode: Mode
	initialModelTab?: "recommended" | "free"
	models?: Record<string, ModelInfo>
	modelId?: string
	onModelChange?: (modelId: string) => void
	label?: string
	inputId?: string
}
// Star icon for favorites
const StarIcon = ({ isFavorite, onClick }: { isFavorite: boolean; onClick: (e: React.MouseEvent) => void }) => {
	return (
		<div
			onClick={onClick}
			style={{
				cursor: "pointer",
				color: isFavorite ? "var(--vscode-terminal-ansiBlue)" : "var(--vscode-descriptionForeground)",
				marginLeft: "8px",
				fontSize: "16px",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				userSelect: "none",
				WebkitUserSelect: "none",
			}}>
			{isFavorite ? "★" : "☆"}
		</div>
	)
}

const ShengSuanYunModelPicker: React.FC<ShengSuanYunModelPickerProps> = ({
	isPopup,
	currentMode,
	initialModelTab,
	models,
	modelId,
	onModelChange,
	label = "模型",
	inputId = "model-search",
}) => {
	const { apiConfiguration, shengSuanYunModels, setShengSuanYunModels } = useExtensionState()
	const { handleModeFieldsChange } = useApiConfigurationHandlers()
	const modeFields = getModeSpecificFields(apiConfiguration, currentMode)
	const fallbackModelId = models
		? modelId && models[modelId]
			? modelId
			: Object.keys(models)[0]
		: modeFields.shengSuanYunModelId || shengSuanYunDefaultModelId
	const [searchTerm, setSearchTerm] = useState(fallbackModelId)
	const [isDropdownVisible, setIsDropdownVisible] = useState(false)
	const [selectedIndex, setSelectedIndex] = useState(-1)
	const dropdownRef = useRef<HTMLDivElement>(null)
	const itemRefs = useRef<(HTMLDivElement | null)[]>([])
	const dropdownListRef = useRef<HTMLDivElement>(null)

	const { selectedModelId: providerModelId, selectedModelInfo: providerModelInfo } = useDynamicProviderSelection(
		"shengsuanyun",
		apiConfiguration,
		currentMode,
	)
	const selectedModelId = models ? fallbackModelId : providerModelId
	const selectedModelInfo = models ? models[selectedModelId] : providerModelInfo

	const handleModelChange = (newModelId: string) => {
		if (models) {
			onModelChange?.(newModelId)
			setSearchTerm(newModelId)
			return
		}
		// could be setting invalid model id/undefined info but validation will catch it
		handleModeFieldsChange(
			{
				shengSuanYunModelId: { plan: "planModeShengSuanYunModelId", act: "actModeShengSuanYunModelId" },
				shengSuanYunModelInfo: { plan: "planModeShengSuanYunModelInfo", act: "actModeShengSuanYunModelInfo" },
			},
			{
				shengSuanYunModelId: newModelId,
				shengSuanYunModelInfo: shengSuanYunModels[newModelId],
			},
			currentMode,
		)
		setSearchTerm(newModelId)
	}

	const handleSearchInput = (value: string) => {
		setSearchTerm(value)
		setIsDropdownVisible(true)
		if (!models) {
			handleModelChange(value.toLowerCase())
		}
	}

	useEffect(() => {
		if (models) {
			setSearchTerm(fallbackModelId)
		}
	}, [models, fallbackModelId])

	useMount(() => {
		if (models) {
			return
		}
		ModelsServiceClient.refreshShengSuanYunModels(EmptyRequest.create({}))
			.then((res) => {
				console.log("refreshShengSuanYunModels():", res.models)
				setShengSuanYunModels({
					[shengSuanYunDefaultModelId]: shengSuanYunDefaultModelInfo,
					...res.models,
				})
			})
			.catch((error: Error) => console.error("Failed to refresh ShengSuanYun models:", error))
	})

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsDropdownVisible(false)
			}
		}

		document.addEventListener("mousedown", handleClickOutside)
		return () => {
			document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [])

	const modelIds = useMemo(() => {
		return Object.keys(models ?? shengSuanYunModels).sort((a, b) => a.localeCompare(b))
	}, [models, shengSuanYunModels])

	const searchableItems = useMemo(() => {
		return modelIds.map((id) => ({ id, html: id }))
	}, [modelIds])

	const modelSearchResults = useMemo(() => {
		const term = models && searchTerm === fallbackModelId ? "" : searchTerm
		if (!term) {
			return searchableItems
		}
		const lowerSearchTerm = term.toLowerCase()
		return searchableItems
			.filter((item) => item.id.toLowerCase().includes(lowerSearchTerm))
			.map((item) => {
				const escapedSearchTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
				const regex = new RegExp(`(${escapedSearchTerm})`, "gi")
				const highlightedHtml = item.id.replace(regex, '<span class="model-item-highlight">$1</span>')
				return {
					id: item.id,
					html: highlightedHtml,
				}
			})
	}, [models, fallbackModelId, searchableItems, searchTerm])

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (!isDropdownVisible) {
			return
		}

		switch (event.key) {
			case "ArrowDown":
				event.preventDefault()
				setSelectedIndex((prev) => (prev < modelSearchResults.length - 1 ? prev + 1 : prev))
				break
			case "ArrowUp":
				event.preventDefault()
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
				break
			case "Enter":
				event.preventDefault()
				if (selectedIndex >= 0 && selectedIndex < modelSearchResults.length) {
					handleModelChange(modelSearchResults[selectedIndex].id)
					setIsDropdownVisible(false)
				}
				break
			case "Escape":
				setIsDropdownVisible(false)
				setSelectedIndex(-1)
				break
		}
	}

	const hasInfo = useMemo(() => {
		if (models) {
			return !!models[selectedModelId]
		}
		try {
			return modelIds.some((id) => id.toLowerCase() === searchTerm.toLowerCase())
		} catch {
			return false
		}
	}, [models, selectedModelId, modelIds, searchTerm])

	useEffect(() => {
		setSelectedIndex(-1)
		if (dropdownListRef.current) {
			dropdownListRef.current.scrollTop = 0
		}
	}, [searchTerm])

	useEffect(() => {
		if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
			itemRefs.current[selectedIndex]?.scrollIntoView({
				block: "nearest",
				behavior: "smooth",
			})
		}
	}, [selectedIndex])

	return (
		<div style={{ width: "100%" }}>
			<style>
				{`
				.model-item-highlight {
					background-color: var(--vscode-editor-findMatchHighlightBackground);
					color: inherit;
				}
				`}
			</style>
			<div style={{ display: "flex", flexDirection: "column" }}>
				<label htmlFor={inputId}>
					<span style={{ fontWeight: 500 }}>{label}</span>
				</label>
				<DropdownWrapper ref={dropdownRef}>
					<VSCodeTextField
						id={inputId}
						onBlur={() => {
							if (models && !models[searchTerm]) {
								setSearchTerm(fallbackModelId)
							}
						}}
						onFocus={() => setIsDropdownVisible(true)}
						onInput={(e) => handleSearchInput((e.target as HTMLInputElement)?.value ?? "")}
						onKeyDown={handleKeyDown}
						placeholder="搜索模型..."
						style={{
							width: "100%",
							zIndex: REQUESTY_MODEL_PICKER_Z_INDEX,
							position: "relative",
						}}
						value={searchTerm}>
						{searchTerm && (
							<div
								aria-label="清除"
								className="input-icon-button codicon codicon-close"
								onClick={() => handleSearchInput("")}
								slot="end"
								style={{
									display: "flex",
									justifyContent: "center",
									alignItems: "center",
									height: "100%",
								}}
							/>
						)}
					</VSCodeTextField>
					{isDropdownVisible && (
						<DropdownList ref={dropdownListRef}>
							{modelSearchResults.map((item, index) => {
								return (
									<DropdownItem
										isSelected={index === selectedIndex}
										key={item.id}
										onClick={() => {
											handleModelChange(item.id)
											setIsDropdownVisible(false)
										}}
										onMouseEnter={() => setSelectedIndex(index)}
										ref={(el) => (itemRefs.current[index] = el)}>
										<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
											<span dangerouslySetInnerHTML={{ __html: item.html }} />
										</div>
									</DropdownItem>
								)
							})}
						</DropdownList>
					)}
				</DropdownWrapper>
			</div>

			{hasInfo ? (
				<ModelInfoView
					isPopup={isPopup}
					modelInfo={selectedModelInfo}
					provider="shengsuanyun"
					selectedModelId={selectedModelId}
				/>
			) : (
				<p
					style={{
						fontSize: "12px",
						marginTop: 0,
						color: "var(--vscode-descriptionForeground)",
					}}>
					模型列表会自动从服务端刷新，也可以直接输入模型 ID。
				</p>
			)}
		</div>
	)
}

export default ShengSuanYunModelPicker

// Dropdown

const DropdownWrapper = styled.div`
	position: relative;
	width: 100%;
`

export const REQUESTY_MODEL_PICKER_Z_INDEX = 1_000

const DropdownList = styled.div`
	position: absolute;
	top: calc(100% - 3px);
	left: 0;
	width: calc(100% - 2px);
	max-height: 200px;
	overflow-y: auto;
	background-color: var(--vscode-dropdown-background);
	border: 1px solid var(--vscode-list-activeSelectionBackground);
	z-index: ${REQUESTY_MODEL_PICKER_Z_INDEX - 1};
	border-bottom-left-radius: 3px;
	border-bottom-right-radius: 3px;
`

const DropdownItem = styled.div<{ isSelected: boolean }>`
	padding: 5px 10px;
	cursor: pointer;
	word-break: break-all;
	white-space: normal;

	background-color: ${({ isSelected }) => (isSelected ? "var(--vscode-list-activeSelectionBackground)" : "inherit")};

	&:hover {
		background-color: var(--vscode-list-activeSelectionBackground);
	}
`

// Markdown

const _StyledMarkdown = styled.div`
	font-family:
		var(--vscode-font-family),
		system-ui,
		-apple-system,
		BlinkMacSystemFont,
		"Segoe UI",
		Roboto,
		Oxygen,
		Ubuntu,
		Cantarell,
		"Open Sans",
		"Helvetica Neue",
		sans-serif;
	font-size: 12px;
	color: var(--vscode-descriptionForeground);

	p,
	li,
	ol,
	ul {
		line-height: 1.25;
		margin: 0;
	}

	ol,
	ul {
		padding-left: 1.5em;
		margin-left: 0;
	}

	p {
		white-space: pre-wrap;
	}

	a {
		text-decoration: none;
	}
	a {
		&:hover {
			text-decoration: underline;
		}
	}
`
