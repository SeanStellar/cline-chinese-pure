import type { HistoryItem } from "@shared/HistoryItem"
import { useMemo, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"

const DAY_MS = 24 * 60 * 60 * 1000

const CHART_COLORS = [
	"var(--vscode-charts-blue)",
	"var(--vscode-charts-green)",
	"var(--vscode-charts-purple)",
	"var(--vscode-charts-red)",
	"var(--vscode-charts-yellow)",
	"var(--vscode-charts-orange)",
]

const startOfDay = (ts: number) => {
	const date = new Date(ts)
	date.setHours(0, 0, 0, 0)
	return date.getTime()
}

const formatTokens = (tokens: number) => {
	if (tokens >= 100_000_000) {
		return `${(tokens / 100_000_000).toFixed(2)} 亿`
	}
	if (tokens >= 10_000) {
		return `${(tokens / 10_000).toFixed(1)} 万`
	}
	return `${Math.round(tokens)}`
}

const formatShortDate = (ts: number) => {
	const date = new Date(ts)
	return `${date.getMonth() + 1}/${date.getDate()}`
}

const formatMetric = (value: number, metric: "tokens" | "cost") =>
	metric === "cost" ? `$${value.toFixed(value > 0 && value < 1 ? 4 : 2)}` : formatTokens(value)

const taskTokens = (item: HistoryItem) => (item.tokensIn ?? 0) + (item.tokensOut ?? 0)

interface UsageViewProps {
	onDone: () => void
}

const UsageView = ({ onDone }: UsageViewProps) => {
	const { taskHistory } = useExtensionState()
	const [rangeDays, setRangeDays] = useState<7 | 30>(7)
	const [metric, setMetric] = useState<"tokens" | "cost">("tokens")
	const [workspaceFilter, setWorkspaceFilter] = useState("__all__")
	const [copied, setCopied] = useState(false)

	const allTasks = useMemo(() => (taskHistory ?? []) as HistoryItem[], [taskHistory])

	const workspaces = useMemo(() => {
		const counts = new Map<string, number>()
		for (const task of allTasks) {
			const key = task.cwdOnTaskInitialization || ""
			counts.set(key, (counts.get(key) ?? 0) + 1)
		}
		return [...counts.entries()].sort((a, b) => b[1] - a[1])
	}, [allTasks])

	const stats = useMemo(() => {
		const tasks =
			workspaceFilter === "__all__"
				? allTasks
				: allTasks.filter((task) => (task.cwdOnTaskInitialization || "") === workspaceFilter)
		const byDay = new Map<
			number,
			{ total: number; cost: number; byModel: Map<string, number>; costByModel: Map<string, number> }
		>()
		const byModel = new Map<string, number>()
		const byModelCost = new Map<string, number>()
		let total = 0
		let cacheTokens = 0
		let cost = 0

		for (const task of tasks) {
			const tokens = taskTokens(task)
			const taskCost = task.totalCost ?? 0
			total += tokens
			cost += taskCost
			cacheTokens += (task.cacheReads ?? 0) + (task.cacheWrites ?? 0)
			const model = task.modelId || "未知模型"
			byModel.set(model, (byModel.get(model) ?? 0) + tokens)
			byModelCost.set(model, (byModelCost.get(model) ?? 0) + taskCost)

			const day = startOfDay(task.ts)
			let entry = byDay.get(day)
			if (!entry) {
				entry = { total: 0, cost: 0, byModel: new Map(), costByModel: new Map() }
				byDay.set(day, entry)
			}
			entry.total += tokens
			entry.cost += taskCost
			entry.byModel.set(model, (entry.byModel.get(model) ?? 0) + tokens)
			entry.costByModel.set(model, (entry.costByModel.get(model) ?? 0) + taskCost)
		}

		const days = [...byDay.keys()].sort((a, b) => a - b)
		const today = startOfDay(Date.now())
		let currentStreak = 0
		for (let day = today; byDay.has(day); day -= DAY_MS) {
			currentStreak += 1
		}

		let longestStreak = 0
		let run = 0
		let previous: number | null = null
		for (const day of days) {
			run = previous !== null && day - previous === DAY_MS ? run + 1 : 1
			longestStreak = Math.max(longestStreak, run)
			previous = day
		}

		let peak = 0
		for (const entry of byDay.values()) {
			peak = Math.max(peak, entry.total)
		}

		return { tasks, byDay, byModel, byModelCost, total, cacheTokens, cost, currentStreak, longestStreak, peak }
	}, [allTasks, workspaceFilter])

	const range = useMemo(() => {
		const days: number[] = []
		const today = startOfDay(Date.now())
		for (let index = rangeDays - 1; index >= 0; index -= 1) {
			days.push(today - index * DAY_MS)
		}

		const modelTotals = new Map<string, number>()
		const sourceOf = (day: number) => {
			const entry = stats.byDay.get(day)
			if (!entry) {
				return undefined
			}
			return metric === "cost" ? entry.costByModel : entry.byModel
		}
		for (const day of days) {
			sourceOf(day)?.forEach((value, model) => {
				modelTotals.set(model, (modelTotals.get(model) ?? 0) + value)
			})
		}

		const topModels = [...modelTotals.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 4)
			.map(([model]) => model)

		const series = topModels.map((model) => ({
			model,
			values: days.map((day) => sourceOf(day)?.get(model) ?? 0),
		}))

		const otherValues = days.map((day) => {
			const source = sourceOf(day)
			if (!source) {
				return 0
			}
			let sum = 0
			source.forEach((value, model) => {
				if (!topModels.includes(model)) {
					sum += value
				}
			})
			return sum
		})
		if (otherValues.some((value) => value > 0)) {
			series.push({ model: "其他", values: otherValues })
		}

		const seriesWithTotals = series.map((item) => ({
			...item,
			total: item.values.reduce((sum, value) => sum + value, 0),
		}))
		const max = Math.max(metric === "cost" ? 0.0001 : 1, ...seriesWithTotals.flatMap((item) => item.values))

		const sortedModels = [...modelTotals.entries()].sort((a, b) => b[1] - a[1])
		const donut = sortedModels.slice(0, 5)
		const otherTotal = sortedModels.slice(5).reduce((sum, [, value]) => sum + value, 0)
		if (otherTotal > 0) {
			donut.push(["其他", otherTotal])
		}
		const rangeTotal = sortedModels.reduce((sum, [, value]) => sum + value, 0)

		return { days, series: seriesWithTotals, max, donut, rangeTotal }
	}, [rangeDays, stats, metric])

	const heatmap = useMemo(() => {
		const today = startOfDay(Date.now())
		const totalDays = 53 * 7
		let start = today - (totalDays - 1) * DAY_MS
		start -= new Date(start).getDay() * DAY_MS
		const cells: { day: number; tokens: number }[] = []
		for (let day = start; day <= today; day += DAY_MS) {
			cells.push({ day, tokens: stats.byDay.get(day)?.total ?? 0 })
		}
		const weeks: (typeof cells)[] = []
		for (let index = 0; index < cells.length; index += 7) {
			weeks.push(cells.slice(index, index + 7))
		}
		const max = Math.max(1, ...cells.map((cell) => cell.tokens))
		const monthLabels = weeks.map((week, index) => {
			if (week.length === 0) {
				return ""
			}
			const date = new Date(week[0].day)
			const previous = index > 0 && weeks[index - 1].length > 0 ? new Date(weeks[index - 1][0].day) : null
			return !previous || previous.getMonth() !== date.getMonth() ? `${date.getMonth() + 1}月` : ""
		})
		return { weeks, max, monthLabels }
	}, [stats])

	const chartWidth = 820
	const chartHeight = 260
	const padding = { left: 54, right: 16, top: 14, bottom: 26 }
	const innerWidth = chartWidth - padding.left - padding.right
	const innerHeight = chartHeight - padding.top - padding.bottom
	const pointX = (index: number) =>
		padding.left +
		(range.days.length <= 1 ? innerWidth / 2 : (index / (range.days.length - 1)) * innerWidth)
	const pointY = (value: number) => padding.top + innerHeight - (value / range.max) * innerHeight
	const labelStep = rangeDays === 7 ? 1 : 5

	const donutRadius = 68
	const donutStroke = 24
	const circumference = 2 * Math.PI * donutRadius
	let donutOffset = 0
	const donutSegments = range.donut.map(([model, value], index) => {
		const fraction = range.rangeTotal > 0 ? value / range.rangeTotal : 0
		const dash = fraction * circumference
		const segment = {
			model,
			value,
			color: CHART_COLORS[index % CHART_COLORS.length],
			dash,
			offset: donutOffset,
		}
		donutOffset += dash
		return segment
	})

	const cards = [
		{ label: "累计 Token 数", value: formatTokens(stats.total) },
		{ label: "峰值 Token 数", value: formatTokens(stats.peak) },
		{ label: "缓存 Token", value: formatTokens(stats.cacheTokens) },
		{ label: "累计费用", value: `$${stats.cost.toFixed(2)}` },
		{ label: "任务总数", value: `${stats.tasks.length}` },
		{ label: "当前连续天数", value: `${stats.currentStreak} 天` },
		{ label: "最长连续天数", value: `${stats.longestStreak} 天` },
	]

	const exportCsv = async () => {
		const header = ["时间", "任务", "模型", "输入Token", "输出Token", "缓存读", "缓存写", "费用USD", "工作区"]
		const lines = [header.join(",")]
		for (const task of stats.tasks) {
			const cells = [
				new Date(task.ts).toLocaleString(),
				task.task.replace(/\s+/g, " ").slice(0, 80),
				task.modelId || "",
				String(task.tokensIn ?? 0),
				String(task.tokensOut ?? 0),
				String(task.cacheReads ?? 0),
				String(task.cacheWrites ?? 0),
				(task.totalCost ?? 0).toFixed(4),
				task.cwdOnTaskInitialization || "",
			]
			lines.push(cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
		}
		try {
			await navigator.clipboard.writeText(lines.join("\n"))
			setCopied(true)
			setTimeout(() => setCopied(false), 1600)
		} catch (e) {
			console.error("Failed to copy usage CSV:", e)
		}
	}

	return (
		<div className="flex h-full flex-col overflow-y-auto bg-(--vscode-editor-background) text-foreground">
			<div className="mx-auto w-full max-w-[1000px] px-6 pb-10 pt-5">
				<div className="mb-5 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<h1 className="m-0 text-xl font-semibold">使用统计</h1>
						<span className="rounded-full border border-(--vscode-widget-border) px-2 py-0.5 text-[11px] text-description">
							本地用量
						</span>
					</div>
					<button
						className="rounded bg-(--vscode-button-background) px-3 py-1 text-xs text-(--vscode-button-foreground) hover:bg-(--vscode-button-hoverBackground)"
						onClick={onDone}>
						完成
					</button>
				</div>

				<div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
					{cards.map((card) => (
						<div className="rounded-lg bg-(--vscode-editorWidget-background) px-4 py-3" key={card.label}>
							<div className="text-lg font-semibold">{card.value}</div>
							<div className="mt-1 text-[11px] text-description">{card.label}</div>
						</div>
					))}
				</div>

				<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<span className="text-xs text-description">工作区</span>
						<select
							className="h-7 max-w-[320px] rounded border border-(--vscode-dropdown-border) bg-(--vscode-dropdown-background) px-2 text-xs text-(--vscode-dropdown-foreground) outline-none"
							onChange={(e) => setWorkspaceFilter(e.target.value)}
							value={workspaceFilter}>
							<option value="__all__">全部工作区</option>
							{workspaces.map(([workspace, count]) => (
								<option key={workspace || "__unknown__"} value={workspace}>
									{workspace ? workspace.split(/[\\/]/).filter(Boolean).pop() : "未知工作区"}（{count}）
								</option>
							))}
						</select>
					</div>
					<button
						className="rounded border border-(--vscode-widget-border) px-2 py-1 text-[11px] text-description hover:text-foreground"
						onClick={() => void exportCsv()}>
						{copied ? "已复制 CSV" : "导出 CSV"}
					</button>
				</div>

				<div className="mb-5 rounded-lg bg-(--vscode-editorWidget-background) p-4">
					<div className="mb-3 flex items-center justify-between">
						<div className="text-sm font-medium">Token 活动</div>
						<div className="text-[11px] text-description">最近一年（每日）</div>
					</div>
					<div className="overflow-x-auto pb-1">
						<div className="flex min-w-max gap-[3px]">
							{heatmap.weeks.map((week, weekIndex) => (
								<div className="flex flex-col gap-[3px]" key={week[0]?.day ?? weekIndex}>
									<div className="h-3 text-[9px] text-description">{heatmap.monthLabels[weekIndex]}</div>
									{week.map((cell) => (
										<div
											className="h-[10px] w-[10px] rounded-[2px]"
											key={cell.day}
											style={{
												backgroundColor:
													cell.tokens === 0
														? "var(--vscode-editorWidget-border)"
														: `color-mix(in srgb, var(--vscode-charts-blue) ${Math.max(
																18,
																Math.round((cell.tokens / heatmap.max) * 100),
															)}%, transparent)`,
											}}
											title={`${new Date(cell.day).toLocaleDateString()} · ${formatTokens(cell.tokens)} tokens`}
										/>
									))}
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
					<div className="text-sm font-medium">时间范围</div>
					<div className="flex items-center gap-2">
						<div className="flex overflow-hidden rounded-full border border-(--vscode-widget-border)">
							{(["tokens", "cost"] as const).map((option) => (
								<button
									className={`px-3 py-1 text-[11px] ${
										metric === option
											? "bg-(--vscode-button-background) text-(--vscode-button-foreground)"
											: "text-description hover:text-foreground"
									}`}
									key={option}
									onClick={() => setMetric(option)}>
									{option === "tokens" ? "Token" : "费用"}
								</button>
							))}
						</div>
						<div className="flex overflow-hidden rounded-full border border-(--vscode-widget-border)">
							{[7, 30].map((days) => (
								<button
									className={`px-3 py-1 text-[11px] ${
										rangeDays === days
											? "bg-(--vscode-button-background) text-(--vscode-button-foreground)"
											: "text-description hover:text-foreground"
									}`}
									key={days}
									onClick={() => setRangeDays(days as 7 | 30)}>
									近 {days} 日
								</button>
							))}
						</div>
					</div>
				</div>

				<div className="mb-5 rounded-lg bg-(--vscode-editorWidget-background) p-4">
					<div className="mb-2 text-sm font-medium">每日 Token 趋势图</div>
					<div className="mb-2 flex flex-wrap gap-3 text-[11px] text-description">
						{range.series.map((item, index) => (
							<span className="flex items-center gap-1" key={item.model}>
								<span
									className="h-2 w-2 rounded-full"
									style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
								/>
								{item.model}
							</span>
						))}
					</div>
					{range.rangeTotal === 0 ? (
						<div className="py-12 text-center text-xs text-description">该时间范围内暂无使用记录</div>
					) : (
						<svg className="h-auto w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
							{[0, 1, 2, 3, 4].map((step) => {
								const value = (range.max * step) / 4
								const y = pointY(value)
								return (
									<g key={step}>
										<line
											stroke="var(--vscode-widget-border)"
											strokeDasharray="4 4"
											strokeWidth={1}
											x1={padding.left}
											x2={chartWidth - padding.right}
											y1={y}
											y2={y}
										/>
										<text
											fill="var(--vscode-descriptionForeground)"
											fontSize={10}
											textAnchor="end"
											x={padding.left - 8}
											y={y + 3}>
											{formatMetric(value, metric)}
										</text>
									</g>
								)
							})}
							{range.series.map((item, seriesIndex) => (
								<g key={item.model}>
									<polyline
										fill="none"
										points={item.values.map((value, index) => `${pointX(index)},${pointY(value)}`).join(" ")}
										stroke={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
										strokeWidth={2}
									/>
									{item.values.map((value, index) => (
										<circle cx={pointX(index)} cy={pointY(value)} fill="transparent" key={range.days[index]} r={8}>
											<title>{`${item.model} · ${formatShortDate(range.days[index])} · ${formatTokens(value)} tokens`}</title>
										</circle>
									))}
								</g>
							))}
							{range.days.map((day, index) =>
								index % labelStep === 0 || index === range.days.length - 1 ? (
									<text
										fill="var(--vscode-descriptionForeground)"
										fontSize={10}
										key={day}
										textAnchor="middle"
										x={pointX(index)}
										y={chartHeight - 8}>
										{formatShortDate(day)}
									</text>
								) : null,
							)}
						</svg>
					)}
				</div>

				<div className="mb-5 rounded-lg bg-(--vscode-editorWidget-background) p-4">
					<div className="mb-3 text-sm font-medium">任务明细</div>
					<div className="max-h-[320px] overflow-auto">
						<table className="w-full text-left text-[11px]">
							<thead className="sticky top-0 bg-(--vscode-editorWidget-background) text-description">
								<tr>
									<th className="py-1 pr-3 font-normal">时间</th>
									<th className="py-1 pr-3 font-normal">任务</th>
									<th className="py-1 pr-3 font-normal">模型</th>
									<th className="py-1 pr-3 text-right font-normal">Token</th>
									<th className="py-1 pr-3 text-right font-normal">费用</th>
									<th className="py-1 font-normal">工作区</th>
								</tr>
							</thead>
							<tbody>
								{[...stats.tasks]
									.sort((a, b) => b.ts - a.ts)
									.slice(0, 100)
									.map((task) => (
										<tr className="border-t border-(--vscode-widget-border)" key={task.id}>
											<td className="whitespace-nowrap py-1 pr-3 text-description">
												{new Date(task.ts).toLocaleDateString()}
											</td>
											<td className="max-w-[320px] truncate py-1 pr-3" title={task.task}>
												{task.task}
											</td>
											<td className="max-w-[180px] truncate py-1 pr-3">
												{task.modelId || "未知模型"}
											</td>
											<td className="py-1 pr-3 text-right">{formatTokens(taskTokens(task))}</td>
											<td className="py-1 pr-3 text-right">
												${(task.totalCost ?? 0).toFixed(4)}
											</td>
											<td className="max-w-[160px] truncate py-1 text-description">
												{task.cwdOnTaskInitialization?.split(/[\\/]/).filter(Boolean).pop() || "-"}
											</td>
										</tr>
									))}
							</tbody>
						</table>
					</div>
				</div>

				<div className="rounded-lg bg-(--vscode-editorWidget-background) p-4">
					<div className="mb-3 text-sm font-medium">模型用量</div>
					{range.rangeTotal === 0 ? (
						<div className="py-10 text-center text-xs text-description">该时间范围内暂无使用记录</div>
					) : (
						<div className="flex flex-wrap items-center gap-8">
							<div className="relative">
								<svg height={200} viewBox="0 0 200 200" width={200}>
									<circle
										cx={100}
										cy={100}
										fill="none"
										r={donutRadius}
										stroke="var(--vscode-editorWidget-border)"
										strokeWidth={donutStroke}
									/>
									{donutSegments.map((segment) => (
										<circle
											cx={100}
											cy={100}
											fill="none"
											key={segment.model}
											r={donutRadius}
											stroke={segment.color}
											strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
											strokeDashoffset={-segment.offset}
											strokeWidth={donutStroke}
											transform="rotate(-90 100 100)"
										/>
									))}
								</svg>
								<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
									<div className="text-base font-semibold">{formatMetric(range.rangeTotal, metric)}</div>
									<div className="text-[10px] text-description">{metric === "cost" ? "USD" : "tokens"}</div>
								</div>
							</div>
							<div className="min-w-[260px] flex-1">
								{donutSegments.map((segment) => (
									<div className="mb-2 flex items-center justify-between gap-3 text-xs" key={segment.model}>
										<span className="flex min-w-0 items-center gap-2">
											<span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
											<span className="truncate">{segment.model}</span>
										</span>
										<span className="flex shrink-0 gap-4 text-description">
											<span>{((segment.value / range.rangeTotal) * 100).toFixed(1)}%</span>
											<span className="w-20 text-right">{formatMetric(segment.value, metric)}</span>
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

export default UsageView
