import { ApiConfiguration } from "@shared/api"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ExtensionStateContextProvider, useExtensionState } from "@/context/ExtensionStateContext"
import { useProviderListings } from "@/hooks/useProviderListings"
import ApiOptions from "../ApiOptions"

vi.mock("@/hooks/useProviderListings", () => ({
	useProviderListings: vi.fn(() => ({ providers: [], isLoading: false, error: undefined, refresh: vi.fn() })),
}))

vi.mock("../providers/GenericProviderSettings", () => ({
	GenericProviderSettings: vi.fn((props) => <div data-testid="generic-provider-settings">{props.providerName}</div>),
}))

// ClinePassHint pulls in useClinePassPromo (auth context, grpc clients); these
// tests exercise provider forms, so keep the promo surface inert.
vi.mock("@/hooks/useClinePassPromo", () => ({
	CLINE_PASS_PROVIDER_ID: "cline-pass",
	useClinePassPromo: vi.fn(() => ({ isClinePassEnabled: false })),
}))

const mockProviderListings = (
	providers: Array<{ id: string; name: string; protocol: string; allowsCustomModelIds: boolean }>,
) => {
	vi.mocked(useProviderListings).mockReturnValue({ providers, isLoading: false, error: undefined, refresh: vi.fn() })
}

vi.mock("../../../context/ExtensionStateContext", async (importOriginal) => {
	const actual = await importOriginal()
	return {
		...(actual || {}),
		// your mocked methods
		useExtensionState: vi.fn(() => ({
			apiConfiguration: {
				planModeApiProvider: "requesty",
				actModeApiProvider: "requesty",
				requestyApiKey: "",
				planModeRequestyModelId: "",
				actModeRequestyModelId: "",
			},
			setApiConfiguration: vi.fn(),
			requestyModels: {},
			planActSeparateModelsSetting: false,
		})),
	}
})

const mockExtensionState = (apiConfiguration: Partial<ApiConfiguration>, extraState: Record<string, unknown> = {}) => {
	vi.mocked(useExtensionState).mockReturnValue({
		apiConfiguration,
		setApiConfiguration: vi.fn(),
		requestyModels: {},
		planActSeparateModelsSetting: false,
		// Provider model-list context read by useProviderModels. Static-list
		// providers render their model <select> from this map, so seed the
		// providers exercised here with the model id each test expects.
		providerModelsByProvider: {
			fireworks: {
				models: { "accounts/fireworks/models/kimi-k2p5": { supportsPromptCache: false } },
				defaultModelId: "accounts/fireworks/models/kimi-k2p5",
			},
			nebius: {
				models: { "Qwen/Qwen2.5-32B-Instruct-fast": { supportsPromptCache: false } },
				defaultModelId: "Qwen/Qwen2.5-32B-Instruct-fast",
			},
		},
		startProviderModelsRequest: vi.fn(),
		applyProviderModelsResponse: vi.fn(),
		...extraState,
	} as any)
}

describe("ApiOptions Component", () => {
	vi.clearAllMocks()
	const mockPostMessage = vi.fn()

	beforeEach(() => {
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: mockPostMessage }
		vi.mocked(useProviderListings).mockReturnValue({ providers: [], isLoading: false, error: undefined, refresh: vi.fn() })
		mockExtensionState({
			planModeApiProvider: "requesty",
			actModeApiProvider: "requesty",
		})
	})

	it("renders Requesty API Key input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		const apiKeyInput = screen.getByPlaceholderText("输入 API 密钥...")
		expect(apiKeyInput).toBeInTheDocument()
	})

	it("renders Requesty Model ID input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		const modelIdInput = screen.getByPlaceholderText("搜索并选择模型...")
		expect(modelIdInput).toBeInTheDocument()
	})

	it.each([
		["openai-native", "OpenAI API 密钥"],
		["openai-codex", "登录 OpenAI Codex"],
	])("renders only the dedicated form for %s", (provider, dedicatedFormText) => {
		mockExtensionState({
			planModeApiProvider: provider as any,
			actModeApiProvider: provider as any,
		})

		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={false} />
			</ExtensionStateContextProvider>,
		)

		expect(screen.getByText(dedicatedFormText)).toBeInTheDocument()
		expect(screen.queryByText("自定义请求头")).not.toBeInTheDocument()
	})

	it("renders the OpenAI-compatible form for custom/unknown catalog providers", () => {
		vi.mocked(useProviderListings).mockReturnValue({
			providers: [
				{
					allowsCustomModelIds: true,
					id: "future-simple-provider",
					name: "Future Simple Provider",
					protocol: "openai-chat",
				},
			],
			isLoading: false,
			error: undefined,
			refresh: vi.fn(),
		})
		mockExtensionState({
			planModeApiProvider: "future-simple-provider" as any,
			actModeApiProvider: "future-simple-provider" as any,
		})

		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)

		// Custom/unknown providers use the richer OpenAI-compatible form (Base
		// URL, Custom Headers, Model Configuration, Reasoning Effort) rather than
		// the simpler generic settings form.
		expect(screen.getByText("自定义请求头")).toBeInTheDocument()
		expect(screen.queryByTestId("generic-provider-settings")).not.toBeInTheDocument()
	})
})

describe("ApiOptions Component", () => {
	vi.clearAllMocks()
	const mockPostMessage = vi.fn()

	beforeEach(() => {
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: mockPostMessage }
		mockExtensionState({
			planModeApiProvider: "together",
			actModeApiProvider: "together",
		})
	})

	it("renders Together generic provider settings", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)

		expect(screen.getByTestId("generic-provider-settings")).toHaveTextContent("Together")
	})
})

describe("ApiOptions Component", () => {
	vi.clearAllMocks()
	const mockPostMessage = vi.fn()

	beforeEach(() => {
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: mockPostMessage }

		mockProviderListings([{ id: "fireworks", name: "Fireworks", protocol: "openai-chat", allowsCustomModelIds: false }])
		mockExtensionState({
			planModeApiProvider: "fireworks",
			actModeApiProvider: "fireworks",
			fireworksApiKey: "",
			planModeFireworksModelId: "",
			actModeFireworksModelId: "",
			fireworksModelMaxCompletionTokens: 2000,
			fireworksModelMaxTokens: 4000,
		})
	})

	it("renders Fireworks generic provider settings", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		expect(screen.getByTestId("generic-provider-settings")).toHaveTextContent("Fireworks")
	})
})

describe("OpenApiInfoOptions", () => {
	const mockPostMessage = vi.fn()

	// Per-model configuration (context window, max output tokens, image input)
	// now lives in the provider preset card's "添加模型" dialog rather than a
	// collapsible section in the OpenAI-compatible form, so seed one preset and
	// open that dialog before asserting the model config fields.
	const openModelConfigDialog = () => {
		fireEvent.click(screen.getByRole("button", { name: "添加模型" }))
	}

	beforeEach(() => {
		vi.clearAllMocks()
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: mockPostMessage }
		mockExtensionState(
			{
				planModeApiProvider: "openai",
				actModeApiProvider: "openai",
			},
			{
				providerPresets: JSON.stringify([
					{
						id: "preset-openai",
						name: "OpenAI 预设",
						baseUrl: "https://api.openai.com/v1",
						models: ["gpt-4o"],
					},
				]),
			},
		)
	})

	it("renders OpenAI Supports Images input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		openModelConfigDialog()
		const supportsImagesInput = screen.getByLabelText("图片")
		expect(supportsImagesInput).toBeInTheDocument()
		expect(supportsImagesInput).toHaveAttribute("type", "checkbox")
	})

	it("renders OpenAI Context Window Size input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		openModelConfigDialog()
		const contextWindowInput = screen.getByLabelText("上下文窗口")
		expect(contextWindowInput).toBeInTheDocument()
	})

	it("renders OpenAI Max Output Tokens input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		openModelConfigDialog()
		const maxTokensInput = screen.getByLabelText("最大输出 Token")
		expect(maxTokensInput).toBeInTheDocument()
	})
})

describe("ApiOptions Component", () => {
	vi.clearAllMocks()
	const mockPostMessage = vi.fn()

	beforeEach(() => {
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: mockPostMessage }

		mockProviderListings([{ id: "nebius", name: "Nebius", protocol: "openai-chat", allowsCustomModelIds: false }])
		mockExtensionState({
			planModeApiProvider: "nebius",
			actModeApiProvider: "nebius",
			nebiusApiKey: "",
		})
	})

	it("renders Nebius generic provider settings", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		expect(screen.getByTestId("generic-provider-settings")).toHaveTextContent("Nebius")
	})
})
