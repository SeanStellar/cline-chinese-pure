/**
 * Copy and navigation targets for the Cline Chinese onboarding/daily promo
 * popups. Content is deliberately kept as plain data so it can be swapped or
 * disabled (set to null) without touching the popup logic.
 */

export type PromoPopupKind = "newUser" | "daily"

export type PromoPrimaryAction = { type: "openUrl"; url: string } | { type: "batch" }

export interface PromoPopupContent {
	/** Small title shown in the popup header bar. */
	headerTitle: string
	/** Short kicker shown under the headline. */
	eyebrow: string
	title: string
	body: string
	primaryLabel: string
	primaryAction: PromoPrimaryAction
	secondaryLabel?: string
	secondaryUrl?: string
	/** Daily popup only: show the "more settings" opt-out row. */
	showOptOut?: boolean
}

/** Window event consumed by ChatView to switch the main UI into Batch mode. */
export const OPEN_BATCH_MODE_EVENT = "loomloom-open-batch"

export const NEW_USER_BENEFITS_URL = "https://console.shengsuanyun.com/user/recharge"
export const LOOMLOOM_INTRO_URL = "https://www.shengsuanyun.com/zh/loomloom"

/** First-phase copy. Set to null to stop showing the popup entirely. */
export const NEW_USER_PROMO: PromoPopupContent | null = null

export const DAILY_PROMO: PromoPopupContent | null = null

export function getPromoContent(kind: PromoPopupKind): PromoPopupContent | null {
	return kind === "newUser" ? NEW_USER_PROMO : DAILY_PROMO
}

/**
 * A popup is only eligible when the content required to render it is present.
 * This is what makes "no valid content -> no popup" hold even if the copy is
 * cleared out between releases.
 */
export function hasValidPromoContent(content: PromoPopupContent | null | undefined): content is PromoPopupContent {
	if (!content) {
		return false
	}
	const required = [content.headerTitle, content.eyebrow, content.title, content.body, content.primaryLabel]
	return required.every((value) => typeof value === "string" && value.trim().length > 0)
}
