import Section from "../Section"

interface AboutSectionProps {
	version: string
	extensionVariant?: "legacy" | "next"
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const VARIANT_LABELS: Record<"legacy" | "next", string> = {
	legacy: "旧版",
	next: "新版",
}

const AboutSection = ({ version, extensionVariant, renderSectionHeader }: AboutSectionProps) => {
	return (
		<div>
			{renderSectionHeader("about")}
			<Section>
				<div className="flex flex-col gap-2 px-4">
					<h2 className="text-lg font-semibold">
						Cline Chinese v{version}
						{extensionVariant && (
							<span className="ml-2 text-sm font-normal text-description">
								({VARIANT_LABELS[extensionVariant]})
							</span>
						)}
					</h2>
					<p>
						本地定制版。一款可使用你的 CLI 和编辑器的 AI 助手，能够逐步处理复杂的软件开发任务，借助工具创建和编辑文件、探索大型项目、使用浏览器，以及在你授权后执行终端命令。
					</p>
					<p className="text-sm text-description">
						本版本仅用于本地使用，不提供外部社区、问题反馈或文档链接。
					</p>
				</div>
			</Section>
		</div>
	)
}

export default AboutSection