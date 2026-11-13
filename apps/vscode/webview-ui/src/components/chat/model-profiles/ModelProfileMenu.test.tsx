import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ModelProfileMenu from "./ModelProfileMenu"

const applyPreset = vi.hoisted(() => vi.fn(async () => undefined))
const navigateToSettingsModelPicker = vi.hoisted(() => vi.fn())

const presets = [
	{
		id: "p1",
		name: "百度千帆",
		baseUrl: "https://qianfan.example/v1",
		apiKey: "sk-test",
		apiFormat: "default",
		enabled: true,
		models: [
			{
				id: "deepseek-v4.1-flash-1017",
				enabled: true,
				contextWindow: 1_000_000,
				maxTokens: 384_000,
				supportsVision: true,
				inputTypes: { text: true, image: true, video: false, pdf: false },
				capabilities: ["structured_output"],
				reasoningLevels: ["low", "high", "max"],
				reasoningMapping: "",
			},
		],
		createdAt: 1,
		updatedAt: 1,
	},
	{
		id: "p2",
		name: "自测临时",
		baseUrl: "https://example.com/v1",
		apiKey: "sk-test-2",
		apiFormat: "default",
		enabled: true,
		models: [
			{
				id: "m2",
				enabled: true,
				inputTypes: { text: true, image: false, video: false, pdf: false },
				capabilities: [],
				reasoningLevels: [],
				reasoningMapping: "",
			},
		],
		createdAt: 1,
		updatedAt: 1,
	},
]

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		apiConfiguration: { actModeApiProvider: "openai" },
		navigateToSettingsModelPicker,
		providerPresets: JSON.stringify(presets),
	}),
}))

vi.mock("@/components/settings/utils/useApiConfigurationHandlers", () => ({
	useApiConfigurationHandlers: () => ({
		handleModeFieldChange: vi.fn(),
		handleModeFieldsChange: vi.fn(),
	}),
}))

vi.mock("@/components/settings/providers/providerPresetActions", () => ({
	ACTIVE_PROVIDER_PRESET_KEY: "test-active-preset",
	applyProviderPreset: applyPreset,
}))

describe("ModelProfileMenu", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => (key === "test-active-preset" ? "p1" : null),
				removeItem: vi.fn(),
				setItem: vi.fn(),
			},
		})
	})

	it("lists providers, filters models, filters reasoning levels, and applies a model", async () => {
		const anchor = document.createElement("div")
		anchor.getBoundingClientRect = () =>
			({ left: 10, top: 700, right: 200, bottom: 720, width: 190, height: 20, x: 10, y: 700 }) as DOMRect
		const anchorRef = { current: anchor }
		const onClose = vi.fn()

		render(
			<ModelProfileMenu
				anchorRef={anchorRef}
				currentMode="act"
				displayName="deepseek-v4.1-flash-1017"
				modelId="deepseek-v4.1-flash-1017"
				onClose={onClose}
				reasoningEffort="max"
				supportsReasoning={true}
			/>,
		)

		expect(await screen.findByRole("button", { name: /百度千帆/ })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: /自测临时/ })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: /deepseek-v4\.1-flash-1017/ })).toBeInTheDocument()

		const slider = screen.getByRole("slider", { name: "思考强度" })
		expect(slider).toHaveAttribute("max", "2")
		expect(screen.getByText("低")).toBeInTheDocument()
		expect(screen.getByText("高")).toBeInTheDocument()
		expect(screen.getAllByText("最大").length).toBeGreaterThan(0)
		expect(screen.queryByText("最小")).not.toBeInTheDocument()
		expect(screen.queryByText("中")).not.toBeInTheDocument()
		expect(screen.queryByText("极高")).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: /自测临时/ }))
		expect(await screen.findByRole("button", { name: /^m2$/ })).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: /deepseek/ })).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: /^m2$/ }))
		await waitFor(() => {
			expect(applyPreset).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }), "act", "m2")
		})
		expect(onClose).toHaveBeenCalled()
	})

	it("fires a firework burst when the slider reaches max", async () => {
		const anchor = document.createElement("div")
		anchor.getBoundingClientRect = () =>
			({ left: 10, top: 700, right: 200, bottom: 720, width: 190, height: 20, x: 10, y: 700 }) as DOMRect
		const anchorRef = { current: anchor }

		render(
			<ModelProfileMenu
				anchorRef={anchorRef}
				currentMode="act"
				displayName="deepseek-v4.1-flash-1017"
				modelId="deepseek-v4.1-flash-1017"
				onClose={vi.fn()}
				reasoningEffort="high"
				supportsReasoning={true}
			/>,
		)

		expect(document.querySelector(".cline-effort-burst")).toBeNull()
		const slider = await screen.findByRole("slider", { name: "思考强度" })
		fireEvent.change(slider, { target: { value: "2" } })
		await waitFor(() => expect(document.querySelector(".cline-effort-burst")).not.toBeNull())
	})
})