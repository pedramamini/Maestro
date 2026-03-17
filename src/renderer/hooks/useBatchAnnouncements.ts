/**
 * useBatchAnnouncements — Announces Auto Run progress to screen readers.
 *
 * Monitors batch run state and announces task completion milestones
 * and batch completion/stop events via the LiveRegion system.
 */

import { useEffect, useRef } from 'react';
import { useAnnouncementStore } from '../components/shared/LiveRegion';
import { useBatchStore } from '../stores/batchStore';
import { useSessionStore } from '../stores/sessionStore';
import i18n from '../../shared/i18n/config';

export function useBatchAnnouncements(): void {
	const announce = useAnnouncementStore((s) => s.announce);
	const activeSessionId = useSessionStore((s) => s.activeSessionId);
	const batchRunStates = useBatchStore((s) => s.batchRunStates);

	const prevCompletedRef = useRef<number>(0);
	const prevRunningRef = useRef<boolean>(false);

	useEffect(() => {
		if (!activeSessionId) return;
		const batch = batchRunStates[activeSessionId];
		if (!batch) {
			// Reset tracking when no batch
			if (prevRunningRef.current) {
				prevRunningRef.current = false;
				prevCompletedRef.current = 0;
			}
			return;
		}

		const { isRunning, isStopping, completedTasksAcrossAllDocs, totalTasksAcrossAllDocs } = batch;

		// Batch just started
		if (isRunning && !prevRunningRef.current) {
			prevRunningRef.current = true;
			prevCompletedRef.current = 0;
		}

		// Task completed (announce each completion)
		if (isRunning && completedTasksAcrossAllDocs > prevCompletedRef.current) {
			prevCompletedRef.current = completedTasksAcrossAllDocs;
			announce(
				i18n.t('accessibility:announcements.autorun_progress', {
					completed: completedTasksAcrossAllDocs,
					total: totalTasksAcrossAllDocs,
					defaultValue: `Auto Run: task ${completedTasksAcrossAllDocs} of ${totalTasksAcrossAllDocs} completed`,
				}) as string
			);
		}

		// Batch stopped
		if (isStopping && prevRunningRef.current) {
			announce(
				i18n.t('accessibility:announcements.autorun_stopped', {
					defaultValue: 'Auto Run stopped',
				}) as string
			);
		}

		// Batch completed
		if (!isRunning && prevRunningRef.current) {
			prevRunningRef.current = false;
			if (!isStopping) {
				announce(
					i18n.t('accessibility:announcements.autorun_complete', {
						completed: completedTasksAcrossAllDocs,
						total: totalTasksAcrossAllDocs,
						defaultValue: `Auto Run complete. ${completedTasksAcrossAllDocs} of ${totalTasksAcrossAllDocs} tasks finished`,
					}) as string
				);
			}
			prevCompletedRef.current = 0;
		}
	}, [activeSessionId, batchRunStates, announce]);
}
