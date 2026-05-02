/**
 * RolesPanel — per-project fleet roster tab (#429).
 *
 * Shows exactly 4 slot cards (runner / fixer / reviewer / merger).
 * Persists via projectRoles:get / projectRoles:set IPC channels.
 *
 * #444: removed polling getBoard against work-graph SQLite.
 * Now subscribes to agentDispatch:claimStarted/claimEnded IPC events from
 * DispatchEngine to maintain a renderer-local claim state map.
 * Initial hydration via agentDispatch:getBoard (in-memory ClaimTracker).
 *
 * No GitHub query is made on initial mount — all data comes from the
 * in-memory ClaimTracker pushed via IPC events.
 *
 * Slots reference existing Left Bar agents (agentId-based). SlotCard filters
 * the sessions list to agents on the same project + host as the active session.
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import type { Theme, Session } from '../../../types';
import type {
	DispatchRole,
	ProjectRoleSlots,
	RoleSlotAssignment,
} from '../../../../shared/project-roles-types';
import { DISPATCH_ROLES } from '../../../../shared/project-roles-types';
import {
	type ActiveDispatchClaim,
	selectClaimsForProject,
	useDispatchClaimsStore,
} from '../../../stores/dispatchClaimsStore';
import { notifyToast } from '../../../stores/notificationStore';
import { SlotCard } from './SlotCard';

interface RolesPanelProps {
	theme: Theme;
	projectPath: string | null;
	/** All Left Bar sessions — passed from RightPanel for the agent picker. */
	sessions: Session[];
	/** SSH remote ID of the active session (null = local). */
	activeRemoteId: string | null;
	/** Retained for prop compatibility. GitHub Project auto-discovery is disabled. */
	activeSshRemoteId?: string | null;
}

export function RolesPanel({
	theme,
	projectPath,
	sessions,
	activeRemoteId,
	activeSshRemoteId: _activeSshRemoteId,
}: RolesPanelProps) {
	const [slots, setSlots] = useState<ProjectRoleSlots>({});
	const activeClaims = useDispatchClaimsStore(selectClaimsForProject(projectPath));
	const [loading, setLoading] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [auditRunning, setAuditRunning] = useState(false);
	const [auditSummary, setAuditSummary] = useState<string | null>(null);

	// Load project role slots when projectPath changes
	useEffect(() => {
		if (!projectPath) {
			setSlots({});
			return;
		}
		setLoading(true);
		window.maestro.projectRoles
			.get(projectPath)
			.then((res) => {
				if (res.success) {
					setSlots(res.data as ProjectRoleSlots);
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [projectPath]);

	useEffect(() => {
		useDispatchClaimsStore.getState().initialize();
	}, []);

	const handleAssignmentChange = useCallback(
		(role: DispatchRole, assignment: RoleSlotAssignment | undefined) => {
			if (!projectPath) return;
			const next: ProjectRoleSlots = { ...slots };
			if (assignment) {
				next[role] = assignment;
			} else {
				delete next[role];
			}
			setSlots(next);
			setSaveError(null);
			window.maestro.projectRoles
				.set(projectPath, next)
				.then((res) => {
					if (!res.success) {
						setSaveError(res.error ?? 'Save failed');
					}
				})
				.catch((err: unknown) => {
					setSaveError(String(err));
				});
		},
		[projectPath, slots]
	);

	/**
	 * Find the busy claim info for a role slot.
	 * Matched by role name against the central dispatch claims store.
	 */
	function busyClaimForRole(role: DispatchRole): ActiveDispatchClaim | undefined {
		return activeClaims?.get(role);
	}

	const handleRunAudit = useCallback(() => {
		if (!projectPath || auditRunning) return;
		const auditRoleSlots = Object.fromEntries(
			Object.entries(slots).map(([role, assignment]) => [role, assignment.agentId])
		);
		setAuditRunning(true);
		setAuditSummary(null);
		window.maestro.pmAudit
			.run({
				projectPath,
				projectRoleSlots: auditRoleSlots,
				staleClaimMs: 5 * 60 * 1000,
			})
			.then((res) => {
				if (!res.success) {
					setAuditSummary('Audit failed');
					notifyToast({
						color: 'red',
						title: 'Project audit failed',
						message: res.error,
						dismissible: true,
					});
					return;
				}

				const { totalAudited, autoFixed, needsAttention, errors } = res.data;
				const summary = `${totalAudited} checked · ${autoFixed.length} fixed · ${needsAttention.length} attention · ${errors.length} errors`;
				setAuditSummary(summary);
				notifyToast({
					color: errors.length > 0 ? 'orange' : needsAttention.length > 0 ? 'yellow' : 'green',
					title: 'Project audit complete',
					message: summary,
					dismissible: needsAttention.length > 0 || errors.length > 0,
				});
			})
			.catch((err: unknown) => {
				const message = err instanceof Error ? err.message : String(err);
				setAuditSummary('Audit failed');
				notifyToast({
					color: 'red',
					title: 'Project audit failed',
					message,
					dismissible: true,
				});
			})
			.finally(() => setAuditRunning(false));
	}, [auditRunning, projectPath, slots]);

	if (!projectPath) {
		return (
			<div className="p-4">
				<p className="text-xs" style={{ color: theme.colors.textDim }}>
					Open a project to configure role slots.
				</p>
			</div>
		);
	}

	return (
		<div className="py-2">
			<div className="flex items-center justify-between mb-3 px-1">
				<span
					className="text-xs font-bold uppercase tracking-wide"
					style={{ color: theme.colors.textDim }}
				>
					Dev Crew Status
				</span>
				<div className="flex items-center gap-2">
					{loading && (
						<span className="text-[10px]" style={{ color: theme.colors.textDim }}>
							Loading…
						</span>
					)}
					<button
						type="button"
						className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium"
						style={{
							color: theme.colors.textMain,
							backgroundColor: `${theme.colors.textDim}18`,
							border: `1px solid ${theme.colors.textDim}35`,
							opacity: auditRunning ? 0.7 : 1,
						}}
						title="Audit this project's runners and Work Graph items"
						disabled={auditRunning}
						onClick={handleRunAudit}
					>
						{auditRunning ? (
							<Loader2 size={12} className="animate-spin" />
						) : (
							<ShieldCheck size={12} />
						)}
						<span>Audit</span>
					</button>
				</div>
			</div>

			{auditSummary && (
				<div className="mb-3 px-2 text-[10px]" style={{ color: theme.colors.textDim }}>
					Last audit: {auditSummary}
				</div>
			)}

			{saveError && (
				<div
					className="mb-3 px-3 py-2 rounded text-[10px]"
					style={{ backgroundColor: `${theme.colors.error}20`, color: theme.colors.error }}
				>
					{saveError}
				</div>
			)}

			{(DISPATCH_ROLES as DispatchRole[]).map((role) => (
				<SlotCard
					key={role}
					role={role}
					assignment={slots[role]}
					activeClaim={busyClaimForRole(role)}
					theme={theme}
					onAssignmentChange={handleAssignmentChange}
					sessions={sessions}
					activeProjectRoot={projectPath}
					activeRemoteId={activeRemoteId}
					readOnly
				/>
			))}

			<p className="text-[10px] mt-2 px-1" style={{ color: theme.colors.textDim }}>
				Role assignments are configured in Settings → Dev Teams. Busy state updates via live events
				from DispatchEngine (#444).
			</p>
		</div>
	);
}
