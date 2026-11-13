import { describe, expect, it } from "vitest"
import { getUserTypeSelections, NEW_USER_TYPE } from "../data-steps"

describe("getUserTypeSelections", () => {
	it("omits the free-credit and ClinePass options, keeping only the primary paths", () => {
		const selections = getUserTypeSelections(false)
		expect(selections.map((s) => s.type)).toEqual([NEW_USER_TYPE.POWER, NEW_USER_TYPE.BYOK])
		expect(selections.some((s) => s.type === NEW_USER_TYPE.FREE)).toBe(false)
		expect(selections.some((s) => s.type === NEW_USER_TYPE.CLINE_PASS)).toBe(false)
	})

	it("keeps the primary option list even when ClinePass models are available", () => {
		const selections = getUserTypeSelections(true)
		// The free-credit and ClinePass entries are intentionally not offered, so the
		// list stays the same whether or not ClinePass models exist.
		expect(selections[0]?.type).toBe(NEW_USER_TYPE.POWER)
		expect(selections.map((s) => s.type)).toEqual([NEW_USER_TYPE.POWER, NEW_USER_TYPE.BYOK])
		expect(selections.some((s) => s.type === NEW_USER_TYPE.FREE)).toBe(false)
		expect(selections.some((s) => s.type === NEW_USER_TYPE.CLINE_PASS)).toBe(false)
	})
})
