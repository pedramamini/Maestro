import { describe, it, expect } from 'vitest';
import {
	CURRENT_PROTOCOL_VERSION,
	type JsonRpcRequest,
	type JsonRpcResponse,
	type JsonRpcNotification,
	type ContentBlock,
	type ContentBlockFlat,
	type SessionUpdate,
	type ToolCallStatus,
	type StopReason,
} from '../../../main/acp/types';

describe('ACP Types', () => {
	describe('Protocol Version', () => {
		it('should have current protocol version defined', () => {
			expect(CURRENT_PROTOCOL_VERSION).toBe(1);
			expect(typeof CURRENT_PROTOCOL_VERSION).toBe('number');
		});
	});

	describe('JSON-RPC Types', () => {
		it('should allow valid JsonRpcRequest structure', () => {
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: { protocolVersion: 1 },
			};

			expect(request.jsonrpc).toBe('2.0');
			expect(request.id).toBe(1);
			expect(request.method).toBe('initialize');
		});

		it('should allow null id for notifications that became requests', () => {
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				id: null,
				method: 'session/cancel',
			};

			expect(request.id).toBeNull();
		});

		it('should allow string id', () => {
			const request: JsonRpcRequest = {
				jsonrpc: '2.0',
				id: 'uuid-123',
				method: 'test',
			};

			expect(request.id).toBe('uuid-123');
		});

		it('should allow valid JsonRpcResponse with result', () => {
			const response: JsonRpcResponse = {
				jsonrpc: '2.0',
				id: 1,
				result: { sessionId: 'test-123' },
			};

			expect(response.result).toEqual({ sessionId: 'test-123' });
			expect(response.error).toBeUndefined();
		});

		it('should allow valid JsonRpcResponse with error', () => {
			const response: JsonRpcResponse = {
				jsonrpc: '2.0',
				id: 1,
				error: {
					code: -32600,
					message: 'Invalid Request',
					data: { details: 'Missing method' },
				},
			};

			expect(response.error?.code).toBe(-32600);
			expect(response.error?.message).toBe('Invalid Request');
		});

		it('should allow valid JsonRpcNotification', () => {
			const notification: JsonRpcNotification = {
				jsonrpc: '2.0',
				method: 'session/update',
				params: { sessionId: 'test', update: {} },
			};

			expect(notification.method).toBe('session/update');
			expect(notification.params).toBeDefined();
		});
	});

	describe('ContentBlock Types', () => {
		it('should allow text content block (spec format)', () => {
			const block: ContentBlock = {
				text: {
					text: 'Hello, world!',
					annotations: { priority: 1 },
				},
			};

			expect('text' in block).toBe(true);
		});

		it('should allow image content block', () => {
			const block: ContentBlock = {
				image: {
					data: 'base64encodeddata',
					mimeType: 'image/png',
					uri: 'file:///path/to/image.png',
				},
			};

			expect('image' in block).toBe(true);
		});

		it('should allow resource_link content block', () => {
			const block: ContentBlock = {
				resource_link: {
					uri: 'file:///path/to/file.txt',
					name: 'file.txt',
					mimeType: 'text/plain',
					size: 1024,
				},
			};

			expect('resource_link' in block).toBe(true);
		});

		it('should allow embedded resource content block', () => {
			const block: ContentBlock = {
				resource: {
					resource: {
						uri: 'file:///test.txt',
						text: 'File contents',
						mimeType: 'text/plain',
					},
				},
			};

			expect('resource' in block).toBe(true);
		});
	});

	describe('ContentBlockFlat Types (OpenCode format)', () => {
		it('should allow flat text content block', () => {
			const block: ContentBlockFlat = {
				type: 'text',
				text: 'Hello from OpenCode!',
			};

			expect(block.type).toBe('text');
			expect(block.text).toBe('Hello from OpenCode!');
		});

		it('should allow flat image content block', () => {
			const block: ContentBlockFlat = {
				type: 'image',
				data: 'base64data',
				mimeType: 'image/jpeg',
			};

			expect(block.type).toBe('image');
		});

		it('should allow flat resource_link content block', () => {
			const block: ContentBlockFlat = {
				type: 'resource_link',
				uri: 'file:///path/to/file',
				name: 'file.txt',
			};

			expect(block.type).toBe('resource_link');
		});
	});

	describe('SessionUpdate Types', () => {
		it('should recognize agent_message_chunk update', () => {
			const update: SessionUpdate = {
				agent_message_chunk: {
					content: { text: { text: 'Response' } },
				},
			};

			expect('agent_message_chunk' in update).toBe(true);
		});

		it('should recognize tool_call update', () => {
			const update: SessionUpdate = {
				tool_call: {
					toolCallId: 'tc-123',
					title: 'Read File',
					kind: 'read',
					status: 'pending',
				},
			};

			expect('tool_call' in update).toBe(true);
		});

		it('should recognize plan update', () => {
			const update: SessionUpdate = {
				plan: {
					entries: [
						{ content: 'Step 1', priority: 'high', status: 'completed' },
						{ content: 'Step 2', priority: 'medium', status: 'pending' },
					],
				},
			};

			expect('plan' in update).toBe(true);
		});
	});

	describe('ToolCallStatus Values', () => {
		it('should accept valid tool call statuses', () => {
			const statuses: ToolCallStatus[] = ['pending', 'in_progress', 'completed', 'failed'];

			expect(statuses).toHaveLength(4);
			expect(statuses).toContain('pending');
			expect(statuses).toContain('in_progress');
			expect(statuses).toContain('completed');
			expect(statuses).toContain('failed');
		});
	});

	describe('StopReason Values', () => {
		it('should accept valid stop reasons', () => {
			const reasons: StopReason[] = [
				'end_turn',
				'max_tokens',
				'max_turn_requests',
				'refusal',
				'cancelled',
			];

			expect(reasons).toHaveLength(5);
			expect(reasons).toContain('end_turn');
			expect(reasons).toContain('cancelled');
		});
	});
});
