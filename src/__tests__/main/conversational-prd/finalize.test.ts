/**
 * src/__tests__/main/conversational-prd/finalize.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversationalPrdDraft, ConversationalPrdSession } from '../../../shared/conversational-prd-types';
import {
	ConversationalPrdService,
	ConversationalPrdAlreadyFinalizedError,
	ConversationalPrdNotReadyError,
} from '../../../main/conversational-prd/service';
import { InMemoryConversationalPrdStore } from '../../../main/conversational-prd/session-store';

function makeGateway() {
	return {
		respond: vi.fn().mockResolvedValue({
			messageToUser: 'How can I help?',
			prdDraftDelta: {},
			status: 'gathering' as const,
		}),
	};
}

function makePlannerService(prdId = 'prd-work-item-001') {
	return {
		createPrd: vi.fn().mockResolvedValue({ id: prdId }),
	} as unknown as import('../../../main/delivery-planner/planner-service').DeliveryPlannerService;
}

function makeReadySession(store: InMemoryConversationalPrdStore, draft: ConversationalPrdDraft = {}): ConversationalPrdSession {
	const session = store.create({ projectPath: '/proj', gitPath: '/proj' });
	store.updateStatus(session.conversationId, 'ready-to-finalize');
	if (Object.keys(draft).length > 0) {
		store.mergeDraft(session.conversationId, draft);
	}
	return store.get(session.conversationId)!;
}

describe('ConversationalPrdService.finalizeSession()', () => {
	let store: InMemoryConversationalPrdStore;
	let gateway: ReturnType<typeof makeGateway>;
	let plannerService: ReturnType<typeof makePlannerService>;
	let service: ConversationalPrdService;

	beforeEach(() => {
		store = new InMemoryConversationalPrdStore();
		gateway = makeGateway();
		plannerService = makePlannerService();
		service = new ConversationalPrdService(store, gateway, plannerService);
	});

	it('successfully finalizes a ready-to-finalize session', async () => {
		const session = makeReadySession(store, { title: 'My PRD', problem: 'Some problem' });
		const result = await service.finalizeSession({ conversationId: session.conversationId });
		expect(result.prdWorkItemId).toBe('prd-work-item-001');
		expect(result.session.status).toBe('finalized');
		expect(result.session.finalized).toBe(true);
		expect(result.session.prdWorkItemId).toBe('prd-work-item-001');
		expect(result.session.finalizedAt).toBeTruthy();
	});

	it('maps draft fields to createPrd() description', async () => {
		const session = makeReadySession(store, {
			title: 'Dashboard PRD',
			problem: "Users can not see their data.",
			users: 'Power users',
			successCriteria: 'NPS > 50',
		});
		await service.finalizeSession({ conversationId: session.conversationId });
		const call = (plannerService.createPrd as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(call.title).toBe('Dashboard PRD');
		expect(call.description).toContain('Users can not see their data.');
		expect(call.description).toContain('Power users');
		expect(call.description).toContain('NPS > 50');
		expect(call.tags).toContain('conversational-prd');
	});

	it('uses "Untitled PRD" when draft has no title', async () => {
		const session = makeReadySession(store, { problem: 'Unknown problem' });
		await service.finalizeSession({ conversationId: session.conversationId });
		const call = (plannerService.createPrd as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(call.title).toBe('Untitled PRD');
	});

	it('throws ConversationalPrdNotReadyError when session status is "active"', async () => {
		const session = store.create({ projectPath: '/proj', gitPath: '/proj' });
		await expect(
			service.finalizeSession({ conversationId: session.conversationId })
		).rejects.toThrow(ConversationalPrdNotReadyError);
	});

	it('ConversationalPrdNotReadyError message includes current status', async () => {
		const session = store.create({ projectPath: '/proj', gitPath: '/proj' });
		await expect(
			service.finalizeSession({ conversationId: session.conversationId })
		).rejects.toThrow('active');
	});

	it('throws ConversationalPrdAlreadyFinalizedError on double-finalize', async () => {
		const session = makeReadySession(store);
		await service.finalizeSession({ conversationId: session.conversationId });
		await expect(
			service.finalizeSession({ conversationId: session.conversationId })
		).rejects.toThrow(ConversationalPrdAlreadyFinalizedError);
	});

	it('throws when no plannerService is injected', async () => {
		const serviceWithoutPlanner = new ConversationalPrdService(store, gateway);
		const session = makeReadySession(store);
		await expect(
			serviceWithoutPlanner.finalizeSession({ conversationId: session.conversationId })
		).rejects.toThrow('plannerService is required');
	});
});
