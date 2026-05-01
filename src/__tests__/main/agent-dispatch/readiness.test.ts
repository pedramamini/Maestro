import { describe, expect, it } from 'vitest';
import { deriveAgentDispatchReadiness, isDispatchReady } from '../../../main/agent-dispatch';

describe('deriveAgentDispatchReadiness', () => {
	it('distinguishes unavailable, connecting, paused, error, busy, idle, and ready', () => {
		expect(deriveAgentDispatchReadiness({ session: null })).toBe('unavailable');
		expect(deriveAgentDispatchReadiness({ session: { state: 'connecting' } })).toBe('connecting');
		expect(deriveAgentDispatchReadiness({ session: { state: 'idle' }, paused: true })).toBe(
			'paused'
		);
		expect(deriveAgentDispatchReadiness({ session: { state: 'error' } })).toBe('error');
		expect(deriveAgentDispatchReadiness({ session: { state: 'busy' } })).toBe('busy');
		expect(deriveAgentDispatchReadiness({ session: { state: 'idle' } })).toBe('idle');
		expect(deriveAgentDispatchReadiness({ session: { state: undefined } })).toBe('ready');
	});

	it('treats active process and saturated active claims as busy', () => {
		expect(deriveAgentDispatchReadiness({ session: { state: 'idle' }, processActive: true })).toBe(
			'busy'
		);
		expect(
			deriveAgentDispatchReadiness({
				session: { state: 'idle' },
				maxConcurrentClaims: 1,
				activeClaims: [
					{
						id: 'claim-1',
						workItemId: 'work-1',
						owner: { type: 'agent', id: 'agent-1' },
						status: 'active',
						source: 'auto-pickup',
						claimedAt: '2026-04-30T00:00:00.000Z',
					},
				],
			})
		).toBe('busy');
	});

	it('reports only ready and idle states as dispatch-ready', () => {
		expect(isDispatchReady('ready')).toBe(true);
		expect(isDispatchReady('idle')).toBe(true);
		expect(isDispatchReady('busy')).toBe(false);
		expect(isDispatchReady('paused')).toBe(false);
	});
});
