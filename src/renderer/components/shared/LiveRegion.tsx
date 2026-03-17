/**
 * LiveRegion — Global screen reader announcement system.
 *
 * Provides a visually-hidden `aria-live` region at the app root that
 * announces dynamic state changes to screen readers. Any component can
 * trigger announcements via the `useLiveAnnounce` hook without prop
 * drilling.
 *
 * Uses a toggle technique to ensure screen readers announce even
 * repeated messages.
 *
 * Required by WCAG 2.1 SC 4.1.3 (Status Messages).
 *
 * Usage:
 *   // In App root:
 *   <LiveRegion />
 *
 *   // In any component:
 *   const announce = useLiveAnnounce();
 *   announce('Task 3 of 5 completed');
 *   announce('Connection lost', 'assertive');
 */

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Announcement store (Zustand)
// ---------------------------------------------------------------------------

type Politeness = 'polite' | 'assertive';

interface AnnouncementState {
	message: string;
	politeness: Politeness;
	/** Monotonically increasing key to force re-announcement of identical messages. */
	seq: number;
	/** Push a new announcement. */
	announce: (message: string, politeness?: Politeness) => void;
}

export const useAnnouncementStore = create<AnnouncementState>((set) => ({
	message: '',
	politeness: 'polite',
	seq: 0,
	announce: (message, politeness = 'polite') =>
		set((s) => ({ message, politeness, seq: s.seq + 1 })),
}));

// ---------------------------------------------------------------------------
// Hook — call from any component to announce
// ---------------------------------------------------------------------------

/**
 * Returns a function that announces a message to screen readers.
 *
 * @example
 *   const announce = useLiveAnnounce();
 *   announce('Switched to Claude Code');
 *   announce('Error: connection lost', 'assertive');
 */
export function useLiveAnnounce(): (message: string, politeness?: Politeness) => void {
	return useAnnouncementStore((s) => s.announce);
}

// ---------------------------------------------------------------------------
// Component — mount once at the app root
// ---------------------------------------------------------------------------

/** Visually-hidden styles that keep content accessible to screen readers. */
const srOnlyStyles: React.CSSProperties = {
	position: 'absolute',
	width: '1px',
	height: '1px',
	margin: '-1px',
	padding: '0',
	overflow: 'hidden',
	clip: 'rect(0, 0, 0, 0)',
	whiteSpace: 'nowrap',
	border: '0',
};

/**
 * Renders two visually-hidden live regions and toggles between them so
 * screen readers always pick up new announcements.
 */
export function LiveRegion(): JSX.Element {
	const { message, politeness, seq } = useAnnouncementStore();
	const [toggle, setToggle] = useState(false);
	const prevSeqRef = useRef(0);

	useEffect(() => {
		if (seq !== prevSeqRef.current) {
			prevSeqRef.current = seq;
			setToggle((prev) => !prev);
		}
	}, [seq]);

	return (
		<>
			{/* Polite region */}
			<div role="status" aria-live="polite" aria-atomic="true" style={srOnlyStyles}>
				{politeness === 'polite' && toggle ? message : ''}
			</div>
			<div role="status" aria-live="polite" aria-atomic="true" style={srOnlyStyles}>
				{politeness === 'polite' && !toggle ? message : ''}
			</div>

			{/* Assertive region */}
			<div role="alert" aria-live="assertive" aria-atomic="true" style={srOnlyStyles}>
				{politeness === 'assertive' && toggle ? message : ''}
			</div>
			<div role="alert" aria-live="assertive" aria-atomic="true" style={srOnlyStyles}>
				{politeness === 'assertive' && !toggle ? message : ''}
			</div>
		</>
	);
}
