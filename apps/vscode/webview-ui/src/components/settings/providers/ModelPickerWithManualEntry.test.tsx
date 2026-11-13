import { fireEvent, render, screen } from "@testing-library/react"
import type { ChangeEventHandler, FormEventHandler, KeyboardEventHandler, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { type ModelPickerSelection, ModelPickerWithManualEntry } from "./ModelPickerWithManualEntry"

// Render the toolkit web components as native elements so value/change
// behavior is observable in jsdom.
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeDropdown: ({
		children,
		id,
		onChange,
		value,
		"aria-label": ariaLabel,
	}: {
		children?: ReactNode
		id?: string
		onChange?: ChangeEventHandler<HTMLSelectElement>
		value?: string
		"aria-label"?: string
	}) => (
		<select aria-label={ariaLabel} id={id} onChange={onChange} value={value}>
			{children}
		</select>
	),
	VSCodeOption: ({ children, value }: { children?: ReactNode; value?: string }) => <option value={value}>{children}</option>,
	VSCodeTextField: ({
		children,
		id,
		onInput,
		onKeyDown,
		placeholder,
		value,
	}: {
		children?: ReactNode
		id?: string
		onInput?: FormEventHandler<HTMLInputElement>
		onKeyDown?: KeyboardEventHandler<HTMLInputElement>
		placeholder?: string
		value?: string
	}) => (
		<div>
			<label htmlFor={id}>{children}</label>
			<input id={id} onChange={onInput} onKeyDown={onKeyDown} placeholder={placeholder} value={value} />
		</div>
	),
	VSCodeButton: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
		<button onClick={onClick} type="button">
			{children}
		</button>
	),
}))

const selectedModel: ModelPickerSelection = {
	providerId: "ollama",
	modelId: "llama3",
	modelInfo: { name: "Llama 3", supportsPromptCache: false, contextWindow: 8192 },
}

const models = {
	llama3: { name: "Llama 3", supportsPromptCache: false, contextWindow: 8192 },
	mistral: { name: "Mistral", supportsPromptCache: false, contextWindow: 32768 },
}

describe("ModelPickerWithManualEntry", () => {
	it("selects a known model as a full selection triple", () => {
		const onSelect = vi.fn()
		render(
			<ModelPickerWithManualEntry
				allowsCustomIds={false}
				error={undefined}
				isLoading={false}
				isStale={false}
				models={models}
				onSelect={onSelect}
				selectedModel={selectedModel}
			/>,
		)

		fireEvent.change(screen.getByLabelText("模型"), { target: { value: "mistral" } })

		expect(onSelect).toHaveBeenCalledWith({ providerId: "ollama", modelId: "mistral", modelInfo: models.mistral })
	})

	it("shows manual entry during loading when custom ids are allowed", () => {
		render(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={true}
				isStale={false}
				models={{}}
				onSelect={vi.fn()}
				selectedModel={selectedModel}
			/>,
		)

		expect(screen.getByText("正在加载模型…")).toBeInTheDocument()
		expect(screen.getByLabelText("自定义模型 ID")).toBeInTheDocument()
	})

	it("shows manual entry during error when custom ids are allowed", () => {
		render(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error="Could not fetch models"
				isLoading={false}
				isStale={false}
				models={{}}
				onSelect={vi.fn()}
				selectedModel={selectedModel}
			/>,
		)

		expect(screen.getByRole("alert")).toHaveTextContent("Could not fetch models")
		expect(screen.getByLabelText("自定义模型 ID")).toBeInTheDocument()
	})

	it("commits custom model ids with safe default model info", () => {
		const onSelect = vi.fn()
		render(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={false}
				isStale={false}
				models={{}}
				onSelect={onSelect}
				selectedModel={selectedModel}
			/>,
		)

		fireEvent.change(screen.getByLabelText("自定义模型 ID"), { target: { value: "my-custom:latest" } })
		fireEvent.click(screen.getByText("使用自定义模型"))

		expect(onSelect).toHaveBeenCalledWith(
			expect.objectContaining({
				providerId: "ollama",
				modelId: "my-custom:latest",
				modelInfo: expect.objectContaining({ name: "my-custom:latest", supportsPromptCache: false }),
			}),
		)
	})

	it("reveals manual entry from the custom option when models are present", () => {
		render(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={false}
				isStale={false}
				models={models}
				onSelect={vi.fn()}
				selectedModel={selectedModel}
			/>,
		)

		expect(screen.queryByLabelText("自定义模型 ID")).not.toBeInTheDocument()
		fireEvent.change(screen.getByLabelText("模型"), { target: { value: "__custom__" } })
		expect(screen.getByLabelText("自定义模型 ID")).toBeInTheDocument()
	})

	it("shows stale and not-in-current-list indicators without replacing selection", () => {
		const onSelect = vi.fn()
		render(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={false}
				isStale={true}
				models={models}
				onSelect={onSelect}
				selectedModel={{ ...selectedModel, modelId: "custom-outside-list" }}
			/>,
		)

		// The stale notice and the not-in-list notice are separate status
		// regions; the model id is interpolated so match on the region text.
		const statusMessages = screen.getAllByRole("status").map((node) => node.textContent)
		expect(statusMessages).toContain("当前提供商配置下的模型列表可能已过期。")
		expect(statusMessages).toContain("所选模型“custom-outside-list”不在当前列表中。")
		expect(onSelect).not.toHaveBeenCalled()
	})

	it("shows not-in-current-list indicator even when custom ids are not allowed", () => {
		const onSelect = vi.fn()
		render(
			<ModelPickerWithManualEntry
				allowsCustomIds={false}
				error={undefined}
				isLoading={false}
				isStale={false}
				models={models}
				onSelect={onSelect}
				selectedModel={{ ...selectedModel, modelId: "retired-static-model" }}
			/>,
		)

		expect(screen.getByRole("status")).toHaveTextContent("所选模型“retired-static-model”不在当前列表中。")
		expect(screen.queryByLabelText("自定义模型 ID")).not.toBeInTheDocument()
		expect(onSelect).not.toHaveBeenCalled()
	})

	it("prefills the custom field when the committed selection hydrates after mount", () => {
		const { rerender } = render(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={true}
				isStale={false}
				models={{}}
				onSelect={vi.fn()}
				selectedModel={{ ...selectedModel, modelId: "" }}
			/>,
		)

		expect(screen.getByLabelText("自定义模型 ID")).toHaveValue("")

		rerender(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={false}
				isStale={false}
				models={models}
				onSelect={vi.fn()}
				selectedModel={{ ...selectedModel, modelId: "my-fast-model" }}
			/>,
		)

		expect(screen.getByLabelText("自定义模型 ID")).toHaveValue("my-fast-model")
	})

	it("clears the custom field when the hydrated selection is in the catalog", () => {
		const { rerender } = render(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={true}
				isStale={false}
				models={{}}
				onSelect={vi.fn()}
				selectedModel={{ ...selectedModel, modelId: "llama3" }}
			/>,
		)

		// Lazy init captured "llama3" while the catalog was empty.
		expect(screen.getByLabelText("自定义模型 ID")).toHaveValue("llama3")

		rerender(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={false}
				isStale={false}
				models={models}
				onSelect={vi.fn()}
				selectedModel={{ ...selectedModel, modelId: "llama3" }}
			/>,
		)

		fireEvent.change(screen.getByLabelText("模型"), { target: { value: "__custom__" } })
		expect(screen.getByLabelText("自定义模型 ID")).toHaveValue("")
	})

	it("does not reset the custom field while the user is typing", () => {
		const { rerender } = render(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={false}
				isStale={false}
				models={{}}
				onSelect={vi.fn()}
				selectedModel={{ ...selectedModel, modelId: "my-fast-model" }}
			/>,
		)

		fireEvent.change(screen.getByLabelText("自定义模型 ID"), { target: { value: "my-fast" } })

		// A re-render with a fresh models object identity (catalog still
		// loading) must not clobber the in-progress input.
		rerender(
			<ModelPickerWithManualEntry
				allowsCustomIds={true}
				error={undefined}
				isLoading={false}
				isStale={false}
				models={{}}
				onSelect={vi.fn()}
				selectedModel={{ ...selectedModel, modelId: "my-fast-model" }}
			/>,
		)

		expect(screen.getByLabelText("自定义模型 ID")).toHaveValue("my-fast")
	})

	it("does not auto-select while model props change during refresh", () => {
		const onSelect = vi.fn()
		const { rerender } = render(
			<ModelPickerWithManualEntry
				allowsCustomIds={false}
				error={undefined}
				isLoading={true}
				isStale={false}
				models={{}}
				onSelect={onSelect}
				selectedModel={{ ...selectedModel, modelId: "llama3" }}
			/>,
		)

		rerender(
			<ModelPickerWithManualEntry
				allowsCustomIds={false}
				error={undefined}
				isLoading={false}
				isStale={false}
				models={models}
				onSelect={onSelect}
				selectedModel={{ ...selectedModel, modelId: "llama3" }}
			/>,
		)

		expect(onSelect).not.toHaveBeenCalled()
	})
})
