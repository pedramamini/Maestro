/**
 * ImageAnnotator — Modal root for the freehand image annotator.
 *
 * Self-sources `isOpen`, `imageDataUrl`, `onSave`, and `closeAnnotator` from
 * `useImageAnnotatorStore`, so callers (input area, lightbox, Auto Run
 * thumbnails) just push state into the store and the modal mounts itself. The
 * component renders nothing while `isOpen` is false but stays mounted, so the
 * `useModalLayer` registration stays stable across open/close cycles via the
 * `enabled` flag.
 *
 * Save and copy compositing live here (not in the toolbar) — the toolbar emits
 * `onSave` / `onCopy` callbacks and the parent owns the SVG ref + image data
 * URL needed by `compositeAnnotatedImage`. The drawer body is a placeholder
 * for phase 03.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Theme } from '../../types';
import { useModalLayer } from '../../hooks/ui/useModalLayer';
import { MODAL_PRIORITIES } from '../../constants/modalPriorities';
import { safeClipboardWriteImage } from '../../utils/clipboard';
import { notifyToast } from '../../stores/notificationStore';
import { logger } from '../../utils/logger';
import { useImageAnnotatorStore } from './imageAnnotatorStore';
import { useAnnotatorState } from './useAnnotatorState';
import { AnnotatorCanvas } from './AnnotatorCanvas';
import { AnnotatorToolbar } from './AnnotatorToolbar';
import compositeAnnotatedImage from './compositeAnnotatedImage';

interface ImageAnnotatorProps {
	theme: Theme;
}

export function ImageAnnotator({ theme }: ImageAnnotatorProps) {
	const isOpen = useImageAnnotatorStore((s) => s.isOpen);
	const imageDataUrl = useImageAnnotatorStore((s) => s.imageDataUrl);
	const onSave = useImageAnnotatorStore((s) => s.onSave);
	const closeAnnotator = useImageAnnotatorStore((s) => s.closeAnnotator);

	// Remount canvas + state on each open so a fresh session starts clean.
	const sessionKey = useMemo(() => (isOpen ? imageDataUrl : null), [isOpen, imageDataUrl]);

	useModalLayer(MODAL_PRIORITIES.IMAGE_ANNOTATOR, 'Image Annotator', closeAnnotator, {
		focusTrap: 'lenient',
		enabled: isOpen,
	});

	if (!isOpen || !imageDataUrl) {
		return null;
	}

	return (
		<ImageAnnotatorContent
			key={sessionKey ?? 'closed'}
			theme={theme}
			imageDataUrl={imageDataUrl}
			onSave={onSave}
			closeAnnotator={closeAnnotator}
		/>
	);
}

interface ImageAnnotatorContentProps {
	theme: Theme;
	imageDataUrl: string;
	onSave: ((newDataUrl: string) => void) | null;
	closeAnnotator: () => void;
}

function ImageAnnotatorContent({
	theme,
	imageDataUrl,
	onSave,
	closeAnnotator,
}: ImageAnnotatorContentProps) {
	const state = useAnnotatorState();
	const svgRef = useRef<SVGSVGElement>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);

	const composite = useCallback(async (): Promise<string | null> => {
		const svg = svgRef.current;
		if (!svg) return null;
		return compositeAnnotatedImage(imageDataUrl, svg);
	}, [imageDataUrl]);

	const handleSave = useCallback(async () => {
		try {
			const dataUrl = await composite();
			if (!dataUrl) return;
			onSave?.(dataUrl);
			closeAnnotator();
		} catch (err) {
			logger.error('Failed to save annotated image:', undefined, err);
			notifyToast({
				color: 'red',
				title: 'Save failed',
				message: 'Could not composite the annotated image.',
			});
		}
	}, [composite, onSave, closeAnnotator]);

	const handleCopy = useCallback(async () => {
		const dataUrl = await composite();
		if (!dataUrl) {
			throw new Error('Annotator canvas not ready');
		}
		const ok = await safeClipboardWriteImage(dataUrl);
		if (!ok) {
			throw new Error('Clipboard write rejected');
		}
	}, [composite]);

	const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Image Annotator"
			className="fixed inset-0 z-[160] flex"
			style={{
				backgroundColor: `${theme.colors.bgMain}f2`,
				color: theme.colors.textMain,
			}}
		>
			<div className="relative flex-1">
				<AnnotatorCanvas ref={svgRef} imageDataUrl={imageDataUrl} state={state} />
				<AnnotatorToolbar
					state={state}
					theme={theme}
					drawerOpen={drawerOpen}
					onToggleDrawer={toggleDrawer}
					onSave={handleSave}
					onCopy={handleCopy}
					onCancel={closeAnnotator}
				/>
			</div>
			{drawerOpen && (
				<aside
					aria-label="Drawing settings"
					className="flex flex-col w-72 border-l p-4 overflow-y-auto"
					style={{
						backgroundColor: theme.colors.bgSidebar,
						borderColor: theme.colors.border,
					}}
				>
					<div className="text-sm font-medium mb-2" style={{ color: theme.colors.textMain }}>
						Drawing settings
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						Settings UI lands in the next phase.
					</div>
				</aside>
			)}
		</div>
	);
}

export default ImageAnnotator;
