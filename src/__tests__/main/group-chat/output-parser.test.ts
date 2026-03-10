/**
 * @file output-parser.test.ts
 * @description Unit tests for group chat output parsing utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the parsers module before importing the output-parser
vi.mock('../../../main/parsers', () => ({
	getOutputParser: vi.fn(),
}));

// Mock the logger to avoid console noise
vi.mock('../../../main/utils/logger', () => ({
	logger: {
		warn: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

import {
	extractTextGeneric,
	extractTextFromAgentOutput,
	extractTextFromStreamJson,
} from '../../../main/group-chat/output-parser';
import { getOutputParser } from '../../../main/parsers';

describe('group-chat/output-parser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('extractTextGeneric', () => {
		it('should return raw output if not JSONL format', () => {
			const plainText = 'This is plain text output';
			expect(extractTextGeneric(plainText)).toBe(plainText);
		});

		it('should extract result field from JSON', () => {
			const jsonOutput = '{"result": "This is the result"}';
			expect(extractTextGeneric(jsonOutput)).toBe('This is the result');
		});

		it('should extract text field from JSON', () => {
			const jsonOutput = '{"text": "Some text content"}';
			expect(extractTextGeneric(jsonOutput)).toBe('Some text content');
		});

		it('should extract part.text field from JSON', () => {
			const jsonOutput = '{"part": {"text": "Nested text content"}}';
			expect(extractTextGeneric(jsonOutput)).toBe('Nested text content');
		});

		it('should extract message.content field from JSON', () => {
			const jsonOutput = '{"message": {"content": "Message content"}}';
			expect(extractTextGeneric(jsonOutput)).toBe('Message content');
		});

		it('should handle multiple JSONL lines', () => {
			const jsonlOutput = ['{"text": "Line 1"}', '{"text": "Line 2"}', '{"text": "Line 3"}'].join(
				'\n'
			);
			expect(extractTextGeneric(jsonlOutput)).toBe('Line 1\nLine 2\nLine 3');
		});

		it('should prefer result over text parts', () => {
			const jsonlOutput = [
				'{"text": "Streaming part 1"}',
				'{"text": "Streaming part 2"}',
				'{"result": "Final result"}',
			].join('\n');
			// result should be returned immediately when found
			expect(extractTextGeneric(jsonlOutput)).toBe('Final result');
		});

		it('should handle empty lines in JSONL', () => {
			const jsonlOutput = ['{"text": "Line 1"}', '', '{"text": "Line 2"}'].join('\n');
			expect(extractTextGeneric(jsonlOutput)).toBe('Line 1\nLine 2');
		});

		it('should skip lines with session_id when in JSON context', () => {
			// Note: The first non-empty line must start with '{' for JSONL processing
			// If first line doesn't start with '{', raw output is returned as-is
			const jsonlOutput = [
				'{"text": "Actual content"}',
				'session_id: abc123', // This line would be skipped in the catch block
			].join('\n');
			expect(extractTextGeneric(jsonlOutput)).toBe('Actual content');
		});

		it('should return raw output if first line is not JSON', () => {
			const rawOutput = ['session_id: abc123', '{"text": "Actual content"}'].join('\n');
			// When first non-empty line doesn't start with '{', returns raw output
			expect(extractTextGeneric(rawOutput)).toBe(rawOutput);
		});

		it('should handle invalid JSON gracefully', () => {
			const mixedOutput = [
				'{"text": "Valid JSON"}',
				'This is not JSON',
				'{"text": "More valid JSON"}',
			].join('\n');
			// Invalid JSON lines that don't start with '{' are included as content
			// Lines starting with '{' that fail to parse are skipped
			const result = extractTextGeneric(mixedOutput);
			expect(result).toContain('Valid JSON');
			expect(result).toContain('More valid JSON');
		});

		it('should handle non-string message.content', () => {
			const jsonOutput = '{"message": {"content": 123}}';
			// Should not include non-string content
			expect(extractTextGeneric(jsonOutput)).toBe('');
		});
	});

	describe('extractTextFromAgentOutput', () => {
		it('should use generic extraction when no parser found', () => {
			vi.mocked(getOutputParser).mockReturnValue(null);
			const output = '{"result": "Generic result"}';
			expect(extractTextFromAgentOutput(output, 'unknown-agent')).toBe('Generic result');
		});

		it('should return raw output if not JSONL format', () => {
			const mockParser = {
				parseJsonLine: vi.fn(),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);

			const plainText = 'Plain text output';
			expect(extractTextFromAgentOutput(plainText, 'claude-code')).toBe(plainText);
			expect(mockParser.parseJsonLine).not.toHaveBeenCalled();
		});

		it('should use parser to extract result events', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					const parsed = JSON.parse(line);
					if (parsed.type === 'result') {
						return { type: 'result', text: parsed.result };
					}
					return null;
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);

			const jsonlOutput = '{"type": "result", "result": "Final answer"}';
			expect(extractTextFromAgentOutput(jsonlOutput, 'claude-code')).toBe('Final answer');
		});

		it('should concatenate text events when no result', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const parsed = JSON.parse(line);
						if (parsed.type === 'text') {
							return { type: 'text', text: parsed.text };
						}
					} catch {
						return null;
					}
					return null;
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);

			const jsonlOutput = [
				'{"type": "text", "text": "Part 1"}',
				'{"type": "text", "text": "Part 2"}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonlOutput, 'claude-code')).toBe('Part 1\nPart 2');
		});

		it('should prefer result over text events', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const parsed = JSON.parse(line);
						if (parsed.type === 'result') {
							return { type: 'result', text: parsed.result };
						}
						if (parsed.type === 'text') {
							return { type: 'text', text: parsed.text };
						}
					} catch {
						return null;
					}
					return null;
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);

			const jsonlOutput = [
				'{"type": "text", "text": "Streaming..."}',
				'{"type": "result", "result": "Complete result"}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonlOutput, 'claude-code')).toBe('Complete result');
		});

		it('should skip lines that parser returns null for', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const parsed = JSON.parse(line);
						if (parsed.type === 'text') {
							return { type: 'text', text: parsed.text };
						}
					} catch {
						return null;
					}
					return null; // Skip other event types
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);

			const jsonlOutput = [
				'{"type": "system", "data": "ignored"}',
				'{"type": "text", "text": "Visible content"}',
				'{"type": "tool", "name": "ignored"}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonlOutput, 'claude-code')).toBe('Visible content');
		});
	});

	describe('extractTextFromStreamJson', () => {
		it('should use agent-specific extraction when agentType provided', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					const parsed = JSON.parse(line);
					return { type: 'result', text: parsed.result };
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);

			const output = '{"result": "Agent result"}';
			expect(extractTextFromStreamJson(output, 'claude-code')).toBe('Agent result');
			expect(getOutputParser).toHaveBeenCalledWith('claude-code');
		});

		it('should use generic extraction when no agentType', () => {
			const output = '{"result": "Generic result"}';
			expect(extractTextFromStreamJson(output)).toBe('Generic result');
			expect(getOutputParser).not.toHaveBeenCalled();
		});

		it('should use generic extraction when agentType is undefined', () => {
			const output = '{"text": "Some text"}';
			expect(extractTextFromStreamJson(output, undefined)).toBe('Some text');
			expect(getOutputParser).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// Agent-specific NDJSON format tests
	// =========================================================================

	describe('Gemini NDJSON extraction', () => {
		function geminiParser() {
			return {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'init') {
							return { type: 'init' as const, sessionId: msg.session_id, text: '' };
						}
						if (msg.type === 'message' && msg.role === 'assistant') {
							return {
								type: 'text' as const,
								text: msg.content || '',
								isPartial: !!msg.delta,
							};
						}
						if (msg.type === 'tool_use') {
							return {
								type: 'tool_use' as const,
								toolName: msg.tool_name,
								toolState: { id: msg.tool_id, status: 'running', input: msg.parameters },
							};
						}
						if (msg.type === 'tool_result') {
							return {
								type: 'tool_use' as const,
								toolName: msg.tool_id,
								toolState: { id: msg.tool_id, status: msg.status, output: msg.output },
							};
						}
						if (msg.type === 'error') {
							return { type: 'error' as const, text: msg.message };
						}
						if (msg.type === 'result') {
							return {
								type: 'result' as const,
								text: msg.text,
								usage: msg.usage
									? {
											inputTokens: msg.usage.input_tokens || 0,
											outputTokens: msg.usage.output_tokens || 0,
										}
									: undefined,
							};
						}
						return null;
					} catch {
						return null;
					}
				}),
			};
		}

		it('should extract text from Gemini assistant message events', () => {
			vi.mocked(getOutputParser).mockReturnValue(geminiParser() as any);
			const ndjson = [
				'{"type":"init","session_id":"gem-123"}',
				'{"type":"message","role":"assistant","content":"Hello from Gemini"}',
			].join('\n');
			expect(extractTextFromAgentOutput(ndjson, 'gemini-cli')).toBe('Hello from Gemini');
		});

		it('should extract result from Gemini result event over text events', () => {
			vi.mocked(getOutputParser).mockReturnValue(geminiParser() as any);
			const ndjson = [
				'{"type":"message","role":"assistant","content":"Streaming chunk","delta":true}',
				'{"type":"message","role":"assistant","content":"Another chunk","delta":true}',
				'{"type":"result","text":"Complete Gemini response","usage":{"input_tokens":100,"output_tokens":50}}',
			].join('\n');
			expect(extractTextFromAgentOutput(ndjson, 'gemini-cli')).toBe('Complete Gemini response');
		});

		it('should concatenate partial Gemini text events when no result', () => {
			vi.mocked(getOutputParser).mockReturnValue(geminiParser() as any);
			const ndjson = [
				'{"type":"message","role":"assistant","content":"Part A","delta":true}',
				'{"type":"message","role":"assistant","content":"Part B","delta":true}',
			].join('\n');
			expect(extractTextFromAgentOutput(ndjson, 'gemini-cli')).toBe('Part A\nPart B');
		});

		it('should skip Gemini tool_use and tool_result events (no text)', () => {
			vi.mocked(getOutputParser).mockReturnValue(geminiParser() as any);
			const ndjson = [
				'{"type":"message","role":"assistant","content":"Before tool"}',
				'{"type":"tool_use","tool_name":"read_file","tool_id":"t1","parameters":{"path":"foo.ts"}}',
				'{"type":"tool_result","tool_id":"t1","status":"success","output":"file contents"}',
				'{"type":"message","role":"assistant","content":"After tool"}',
			].join('\n');
			expect(extractTextFromAgentOutput(ndjson, 'gemini-cli')).toBe('Before tool\nAfter tool');
		});
	});

	describe('Claude Code output', () => {
		function claudeParser() {
			return {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'system' && msg.subtype === 'init') {
							return {
								type: 'init' as const,
								sessionId: msg.session_id,
								slashCommands: msg.slash_commands,
							};
						}
						if (msg.type === 'assistant') {
							const content = msg.message?.content;
							if (typeof content === 'string') {
								return { type: 'text' as const, text: content, isPartial: true };
							}
							if (Array.isArray(content)) {
								const textBlocks = content
									.filter((b: any) => b.type === 'text')
									.map((b: any) => b.text);
								return {
									type: 'text' as const,
									text: textBlocks.join(''),
									isPartial: true,
								};
							}
							return null;
						}
						if (msg.type === 'result') {
							return {
								type: 'result' as const,
								text: msg.result,
								usage: msg.usage
									? {
											inputTokens: msg.usage.input_tokens || 0,
											outputTokens: msg.usage.output_tokens || 0,
										}
									: undefined,
							};
						}
						return null;
					} catch {
						return null;
					}
				}),
			};
		}

		it('should extract text from Claude assistant message with string content', () => {
			vi.mocked(getOutputParser).mockReturnValue(claudeParser() as any);
			const jsonl = [
				'{"type":"system","subtype":"init","session_id":"s-abc"}',
				'{"type":"assistant","message":{"content":"Claude says hello"}}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'claude-code')).toBe('Claude says hello');
		});

		it('should extract text from Claude assistant content blocks', () => {
			vi.mocked(getOutputParser).mockReturnValue(claudeParser() as any);
			const jsonl = [
				'{"type":"assistant","message":{"content":[{"type":"text","text":"Block 1"},{"type":"text","text":" Block 2"}]}}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'claude-code')).toBe('Block 1 Block 2');
		});

		it('should prefer Claude result over streaming assistant events', () => {
			vi.mocked(getOutputParser).mockReturnValue(claudeParser() as any);
			const jsonl = [
				'{"type":"assistant","message":{"content":"Partial..."}}',
				'{"type":"result","result":"Final Claude result","usage":{"input_tokens":200,"output_tokens":80}}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'claude-code')).toBe('Final Claude result');
		});
	});

	describe('Codex output', () => {
		function codexParser() {
			return {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'thread.started') {
							return { type: 'init' as const, sessionId: msg.thread_id };
						}
						if (msg.type === 'item.completed' && msg.item) {
							if (msg.item.type === 'agent_message') {
								return { type: 'result' as const, text: msg.item.text };
							}
							if (msg.item.type === 'reasoning') {
								return {
									type: 'text' as const,
									text: msg.item.text,
									isPartial: true,
								};
							}
							if (msg.item.type === 'tool_call') {
								return {
									type: 'tool_use' as const,
									toolName: msg.item.tool,
									toolState: { status: 'running', input: msg.item.args },
								};
							}
						}
						if (msg.type === 'turn.completed' && msg.usage) {
							return {
								type: 'usage' as const,
								usage: {
									inputTokens: msg.usage.input_tokens || 0,
									outputTokens: msg.usage.output_tokens || 0,
								},
							};
						}
						if (msg.type === 'turn.failed') {
							return { type: 'error' as const, text: msg.error || 'Turn failed' };
						}
						return null;
					} catch {
						return null;
					}
				}),
			};
		}

		it('should extract text from Codex agent_message item', () => {
			vi.mocked(getOutputParser).mockReturnValue(codexParser() as any);
			const jsonl = [
				'{"type":"thread.started","thread_id":"t-xyz"}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"Codex response"}}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'codex')).toBe('Codex response');
		});

		it('should skip Codex tool_call items and extract agent_message', () => {
			vi.mocked(getOutputParser).mockReturnValue(codexParser() as any);
			const jsonl = [
				'{"type":"item.completed","item":{"type":"tool_call","tool":"shell","args":"ls"}}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"Done listing files"}}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'codex')).toBe('Done listing files');
		});

		it('should concatenate Codex reasoning items when no agent_message', () => {
			vi.mocked(getOutputParser).mockReturnValue(codexParser() as any);
			const jsonl = [
				'{"type":"item.completed","item":{"type":"reasoning","text":"Thinking step 1"}}',
				'{"type":"item.completed","item":{"type":"reasoning","text":"Thinking step 2"}}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'codex')).toBe('Thinking step 1\nThinking step 2');
		});
	});

	describe('empty output', () => {
		it('should return empty string for empty input', () => {
			expect(extractTextGeneric('')).toBe('');
		});

		it('should return empty string for whitespace-only input', () => {
			// Whitespace-only lines: first non-empty line is undefined (all trim to ''),
			// so the JSONL check sees no first line starting with '{' → returns raw.
			// But actually all lines trim() to '' so firstNonEmptyLine is undefined,
			// and the condition !firstNonEmptyLine.trim().startsWith('{') is skipped.
			// Lines iterate: all trim to empty → skipped → empty result
			expect(extractTextGeneric('   \n   \n   ')).toBe('');
		});

		it('should return empty string for parser with empty JSONL input', () => {
			const mockParser = { parseJsonLine: vi.fn().mockReturnValue(null) };
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			expect(extractTextFromAgentOutput('', 'claude-code')).toBe('');
		});

		it('should return empty when parser produces no text or result events', () => {
			const mockParser = {
				parseJsonLine: vi.fn().mockReturnValue({ type: 'system' as const }),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const jsonl = '{"type":"system","data":"init"}';
			expect(extractTextFromAgentOutput(jsonl, 'claude-code')).toBe('');
		});

		it('should return empty for JSONL lines with only empty text values', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						return { type: 'text' as const, text: msg.text };
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			// text fields are empty strings — empty string is falsy, so not pushed
			const jsonl = ['{"text":""}', '{"text":""}'].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'test-agent')).toBe('');
		});
	});

	describe('malformed JSON', () => {
		it('should handle truncated JSON lines via generic parser', () => {
			const malformed = [
				'{"text": "Valid line"}',
				'{"text": "Truncated',
				'{"text": "After truncation"}',
			].join('\n');
			const result = extractTextGeneric(malformed);
			expect(result).toContain('Valid line');
			expect(result).toContain('After truncation');
		});

		it('should handle completely garbled JSON via generic parser', () => {
			const garbled = ['{not json at all}', '{{double braces}}', '{"]bad["}'].join('\n');
			// First line starts with '{' so JSONL mode is entered;
			// all fail to parse and start with '{' so they are skipped
			expect(extractTextGeneric(garbled)).toBe('');
		});

		it('should handle malformed lines gracefully with agent parser', () => {
			const mockParser = {
				parseJsonLine: vi.fn().mockReturnValue(null),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const garbled = '{"broken": json}\n{also bad}\n{"type":"text"';
			const result = extractTextFromAgentOutput(garbled, 'claude-code');
			// Parser returns null for all lines, so empty
			expect(result).toBe('');
			expect(mockParser.parseJsonLine).toHaveBeenCalledTimes(3);
		});

		it('should recover from interleaved valid and malformed JSON', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'text') return { type: 'text' as const, text: msg.text };
					} catch {
						return null;
					}
					return null;
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const mixed = [
				'{"type":"text","text":"Good 1"}',
				'{broken json',
				'{"type":"text","text":"Good 2"}',
				'totally not json',
				'{"type":"text","text":"Good 3"}',
			].join('\n');
			expect(extractTextFromAgentOutput(mixed, 'claude-code')).toBe('Good 1\nGood 2\nGood 3');
		});
	});

	describe('mixed content types', () => {
		it('should extract text while ignoring tool_use, usage, and system events', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						const typeMap: Record<string, string> = {
							init: 'init',
							text: 'text',
							tool_use: 'tool_use',
							usage: 'usage',
							system: 'system',
							result: 'result',
						};
						const mapped = typeMap[msg.type] || 'system';
						return { type: mapped as any, text: msg.text, toolName: msg.tool };
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const jsonl = [
				'{"type":"init","text":""}',
				'{"type":"text","text":"Intro paragraph"}',
				'{"type":"tool_use","tool":"read_file","text":""}',
				'{"type":"system","text":""}',
				'{"type":"text","text":"Explanation"}',
				'{"type":"usage","text":""}',
				'{"type":"result","text":"Final answer"}',
			].join('\n');
			// result takes precedence
			expect(extractTextFromAgentOutput(jsonl, 'test-agent')).toBe('Final answer');
		});

		it('should concatenate multiple text events when mixed with non-text (no result)', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						return { type: msg.type as any, text: msg.text || undefined };
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const jsonl = [
				'{"type":"text","text":"Step 1"}',
				'{"type":"tool_use","text":""}',
				'{"type":"text","text":"Step 2"}',
				'{"type":"system","text":""}',
				'{"type":"text","text":"Step 3"}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'test-agent')).toBe('Step 1\nStep 2\nStep 3');
		});
	});

	describe('tool call output', () => {
		it('should not include tool_use events in extracted text', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'tool_use') {
							return {
								type: 'tool_use' as const,
								toolName: msg.name,
								toolState: { status: msg.status, input: msg.input },
							};
						}
						if (msg.type === 'text') return { type: 'text' as const, text: msg.text };
						return null;
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const jsonl = [
				'{"type":"tool_use","name":"execute_shell","status":"running","input":"ls"}',
				'{"type":"tool_use","name":"execute_shell","status":"complete","input":"ls"}',
				'{"type":"text","text":"The directory contains 5 files."}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'test-agent')).toBe(
				'The directory contains 5 files.'
			);
		});

		it('should return empty when output contains only tool calls', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						return {
							type: 'tool_use' as const,
							toolName: msg.name,
							toolState: { status: 'complete' },
						};
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const jsonl = [
				'{"name":"read_file","path":"foo.ts"}',
				'{"name":"write_file","path":"bar.ts"}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'test-agent')).toBe('');
		});
	});

	describe('partial streaming', () => {
		it('should concatenate streaming text chunks without result', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'text') {
							return { type: 'text' as const, text: msg.text, isPartial: true };
						}
						return null;
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const chunks = [
				'{"type":"text","text":"Hello "}',
				'{"type":"text","text":"world, "}',
				'{"type":"text","text":"how are you?"}',
			].join('\n');
			expect(extractTextFromAgentOutput(chunks, 'test-agent')).toBe(
				'Hello \nworld, \nhow are you?'
			);
		});

		it('should override streaming chunks when final result arrives', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'text')
							return { type: 'text' as const, text: msg.text, isPartial: true };
						if (msg.type === 'result') return { type: 'result' as const, text: msg.text };
						return null;
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const jsonl = [
				'{"type":"text","text":"Chunk A"}',
				'{"type":"text","text":"Chunk B"}',
				'{"type":"result","text":"Complete: Chunk A Chunk B"}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'test-agent')).toBe('Complete: Chunk A Chunk B');
		});

		it('should handle single-chunk partial stream', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						return { type: 'text' as const, text: msg.text, isPartial: true };
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const jsonl = '{"type":"text","text":"Only chunk"}';
			expect(extractTextFromAgentOutput(jsonl, 'test-agent')).toBe('Only chunk');
		});
	});

	describe('error events', () => {
		it('should not extract error event text as output text', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'error') return { type: 'error' as const, text: msg.message };
						if (msg.type === 'text') return { type: 'text' as const, text: msg.text };
						return null;
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const jsonl = [
				'{"type":"text","text":"Some output"}',
				'{"type":"error","message":"Rate limit exceeded"}',
			].join('\n');
			// error events have type 'error', not 'text' or 'result', so excluded
			expect(extractTextFromAgentOutput(jsonl, 'test-agent')).toBe('Some output');
		});

		it('should return empty when output contains only error events', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						return { type: 'error' as const, text: msg.message };
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);
			const jsonl = [
				'{"type":"error","message":"Connection failed"}',
				'{"type":"error","message":"Retry exhausted"}',
			].join('\n');
			expect(extractTextFromAgentOutput(jsonl, 'test-agent')).toBe('');
		});

		it('should handle error events via generic parser (no text/result fields)', () => {
			const jsonl = ['{"type":"error","message":"Something broke","severity":"fatal"}'].join('\n');
			// Generic parser checks text, part.text, message.content, result — none match
			expect(extractTextGeneric(jsonl)).toBe('');
		});
	});

	describe('very long output', () => {
		it('should handle output with many NDJSON lines', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						if (msg.type === 'text') return { type: 'text' as const, text: msg.text };
						if (msg.type === 'result') return { type: 'result' as const, text: msg.text };
						return null;
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);

			const lines: string[] = [];
			for (let i = 0; i < 1000; i++) {
				lines.push(`{"type":"text","text":"Line ${i}"}`);
			}
			lines.push('{"type":"result","text":"Final result after 1000 lines"}');
			const result = extractTextFromAgentOutput(lines.join('\n'), 'test-agent');
			expect(result).toBe('Final result after 1000 lines');
		});

		it('should concatenate many text chunks without result', () => {
			const mockParser = {
				parseJsonLine: vi.fn((line: string) => {
					try {
						const msg = JSON.parse(line);
						return { type: 'text' as const, text: msg.text };
					} catch {
						return null;
					}
				}),
			};
			vi.mocked(getOutputParser).mockReturnValue(mockParser as any);

			const lines: string[] = [];
			for (let i = 0; i < 500; i++) {
				lines.push(`{"text":"chunk-${i}"}`);
			}
			const result = extractTextFromAgentOutput(lines.join('\n'), 'test-agent');
			const parts = result.split('\n');
			expect(parts).toHaveLength(500);
			expect(parts[0]).toBe('chunk-0');
			expect(parts[499]).toBe('chunk-499');
		});

		it('should handle very long single JSON line via generic parser', () => {
			const longText = 'A'.repeat(100_000);
			const jsonl = `{"result": "${longText}"}`;
			expect(extractTextGeneric(jsonl)).toBe(longText);
		});

		it('should handle many lines via generic parser', () => {
			const lines: string[] = [];
			for (let i = 0; i < 200; i++) {
				lines.push(`{"text":"generic-${i}"}`);
			}
			const result = extractTextGeneric(lines.join('\n'));
			const parts = result.split('\n');
			expect(parts).toHaveLength(200);
			expect(parts[0]).toBe('generic-0');
			expect(parts[199]).toBe('generic-199');
		});
	});
});
