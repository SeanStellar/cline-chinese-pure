export interface ModeLabels {
	plan: string
	act: string
	planMode: string
	actMode: string
}

export function getModeLabels(preferredLanguage: string | undefined): ModeLabels {
	if (preferredLanguage?.includes("Traditional Chinese")) {
		return { plan: "計畫", act: "執行", planMode: "計畫模式", actMode: "執行模式" }
	}
	if (preferredLanguage?.includes("Simplified Chinese")) {
		return { plan: "计划", act: "执行", planMode: "计划模式", actMode: "执行模式" }
	}
	return { plan: "Plan", act: "Act", planMode: "Plan 模式", actMode: "Act 模式" }
}
