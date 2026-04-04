/**
 * AutoRunDocumentViewer component for Maestro mobile web interface
 *
 * Full-screen document viewer/editor for Auto Run markdown files.
 * Supports preview mode (rendered markdown) and edit mode (textarea).
 * Loads content via WebSocket and saves explicitly on user action.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useThemeColors } from '../components/ThemeProvider';
import { MobileMarkdownRenderer } from './MobileMarkdownRenderer';
import { triggerHaptic, HAPTIC_PATTERNS } from './constants';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';

/**
 * Props for AutoRunDocumentViewer component
 */
export interface AutoRunDocumentViewerProps {
	sessionId: string;
	filename: string;
	onBack: () => void;
	sendRequest: UseWebSocketReturn['sendRequest'];
}

/**
 * AutoRunDocumentViewer component
 *
 * Full-screen viewer/editor for Auto Run markdown documents.
 * Default mode is preview (rendered markdown); toggle to edit mode for a textarea.
 */
export function AutoRunDocumentViewer({
	sessionId,
	filename,
	onBack,
	sendRequest,
}: AutoRunDocumentViewerProps) {
	const colors = useThemeColors();
	const [content, setContent] = useState<string>('');
	const [editContent, setEditContent] = useState<string>('');
	const [isLoading, setIsLoading] = useState(true);
	const [isEditing, setIsEditing] = useState(false);
	const [isDirty, setIsDirty] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [saveMessage, setSaveMessage] = useState<{
		text: string;
		type: 'success' | 'error';
	} | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const saveMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Load document content on mount
	useEffect(() => {
		let cancelled = false;

		async function loadContent() {
			setIsLoading(true);
			try {
				const response = await sendRequest<{ content?: string }>('get_auto_run_document', {
					sessionId,
					filename,
				});
				if (!cancelled) {
					const loaded = response.content ?? '';
					setContent(loaded);
					setEditContent(loaded);
				}
			} catch {
				if (!cancelled) {
					setContent('');
					setEditContent('');
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		loadContent();
		return () => {
			cancelled = true;
		};
	}, [sessionId, filename, sendRequest]);

	// Clear save message timer on unmount
	useEffect(() => {
		return () => {
			if (saveMessageTimerRef.current) {
				clearTimeout(saveMessageTimerRef.current);
			}
		};
	}, []);

	// Focus textarea when entering edit mode
	useEffect(() => {
		if (isEditing && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [isEditing]);

	const showSaveMessage = useCallback((text: string, type: 'success' | 'error') => {
		setSaveMessage({ text, type });
		if (saveMessageTimerRef.current) {
			clearTimeout(saveMessageTimerRef.current);
		}
		saveMessageTimerRef.current = setTimeout(() => {
			setSaveMessage(null);
		}, 2500);
	}, []);

	const handleBack = useCallback(() => {
		if (isDirty) {
			const confirmed = window.confirm('You have unsaved changes. Discard and go back?');
			if (!confirmed) return;
		}
		triggerHaptic(HAPTIC_PATTERNS.tap);
		onBack();
	}, [isDirty, onBack]);

	const handleToggleEdit = useCallback(() => {
		triggerHaptic(HAPTIC_PATTERNS.tap);
		if (isEditing) {
			// Switching to preview — if dirty, keep editContent but show preview of editContent
			setIsEditing(false);
		} else {
			// Switching to edit — sync editContent with latest
			setEditContent(isDirty ? editContent : content);
			setIsEditing(true);
		}
	}, [isEditing, isDirty, editContent, content]);

	const handleContentChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const newContent = e.target.value;
			setEditContent(newContent);
			setIsDirty(newContent !== content);
		},
		[content]
	);

	const handleSave = useCallback(async () => {
		triggerHaptic(HAPTIC_PATTERNS.tap);
		setIsSaving(true);
		try {
			const response = await sendRequest<{ success?: boolean }>('save_auto_run_document', {
				sessionId,
				filename,
				content: editContent,
			});
			if (response.success) {
				setContent(editContent);
				setIsDirty(false);
				triggerHaptic(HAPTIC_PATTERNS.success);
				showSaveMessage('Saved', 'success');
			} else {
				triggerHaptic(HAPTIC_PATTERNS.error);
				showSaveMessage('Save failed', 'error');
			}
		} catch {
			triggerHaptic(HAPTIC_PATTERNS.error);
			showSaveMessage('Save failed', 'error');
		} finally {
			setIsSaving(false);
		}
	}, [sessionId, filename, editContent, sendRequest, showSaveMessage]);

	// Close on escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				handleBack();
			}
			// Ctrl/Cmd+S to save when editing
			if ((e.metaKey || e.ctrlKey) && e.key === 's' && isEditing && isDirty) {
				e.preventDefault();
				handleSave();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [handleBack, handleSave, isEditing, isDirty]);

	// Display content: when dirty, show editContent in preview; otherwise show saved content
	const displayContent = isDirty ? editContent : content;

	return (
		<div
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: colors.bgMain,
				zIndex: 210,
				display: 'flex',
				flexDirection: 'column',
				animation: 'docViewerSlideIn 0.25s ease-out',
			}}
		>
			{/* Header */}
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '8px',
					padding: '12px 16px',
					paddingTop: 'max(12px, env(safe-area-inset-top))',
					borderBottom: `1px solid ${colors.border}`,
					backgroundColor: colors.bgSidebar,
					minHeight: '56px',
					flexShrink: 0,
				}}
			>
				{/* Back button */}
				<button
					onClick={handleBack}
					style={{
						width: '44px',
						height: '44px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						borderRadius: '8px',
						backgroundColor: colors.bgMain,
						border: `1px solid ${colors.border}`,
						color: colors.textMain,
						cursor: 'pointer',
						touchAction: 'manipulation',
						WebkitTapHighlightColor: 'transparent',
						flexShrink: 0,
					}}
					aria-label="Go back"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="19" y1="12" x2="5" y2="12" />
						<polyline points="12 19 5 12 12 5" />
					</svg>
				</button>

				{/* Filename title */}
				<div
					style={{
						flex: 1,
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						fontSize: '16px',
						fontWeight: 600,
						color: colors.textMain,
					}}
				>
					{filename}
					{isDirty && (
						<span
							style={{
								fontSize: '12px',
								fontWeight: 400,
								color: colors.warning,
								marginLeft: '6px',
							}}
						>
							(unsaved)
						</span>
					)}
				</div>

				{/* Edit/Preview toggle */}
				<button
					onClick={handleToggleEdit}
					style={{
						width: '44px',
						height: '44px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						borderRadius: '8px',
						backgroundColor: isEditing ? `${colors.accent}20` : colors.bgMain,
						border: `1px solid ${isEditing ? colors.accent : colors.border}`,
						color: isEditing ? colors.accent : colors.textMain,
						cursor: 'pointer',
						touchAction: 'manipulation',
						WebkitTapHighlightColor: 'transparent',
						flexShrink: 0,
					}}
					aria-label={isEditing ? 'Switch to preview' : 'Switch to edit'}
				>
					{isEditing ? (
						// Eye icon (preview)
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					) : (
						// Pencil icon (edit)
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
						</svg>
					)}
				</button>

				{/* Save button (when editing and dirty) */}
				{isEditing && isDirty && (
					<button
						onClick={handleSave}
						disabled={isSaving}
						style={{
							height: '44px',
							padding: '0 16px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							borderRadius: '8px',
							backgroundColor: isSaving ? `${colors.accent}60` : colors.accent,
							border: 'none',
							color: 'white',
							fontSize: '14px',
							fontWeight: 600,
							cursor: isSaving ? 'not-allowed' : 'pointer',
							touchAction: 'manipulation',
							WebkitTapHighlightColor: 'transparent',
							flexShrink: 0,
						}}
						aria-label="Save document"
					>
						{isSaving ? 'Saving...' : 'Save'}
					</button>
				)}
			</header>

			{/* Save message toast */}
			{saveMessage && (
				<div
					style={{
						padding: '8px 16px',
						backgroundColor:
							saveMessage.type === 'success' ? `${colors.success}20` : `${colors.error}20`,
						color: saveMessage.type === 'success' ? colors.success : colors.error,
						fontSize: '13px',
						fontWeight: 500,
						textAlign: 'center',
						flexShrink: 0,
						transition: 'opacity 0.2s ease',
					}}
				>
					{saveMessage.text}
				</div>
			)}

			{/* Content area */}
			<div
				style={{
					flex: 1,
					overflowY: 'auto',
					overflowX: 'hidden',
				}}
			>
				{isLoading ? (
					// Loading spinner
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							padding: '60px 20px',
							color: colors.textDim,
							fontSize: '14px',
						}}
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{
								animation: 'docViewerSpin 1s linear infinite',
								marginRight: '10px',
							}}
						>
							<line x1="12" y1="2" x2="12" y2="6" />
							<line x1="12" y1="18" x2="12" y2="22" />
							<line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
							<line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
							<line x1="2" y1="12" x2="6" y2="12" />
							<line x1="18" y1="12" x2="22" y2="12" />
							<line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
							<line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
						</svg>
						Loading document...
					</div>
				) : isEditing ? (
					// Edit mode: textarea
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							height: '100%',
						}}
					>
						<textarea
							ref={textareaRef}
							value={editContent}
							onChange={handleContentChange}
							style={{
								flex: 1,
								width: '100%',
								padding: '16px',
								paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
								border: 'none',
								outline: 'none',
								resize: 'none',
								backgroundColor: colors.bgMain,
								color: colors.textMain,
								fontSize: '14px',
								lineHeight: 1.6,
								fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
								WebkitAppearance: 'none',
							}}
							spellCheck={false}
						/>
						{/* Character count */}
						<div
							style={{
								padding: '6px 16px',
								paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
								borderTop: `1px solid ${colors.border}`,
								backgroundColor: colors.bgSidebar,
								fontSize: '11px',
								color: colors.textDim,
								textAlign: 'right',
								flexShrink: 0,
							}}
						>
							{editContent.length.toLocaleString()} characters
						</div>
					</div>
				) : (
					// Preview mode: rendered markdown
					<div
						style={{
							padding: '16px',
							paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
						}}
					>
						{displayContent ? (
							<MobileMarkdownRenderer content={displayContent} fontSize={14} />
						) : (
							<div
								style={{
									color: colors.textDim,
									fontSize: '14px',
									textAlign: 'center',
									padding: '40px 20px',
								}}
							>
								This document is empty.
							</div>
						)}
					</div>
				)}
			</div>

			{/* Animation keyframes */}
			<style>{`
				@keyframes docViewerSlideIn {
					from {
						opacity: 0;
						transform: translateX(20px);
					}
					to {
						opacity: 1;
						transform: translateX(0);
					}
				}
				@keyframes docViewerSpin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
			`}</style>
		</div>
	);
}

export default AutoRunDocumentViewer;
