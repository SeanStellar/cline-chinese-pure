import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { inferModelParameters, type ProviderPreset } from "./providerPresets"
import { ProviderPresetManager } from "./ProviderPresetManager"

vi.mock("@/services/grpc-client", () => ({
	ModelsServiceClient: { refreshOpenAiModels: vi.fn() },
}))

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false
	Element.prototype.releasePointerCapture ??= () => {}
	Element.prototype.scrollIntoView ??= () => {}
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
})

const preset: ProviderPreset = {
	id: "p1",
	name: "测试供应商",
	baseUrl: "https://example.com/v1",
	apiKey: "sk-test",
	apiFormat: "default",
	enabled: true,
	models: [],
	createdAt: 1,
	updatedAt: 1,
}

function renderManager() {
	const onUpdate = vi.fn(async () => undefined)
	const onSaveModel = vi.fn(async () => undefined)
	render(
		<ProviderPresetManager
			activePresetId="p1"
			busy={false}
			error=""
			onApply={vi.fn(async () => undefined)}
			onCreate={vi.fn(async () => "p1")}
			onDelete={vi.fn(async () => undefined)}
			onReplaceAll={vi.fn(async () => undefined)}
			onResolveModel={async (modelId) => inferModelParameters(modelId)}
			onSaveModel={onSaveModel}
			onUpdate={onUpdate}
			presets={[preset]}
		/>,
	)
	return { onSaveModel, onUpdate }
}

describe("ProviderPresetManager model dialog", () => {
	it("starts blank, auto-fills a model, saves prices and reasoning levels", async () => {
		const { onSaveModel, onUpdate } = renderManager()

		fireEvent.click(screen.getByRole("button", { name: /添加模型/ }))

		const modelIdInput = screen.getByPlaceholderText("deepseek-v4.1-flash-1017")
		expect(modelIdInput).toHaveValue("")
		expect(screen.getByPlaceholderText("1000000")).toHaveValue("")
		expect(screen.getByPlaceholderText("384000")).toHaveValue("")

		fireEvent.change(modelIdInput, { target: { value: "claude-sonnet-4-6" } })

		await waitFor(() => {
			expect(screen.getByPlaceholderText("1000000")).toHaveValue("200000")
		})
		expect(screen.getByPlaceholderText("384000")).toHaveValue("64000")
		expect(screen.getByRole("checkbox", { name: /图片/ })).toBeChecked()
		expect(await screen.findByText(/来源：本地推断/)).toBeInTheDocument()

		const highButton = screen.getByRole("button", { name: "高" })
		const mediumButton = screen.getByRole("button", { name: "中" })
		expect(highButton).toHaveAttribute("aria-pressed", "true")
		fireEvent.click(highButton)
		fireEvent.click(mediumButton)
		expect(highButton).toHaveAttribute("aria-pressed", "false")
		expect(mediumButton).toHaveAttribute("aria-pressed", "true")

		fireEvent.change(document.querySelector('input[name="provider-preset-input-price"]') as HTMLInputElement, {
			target: { value: "1.5" },
		})
		fireEvent.change(document.querySelector('input[name="provider-preset-output-price"]') as HTMLInputElement, {
			target: { value: "2.5" },
		})
		fireEvent.change(document.querySelector('input[name="provider-preset-temperature"]') as HTMLInputElement, {
			target: { value: "0.3" },
		})

		const save = screen.getByRole("button", { name: "保存" })
		await waitFor(() => expect(save).not.toBeDisabled())
		fireEvent.click(save)

		await waitFor(() => {
			expect(onUpdate).toHaveBeenCalledWith(
				"p1",
				expect.objectContaining({
					models: expect.arrayContaining([
						expect.objectContaining({
							id: "claude-sonnet-4-6",
							contextWindow: 200_000,
							maxTokens: 64_000,
							inputPrice: 1.5,
							outputPrice: 2.5,
							temperature: 0.3,
							reasoningLevels: ["low", "medium", "max"],
						}),
					]),
				}),
			)
		})
		expect(onSaveModel).toHaveBeenCalledWith(
			expect.objectContaining({ id: "p1" }),
			expect.objectContaining({ id: "claude-sonnet-4-6", contextWindow: 200_000 }),
			undefined,
		)
	})
})