/**
 * useSessionAnnouncements — Announces session state changes to screen readers.
 *
 * Monitors the active session's state and announces transitions
 * (idle, busy, error, connecting, waiting_input) via the LiveRegion system.
 *
 * Also announces when the user switches to a different session.
 */

import { useEffect, useRef } from 'react';
import { useAnnouncementStore } from '../components/shared/LiveRegion';
import { useSessionStore } from '../stores/sessionStore';
import i18n from '../../shared/i18n/config';

type SessionState = 'idle' | 'busy' | 'waiting_input' | 'connecting' | 'error';

const STATE_KEYS: Record<SessionState, string> = {
	idle: 'accessibility:announcements.session_idle',
	busy: 'accessibility:announcements.session_busy',
	error: 'accessibility:announcements.session_error',
	connecting: 'accessibility:announcements.session_connecting',
	waiting_input: 'accessibility:announcements.session_waiting_input',
};

export function useSessionAnnouncements(): void {
	const announce = useAnnouncementStore((s) => s.announce);
	const sessions = useSessionStore((s) => s.sessions);
	const activeSessionId = useSessionStore((s) => s.activeSessionId);

	const prevStateRef = useRef<string | null>(null);
	const prevActiveIdRef = useRef<string | null>(null);

	// Announce session state transitions for the active session
	useEffect(() => {
		const activeSession = sessions.find((s) => s.id === activeSessionId);
		if (!activeSession) return;

		const state = activeSession.state as SessionState;
		const name = activeSession.name || 'Agent';

		// Announce state change
		if (prevStateRef.current !== null && prevStateRef.current !== state) {
			const key = STATE_KEYS[state];
			if (key) {
				const politeness = state === 'error' ? 'assertive' : 'polite';
				announce(
					i18n.t(key, { name, defaultValue: `${name}: ${state}` }) as string,
					politeness as 'polite' | 'assertive'
				);
			}
		}
		prevStateRef.current = state;
	}, [sessions, activeSessionId, announce]);

	// Announce session switch
	useEffect(() => {
		if (prevActiveIdRef.current !== null && prevActiveIdRef.current !== activeSessionId) {
			const activeSession = sessions.find((s) => s.id === activeSessionId);
			if (activeSession) {
				announce(
					i18n.t('accessibility:announcements.session_switched', {
						name: activeSession.name || 'Agent',
						defaultValue: `Switched to ${activeSession.name || 'Agent'}`,
					}) as string
				);
			}
		}
		prevActiveIdRef.current = activeSessionId;
	}, [activeSessionId, sessions, announce]);
}
