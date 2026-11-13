import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ReasoningEffortSelector from "./ReasoningEffortSelector"
import type { ReasoningEffortSelection } from "./utils/reasoningEffort"

const mockExtensionState = vi.hoisted(() => ({
	state: { apiConfiguration: {} as Record<string, unknown>, planActSeparateModelsSetting: false },
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => mockExtensionState.state,
}))

vi.mock("@/services/grpc-client", () => ({
	ModelsServiceClient: { updateApiConfigurationProto: vi.fn(async () => undefined) },
}))

beforeEach(() => {
	mockExtensionState.state = { apiConfiguration: {}, planActSeparateModelsSetting: false }
})

function shownEffort(): string {
	return screen.getByTestId("reasoning-effort-value").textContent ?? ""
}

async function pick(user: ReturnType<typeof userEvent.setup>, label: string) {
	await user.click(screen.getByRole("button", { name: label }))
}

/** A provider settings component in miniature: the saved value round-trips through onEffortChange. */
function SavedEffortHarness({
	initial,
	onSave,
}: {
	initial: ReasoningEffortSelection
	onSave: (effort: ReasoningEffortSelection) => void
}) {
	const [saved, setSaved] = useState<ReasoningEffortSelection>(initial)
	return (
		<ReasoningEffortSelector
			currentMode="act"
			defaultEffort="none"
			onEffortChange={(effort) => {
				onSave(effort)
				setSaved(effort)
			}}
			value={saved}
		/>
	)
}

describe("ReasoningEffortSelector with a provider-saved value", () => {
	it("saves the minimum level picked from Default, then clears back to Default", async () => {
		const user = userEvent.setup()
		const onSave = vi.fn()
		render(<SavedEffortHarness initial="default" onSave={onSave} />)

		expect(shownEffort()).toBe("默认")
		await pick(user, "最小")
		expect(onSave).toHaveBeenLastCalledWith("none")
		expect(shownEffort()).toBe("最小")

		await user.click(screen.getByRole("button", { name: "恢复默认" }))
		expect(onSave).toHaveBeenLastCalledWith("default")
		expect(shownEffort()).toBe("默认")
	})

	it("reports nothing when the shown level is picked again", async () => {
		const user = userEvent.setup()
		const onSave = vi.fn()
		render(<SavedEffortHarness initial="none" onSave={onSave} />)

		await pick(user, "最小")

		expect(onSave).not.toHaveBeenCalled()
	})

	it("shows the provider's saved effort rather than the shared per-mode field", () => {
		mockExtensionState.state.apiConfiguration = { actModeReasoningEffort: "none" }
		render(<ReasoningEffortSelector currentMode="act" onEffortChange={vi.fn()} value="default" />)

		expect(shownEffort()).toBe("默认")
	})

	it("shows a saved level even when the current list does not offer it", async () => {
		const user = userEvent.setup()
		const onSave = vi.fn()
		render(
			<ReasoningEffortSelector
				allowedEfforts={["none", "low", "medium", "high"]}
				currentMode="act"
				onEffortChange={onSave}
				value="xhigh"
			/>,
		)

		expect(shownEffort()).toBe("极高")
		await user.click(screen.getByRole("button", { name: "恢复默认" }))
		expect(onSave).toHaveBeenLastCalledWith("default")
	})

	it("is disabled and shows no level while the saved value loads", () => {
		render(<ReasoningEffortSelector currentMode="act" onEffortChange={vi.fn()} value={null} />)

		expect(shownEffort()).toBe("")
		expect(screen.getByRole("button", { name: "低" })).toBeDisabled()
	})
})

describe("ReasoningEffortSelector without a provider-saved value", () => {
	it("keeps showing the shared per-mode field and offers no Default entry", () => {
		mockExtensionState.state.apiConfiguration = { actModeReasoningEffort: "low" }
		render(<ReasoningEffortSelector currentMode="act" />)

		expect(shownEffort()).toBe("低")
		expect(screen.queryByRole("button", { name: "恢复默认" })).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "高" })).toBeInTheDocument()
	})
})