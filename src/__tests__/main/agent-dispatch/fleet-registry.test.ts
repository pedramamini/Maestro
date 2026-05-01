import { describe, expect, it, vi } from 'vitest';
import { FleetRegistry, buildFleetEntries } from '../../../main/agent-dispatch';
import type { AgentDefinition } from '../../../main/agents/definitions';
import type { AgentDispatchProfile } from '../../../shared/agent-dispatch-types';
import type { WorkItemClaim } from '../../../shared/work-graph-types';
import type { StoredSession } from '../../../main/stores/types';

const now = new Date('2026-04-30T12:00:00.000Z');

const claudeDefinition: AgentDefinition = {
	id: 'claude-code',
	name: 'Claude Code',
	binaryName: 'claude',
	command: 'claude',
	args: [],
	dispatchSuggestedDefaults: {
		capabilityTags: ['typescript'],
		maxConcurrentClaims: 2,
	},
};

const dispatchProfile: AgentDispatchProfile = {
	autoPickupEnabled: true,
	capabilityTags: ['typescript', 'tests'],
	maxConcurrentClaims: 2,
};

function session(overrides: Partial<StoredSession> = {}): StoredSession {
	return {
		id: 'session-1',
		name: 'Agent One',
		toolType: 'claude-code',
		state: 'idle',
		cwd: '/repo',
		projectRoot: '/repo',
		...overrides,
	};
}

function claim(id: string, ownerId = 'session-1'): WorkItemClaim {
	return {
		id,
		workItemId: `work-${id}`,
		owner: { type: 'agent', id: ownerId, name: 'Agent One', agentId: 'claude-code' },
		status: 'active',
		source: 'auto-pickup',
		claimedAt: '2026-04-30T00:00:00.000Z',
	};
}

describe('buildFleetEntries', () => {
	it('normalizes session, provider, dispatch, claims, and pickup fields', () => {
		const [entry] = buildFleetEntries({
			sessions: [
				session({
					aiTabs: [{ id: 'tab-1', agentSessionId: 'provider-session-1' }],
					activeTabId: 'tab-1',
				}),
			],
			agentDefinitions: [claudeDefinition],
			dispatchProfiles: { 'claude-code': dispatchProfile },
			dispatchSettings: {
				globalAutoPickupEnabled: true,
				projectAutoPickupEnabled: {},
				sshRemoteAutoPickupEnabled: {},
			},
			activeClaims: [claim('claim-1')],
			now,
		});

		expect(entry).toMatchObject({
			id: 'session-1',
			agentId: 'claude-code',
			sessionId: 'session-1',
			providerSessionId: 'provider-session-1',
			displayName: 'Agent One',
			providerType: 'claude-code',
			host: 'local',
			locality: 'local',
			readiness: 'idle',
			currentLoad: 1,
			dispatchCapabilities: ['typescript', 'tests'],
			pickupEnabled: true,
			updatedAt: now.toISOString(),
		});
		expect(entry.currentClaims).toHaveLength(1);
	});

	it('marks saturated active claims as busy', () => {
		const [entry] = buildFleetEntries({
			sessions: [session()],
			dispatchProfiles: {
				'claude-code': { ...dispatchProfile, maxConcurrentClaims: 1 },
			},
			activeClaims: [claim('claim-1')],
			now,
		});

		expect(entry.readiness).toBe('busy');
		expect(entry.currentLoad).toBe(1);
	});

	it('uses session.sshRemoteId before sessionSshRemoteConfig remoteId fallback', () => {
		const [entry] = buildFleetEntries({
			sessions: [
				session({
					sshRemoteId: 'primary-remote',
					sessionSshRemoteConfig: {
						enabled: true,
						remoteId: 'fallback-remote',
						workingDirOverride: '/remote/repo',
					},
				}),
			],
			sshRemotes: [
				{
					id: 'primary-remote',
					name: 'Primary',
					host: 'primary.example.com',
					enabled: true,
				} as any,
				{
					id: 'fallback-remote',
					name: 'Fallback',
					host: 'fallback.example.com',
					enabled: true,
				} as any,
			],
			now,
		});

		expect(entry.locality).toBe('ssh');
		expect(entry.host).toBe('primary.example.com');
		expect(entry.sshRemote).toMatchObject({
			id: 'primary-remote',
			name: 'Primary',
			source: 'session.sshRemoteId',
			workingDirOverride: '/remote/repo',
		});
	});

	it('falls back to session.sessionSshRemoteConfig remote identity', () => {
		const [entry] = buildFleetEntries({
			sessions: [
				session({
					sessionSshRemoteConfig: {
						enabled: true,
						remoteId: 'fallback-remote',
					},
				}),
			],
			sshRemotes: [
				{
					id: 'fallback-remote',
					name: 'Fallback',
					host: 'fallback.example.com',
					enabled: true,
				} as any,
			],
			now,
		});

		expect(entry.host).toBe('fallback.example.com');
		expect(entry.sshRemote?.source).toBe('session.sessionSshRemoteConfig.remoteId');
	});
});

describe('FleetRegistry', () => {
	it('emits typed dispatch events and work graph-compatible broadcasts on readiness changes', () => {
		const publishWorkGraphEvent = vi.fn();
		const registry = new FleetRegistry({ publishWorkGraphEvent });
		const readinessListener = vi.fn();
		registry.on('agentDispatch.agent.readinessChanged', readinessListener);

		registry.refresh({ sessions: [session({ state: 'idle' })], now });
		registry.refresh({ sessions: [session({ state: 'busy' })], now });

		expect(readinessListener).toHaveBeenCalledTimes(1);
		expect(readinessListener.mock.calls[0][0].entry.readiness).toBe('busy');
		expect(publishWorkGraphEvent).toHaveBeenCalledWith(
			'agentDispatch.agent.readinessChanged',
			expect.objectContaining({
				event: expect.objectContaining({ type: 'agentDispatch.agent.readinessChanged' }),
			})
		);
	});

	it('applies explicit pause state before session readiness', () => {
		const registry = new FleetRegistry();
		registry.refresh({ sessions: [session({ state: 'idle' })], now });
		registry.pause('session-1');

		const [entry] = registry.refresh({ sessions: [session({ state: 'idle' })], now });

		expect(entry.readiness).toBe('paused');
	});

	it('does not emit fleet changes for updatedAt-only snapshot changes', () => {
		const registry = new FleetRegistry();
		const fleetListener = vi.fn();
		registry.on('agentDispatch.fleet.changed', fleetListener);

		registry.refresh({ sessions: [session({ state: 'idle' })], now });
		registry.refresh({
			sessions: [session({ state: 'idle' })],
			now: new Date('2026-04-30T12:01:00.000Z'),
		});

		expect(fleetListener).toHaveBeenCalledTimes(1);
	});
});
