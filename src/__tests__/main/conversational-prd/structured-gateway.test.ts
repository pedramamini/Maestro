/**
 * StructuredConversationalPrdGateway — determinism tests
 */

import { describe, it, expect } from 'vitest';

import { StructuredConversationalPrdGateway } from '../../../main/conversational-prd/structured-gateway';
import type { ConversationalPrdGatewayRequest } from '../../../main/conversational-prd/gateway';
import type { ConversationalPrdMessage } from '../../../shared/conversational-prd-types';

const gateway = new StructuredConversationalPrdGateway();

function makeHistory(userMessages: string[]): ConversationalPrdMessage[] {
	const history: ConversationalPrdMessage[] = [];
	for (const msg of userMessages) {
		history.push({
			id: crypto.randomUUID(),
			role: 'user' as const,
			content: msg,
			createdAt: new Date().toISOString(),
		});
		history.push({
			id: crypto.randomUUID(),
			role: 'assistant' as const,
			content: 'placeholder',
			createdAt: new Date().toISOString(),
		});
	}
	return history;
}

function buildRequest(
	userMessage: string,
	priorUserMessages: string[] = []
): ConversationalPrdGatewayRequest {
	return {
		systemPrompt: 'System prompt here',
		history: makeHistory(priorUserMessages),
		userMessage,
	};
}

describe('StructuredConversationalPrdGateway', () => {
	it('first turn captures problem and asks about users', async () => {
		const response = await gateway.respond(buildRequest('Users lose track of running agents'));

		expect(response.status).toBe('gathering');
		expect(response.prdDraftDelta.problem).toBe('Users lose track of running agents');
		expect(response.messageToUser).toMatch(/users/i);
	});

	it('second turn captures users and asks about success criteria', async () => {
		const response = await gateway.respond(
			buildRequest('Solo developers using Maestro', ['Users lose track of running agents'])
		);

		expect(response.status).toBe('gathering');
		expect(response.prdDraftDelta.users).toBe('Solo developers using Maestro');
		expect(response.messageToUser).toMatch(/success criteria/i);
		expect(response.prdDraftDelta.problem).toBeUndefined();
	});

	it('third turn captures successCriteria and asks about scope', async () => {
		const response = await gateway.respond(
			buildRequest('Agent status visible at a glance', ['problem text', 'users text'])
		);

		expect(response.status).toBe('gathering');
		expect(response.prdDraftDelta.successCriteria).toBe('Agent status visible at a glance');
		expect(response.messageToUser).toMatch(/scope/i);
	});

	it('fourth turn captures scope and asks about constraints', async () => {
		const response = await gateway.respond(
			buildRequest('Status badges on agent cards', [
				'problem text',
				'users text',
				'success criteria text',
			])
		);

		expect(response.status).toBe('gathering');
		expect(response.prdDraftDelta.scope).toBe('Status badges on agent cards');
		expect(response.messageToUser).toMatch(/constraint/i);
	});

	it('fifth turn with "none" constraints emits ready-to-finalize', async () => {
		const response = await gateway.respond(
			buildRequest('none', ['problem text', 'users text', 'success criteria text', 'scope text'])
		);

		expect(response.status).toBe('ready-to-finalize');
		expect(response.prdDraftDelta.constraints).toBeUndefined();
		expect(response.prdDraftDelta.title).toBeTruthy();
	});

	it('fifth turn with real constraints captures them and emits ready-to-finalize', async () => {
		const response = await gateway.respond(
			buildRequest('Must work offline', [
				'problem text',
				'users text',
				'success criteria text',
				'scope text',
			])
		);

		expect(response.status).toBe('ready-to-finalize');
		expect(response.prdDraftDelta.constraints).toBe('Must work offline');
	});

	it('returns a non-empty messageToUser on every turn', async () => {
		for (let turn = 0; turn < 6; turn++) {
			const priorTurns = Array.from({ length: turn }, (_, i) => `message ${i}`);
			const response = await gateway.respond(buildRequest(`message ${turn}`, priorTurns));
			expect(typeof response.messageToUser).toBe('string');
			expect(response.messageToUser.length).toBeGreaterThan(0);
		}
	});
});
