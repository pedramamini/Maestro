/**
 * AppOverlays.tsx
 *
 * Consolidated overlay components extracted from App.tsx.
 * These are full-screen celebration/recognition overlays that appear
 * on top of the main application content.
 *
 * Includes:
 * - StandingOvationOverlay - Badge unlocks and Auto Run records
 * - FirstRunCelebration - First Auto Run completion
 * - KeyboardMasteryCelebration - Keyboard shortcut mastery level-ups
 */

import { StandingOvationOverlay } from './StandingOvationOverlay';
import { FirstRunCelebration } from './FirstRunCelebration';
import { KeyboardMasteryCelebration } from './KeyboardMasteryCelebration';
import { useModalStore, selectModalData } from '../stores/modalStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { Theme } from '../types';
import type { ConductorBadge } from '../constants/conductorBadges';

/**
 * Props for StandingOvationOverlay data
 */
export interface StandingOvationData {
	badge: ConductorBadge;
	isNewRecord: boolean;
	recordTimeMs?: number;
}

/**
 * Props for FirstRunCelebration data
 */
export interface FirstRunCelebrationData {
	elapsedTimeMs: number;
	completedTasks: number;
	totalTasks: number;
}

/**
 * Props for AppOverlays component
 */
export interface AppOverlaysProps {
	// Theme
	theme: Theme;

	// Standing Ovation Overlay
	cumulativeTimeMs: number;
	onCloseStandingOvation: () => void;
	onOpenLeaderboardRegistration: () => void;
	isLeaderboardRegistered: boolean;

	// First Run Celebration
	onCloseFirstRun: () => void;

	// Keyboard Mastery Celebration
	onCloseKeyboardMastery: () => void;
}

/**
 * AppOverlays - Renders celebration overlays based on current state
 *
 * Only renders the overlays that are currently active (data is non-null).
 * These overlays use fixed positioning and high z-indexes to appear
 * above all other content with backdrop effects.
 */
export function AppOverlays({
	theme,
	cumulativeTimeMs,
	onCloseStandingOvation,
	onOpenLeaderboardRegistration,
	isLeaderboardRegistered,
	onCloseFirstRun,
	onCloseKeyboardMastery,
}: AppOverlaysProps): JSX.Element {
	// Self-source from stores (Tier 1A)
	const standingOvationData = useModalStore(selectModalData('standingOvation')) ?? null;
	const firstRunCelebrationData = useModalStore(selectModalData('firstRunCelebration')) ?? null;
	const keyboardMasteryData = useModalStore(selectModalData('keyboardMastery'));
	const pendingKeyboardMasteryLevel = keyboardMasteryData?.level ?? null;
	const shortcuts = useSettingsStore((s) => s.shortcuts);
	const disableConfetti = useSettingsStore((s) => s.disableConfetti);
	return (
		<>
			{/* --- FIRST RUN CELEBRATION OVERLAY --- */}
			{firstRunCelebrationData && (
				<FirstRunCelebration
					theme={theme}
					elapsedTimeMs={firstRunCelebrationData.elapsedTimeMs}
					completedTasks={firstRunCelebrationData.completedTasks}
					totalTasks={firstRunCelebrationData.totalTasks}
					onClose={onCloseFirstRun}
					onOpenLeaderboardRegistration={onOpenLeaderboardRegistration}
					isLeaderboardRegistered={isLeaderboardRegistered}
					disableConfetti={disableConfetti}
				/>
			)}

			{/* --- KEYBOARD MASTERY CELEBRATION OVERLAY --- */}
			{pendingKeyboardMasteryLevel !== null && (
				<KeyboardMasteryCelebration
					theme={theme}
					level={pendingKeyboardMasteryLevel}
					onClose={onCloseKeyboardMastery}
					shortcuts={shortcuts}
					disableConfetti={disableConfetti}
				/>
			)}

			{/* --- STANDING OVATION OVERLAY --- */}
			{standingOvationData && (
				<StandingOvationOverlay
					theme={theme}
					themeMode={theme.mode}
					badge={standingOvationData.badge}
					isNewRecord={standingOvationData.isNewRecord}
					recordTimeMs={standingOvationData.recordTimeMs}
					cumulativeTimeMs={cumulativeTimeMs}
					onClose={onCloseStandingOvation}
					onOpenLeaderboardRegistration={onOpenLeaderboardRegistration}
					isLeaderboardRegistered={isLeaderboardRegistered}
					disableConfetti={disableConfetti}
				/>
			)}
		</>
	);
}

export default AppOverlays;
