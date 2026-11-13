import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useClickAway } from "react-use"
import { useAutoApproveActions } from "@/hooks/useAutoApproveActions"
import { getAsVar, VSC_TITLEBAR_INACTIVE_FOREGROUND } from "@/utils/vscStyles"
import AutoApproveMenuItem from "./AutoApproveMenuItem"
import { ActionMetadata } from "./types"

const breakpoint = 500

interface AutoApproveModalProps {
	isVisible: boolean
	setIsVisible: (visible: boolean) => void
	buttonRef: React.RefObject<HTMLDivElement>
	ACTION_METADATA: ActionMetadata[]
	floating?: boolean
}

const AutoApproveModal: React.FC<AutoApproveModalProps> = ({
	isVisible,
	setIsVisible,
	buttonRef,
	ACTION_METADATA,
	floating = false,
}) => {
	const { isChecked, updateAction } = useAutoApproveActions()
	const modalRef = useRef<HTMLDivElement>(null)
	const itemsContainerRef = useRef<HTMLDivElement>(null)
	const [containerWidth, setContainerWidth] = useState(0)
	const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

	useClickAway(modalRef, (e) => {
		// Skip if click was on the button that toggles the modal
		if (buttonRef.current && buttonRef.current.contains(e.target as Node)) {
			return
		}
		setIsVisible(false)
	})

	// Track container width for responsive layout
	useEffect(() => {
		if (!isVisible) {
			return
		}

		const updateWidth = () => {
			if (itemsContainerRef.current) {
				setContainerWidth(itemsContainerRef.current.offsetWidth)
			}
		}

		// Initial measurement
		updateWidth()

		// Set up resize observer
		const resizeObserver = new ResizeObserver(updateWidth)
		if (itemsContainerRef.current) {
			resizeObserver.observe(itemsContainerRef.current)
		}

		// Clean up
		return () => {
			resizeObserver.disconnect()
		}
	}, [isVisible])

	// Keep the floating panel anchored above the trigger while the layout moves.
	useEffect(() => {
		if (!isVisible || !floating) {
			return
		}
		const updateAnchor = () => {
			if (buttonRef.current) {
				setAnchorRect(buttonRef.current.getBoundingClientRect())
			}
		}
		updateAnchor()
		window.addEventListener("resize", updateAnchor)
		window.addEventListener("scroll", updateAnchor, true)
		return () => {
			window.removeEventListener("resize", updateAnchor)
			window.removeEventListener("scroll", updateAnchor, true)
		}
	}, [isVisible, floating, buttonRef])

	if (!isVisible) {
		return null
	}

	const content = (
		<div
			className="overflow-y-auto overscroll-contain px-3.5 pb-3"
			style={{
				maxHeight: "60vh",
			}}>
			<div className="mb-2.5 text-muted-foreground text-xs cursor-pointer" onClick={() => setIsVisible(false)}>
				让 Cline 采取这些行动，无需事先征求批准。{" "}
				<a
					className="text-link hover:text-link-hover"
					href="https://docs.cline.bot/features/auto-approve#auto-approve"
					rel="noopener"
					style={{ fontSize: "inherit" }}
					target="_blank">
					文档
				</a>
			</div>

			<div
				className="relative mb-2 w-full"
				ref={itemsContainerRef}
				style={{
					columnCount: containerWidth > breakpoint ? 2 : 1,
					columnGap: "4px",
				}}>
				{/* Vertical separator line - only visible in two-column mode */}
				{containerWidth > breakpoint && (
					<div
						className="absolute left-1/2 top-0 bottom-0 opacity-20"
						style={{
							background: getAsVar(VSC_TITLEBAR_INACTIVE_FOREGROUND),
							transform: "translateX(-50%)", // Center the line
						}}
					/>
				)}

				{/* All items in a single list - CSS Grid will handle the column distribution */}
				{ACTION_METADATA.map((action) => (
					<AutoApproveMenuItem action={action} isChecked={isChecked} key={action.id} onToggle={updateAction} />
				))}
			</div>
		</div>
	)

	if (floating) {
		if (!anchorRect) {
			return null
		}
		const panelWidth = Math.min(340, window.innerWidth - 16)
		return createPortal(
			<div
				ref={modalRef}
				style={{
					position: "fixed",
					left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - panelWidth - 8)),
					bottom: Math.max(8, window.innerHeight - anchorRect.top + 6),
					width: panelWidth,
					maxHeight: Math.max(160, Math.min(anchorRect.top - 16, 420)),
					overflowY: "auto",
					zIndex: 1000,
					background: "var(--vscode-editorWidget-background)",
					border: "1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35))",
					borderRadius: 6,
					boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
				}}>
				{content}
			</div>,
			document.body,
		)
	}

	return <div ref={modalRef}>{content}</div>
}

export default AutoApproveModal
