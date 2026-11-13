import type { ApiConfiguration } from "@shared/api"
import { isSecretKey } from "@shared/storage/state-keys"
import type { Mode } from "@shared/storage/types"

export interface SavedModelProfile {
	id: string
	name: string
	provider: string
	modelId: string
	mode: Mode
	config: Partial<ApiConfiguration>
	reasoningEffort?: string
	contextWindow?: number
	temperature?: number
	createdAt: number
}

const ACTIVE_KEY = "cline-chinese.model-profiles.active.v1"

/** Profiles never carry API keys; provider keys stay in SecretStorage. */
export function stripSecrets(config: Partial<ApiConfiguration>): Partial<ApiConfiguration> {
	return Object.fromEntries(Object.entries(config).filter(([key]) => !isSecretKey(key))) as Partial<ApiConfiguration>
}

export function parseProfiles(json: string | undefined): SavedModelProfile[] {
	if (!json) {
		return []
	}
	try {
		const parsed = JSON.parse(json)
		if (!Array.isArray(parsed)) {
			return []
		}
		return parsed.map((profile) =>
			profile && typeof profile.config === "object"
				? { ...profile, config: stripSecrets(profile.config) }
				: profile,
		)
	} catch {
		return []
	}
}

export function serializeProfiles(profiles: SavedModelProfile[]): string {
	return JSON.stringify(profiles)
}

export function loadActiveProfileId(): string | null {
	try {
		return localStorage.getItem(ACTIVE_KEY)
	} catch {
		return null
	}
}

export function saveActiveProfileId(id: string | null): void {
	try {
		if (id) {
			localStorage.setItem(ACTIVE_KEY, id)
		} else {
			localStorage.removeItem(ACTIVE_KEY)
		}
	} catch {
		// ignore storage errors
	}
}

export function createProfileId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID()
	}
	return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Rebuilds the update payload for the target mode. Only the mode-prefixed
 * fields captured from the profile's own mode are taken, then remapped onto
 * the target mode; shared fields (API keys, base URLs, ...) are copied as-is.
 */
export function buildProfileUpdates(profile: SavedModelProfile, targetMode: Mode): Partial<ApiConfiguration> {
	const savedPrefix = profile.mode === "plan" ? "planMode" : "actMode"
	const targetPrefix = targetMode === "plan" ? "planMode" : "actMode"
	const updates: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(profile.config)) {
		if (key.startsWith("planMode") || key.startsWith("actMode")) {
			if (!key.startsWith(savedPrefix)) {
				continue
			}
			updates[targetPrefix + key.slice(savedPrefix.length)] = value
		} else {
			updates[key] = value
		}
	}
	return updates as Partial<ApiConfiguration>
}
