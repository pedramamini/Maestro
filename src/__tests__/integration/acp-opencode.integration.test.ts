/**
 * ACP OpenCode Integration Tests
 *
 * Tests for ACP (Agent Client Protocol) communication with OpenCode.
 * These tests verify that Maestro can communicate with OpenCode via ACP
 * instead of the custom JSON format.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ACPClient } from '../../main/acp/acp-client';
import { acpUpdateToParseEvent, createSessionIdEvent } from '../../main/acp/acp-adapter';
import type { SessionUpdate } from '../../main/acp/types';
import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';

// Test timeout for ACP operations
const ACP_TIMEOUT = 30000;

// Check if OpenCode is available
function isOpenCodeAvailable(): boolean {
  try {
    execSync('which opencode', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

// Check if integration tests should run
const SHOULD_RUN = process.env.RUN_INTEGRATION_TESTS === 'true' && isOpenCodeAvailable();

describe.skipIf(!SHOULD_RUN)('ACP OpenCode Integration Tests', () => {
  const TEST_CWD = os.tmpdir();

  describe('ACPClient connection', () => {
    it('should connect to OpenCode via ACP and initialize', async () => {
      const client = new ACPClient({
        command: 'opencode',
        args: ['acp'],
        cwd: TEST_CWD,
        clientInfo: {
          name: 'maestro-test',
          version: '0.0.1',
        },
      });

      try {
        const response = await client.connect();

        expect(response.protocolVersion).toBeGreaterThanOrEqual(1);
        expect(client.getIsConnected()).toBe(true);
        expect(client.getAgentInfo()).toBeDefined();

        console.log(`✅ Connected to: ${client.getAgentInfo()?.name} v${client.getAgentInfo()?.version}`);
        console.log(`📋 Protocol version: ${response.protocolVersion}`);
        console.log(`🔧 Capabilities:`, response.agentCapabilities);
      } finally {
        client.disconnect();
      }
    }, ACP_TIMEOUT);

    it('should create a new session', async () => {
      const client = new ACPClient({
        command: 'opencode',
        args: ['acp'],
        cwd: TEST_CWD,
      });

      try {
        await client.connect();
        const session = await client.newSession(TEST_CWD);

        expect(session.sessionId).toBeDefined();
        expect(typeof session.sessionId).toBe('string');
        expect(session.sessionId.length).toBeGreaterThan(0);

        console.log(`✅ Created session: ${session.sessionId}`);
        if (session.modes) {
          console.log(`📋 Available modes: ${session.modes.availableModes.map((m) => m.name).join(', ')}`);
          console.log(`📋 Current mode: ${session.modes.currentModeId}`);
        }
      } finally {
        client.disconnect();
      }
    }, ACP_TIMEOUT);

    it('should send a prompt and receive streaming updates', async () => {
      const client = new ACPClient({
        command: 'opencode',
        args: ['acp'],
        cwd: TEST_CWD,
      });

      const updates: SessionUpdate[] = [];

      try {
        await client.connect();
        const session = await client.newSession(TEST_CWD);

        // Listen for updates
        client.on('session:update', (sessionId, update) => {
          console.log(`📥 Update (${sessionId}):`, JSON.stringify(update).substring(0, 200));
          updates.push(update);
        });

        // Auto-approve permission requests in YOLO mode
        client.on('session:permission_request', (request, respond) => {
          console.log(`🔐 Permission request: ${request.toolCall.title}`);
          // Find the "allow" option and select it
          const allowOption = request.options.find(
            (o) => o.kind === 'allow_once' || o.kind === 'allow_always'
          );
          if (allowOption) {
            respond({ outcome: { selected: { optionId: allowOption.optionId } } });
          } else {
            respond({ outcome: { cancelled: {} } });
          }
        });

        console.log(`🚀 Sending prompt to session ${session.sessionId}...`);
        const response = await client.prompt(session.sessionId, 'Say "hello" and nothing else.');

        expect(response.stopReason).toBeDefined();
        console.log(`✅ Stop reason: ${response.stopReason}`);
        console.log(`📊 Received ${updates.length} updates`);

        // Check we received some text updates
        const textUpdates = updates.filter(
          (u) => 'agent_message_chunk' in u || 'agent_thought_chunk' in u
        );
        expect(textUpdates.length).toBeGreaterThan(0);
      } finally {
        client.disconnect();
      }
    }, ACP_TIMEOUT);
  });

  describe('ACP to ParsedEvent adapter', () => {
    it('should convert agent_message_chunk to text event', () => {
      const update: SessionUpdate = {
        agent_message_chunk: {
          content: {
            text: { text: 'Hello, world!' },
          },
        },
      };

      const event = acpUpdateToParseEvent('test-session', update);

      expect(event).toBeDefined();
      expect(event?.type).toBe('text');
      expect(event?.text).toBe('Hello, world!');
      expect(event?.isPartial).toBe(true);
    });

    it('should convert agent_thought_chunk to thinking event', () => {
      const update: SessionUpdate = {
        agent_thought_chunk: {
          content: {
            text: { text: 'Let me think about this...' },
          },
        },
      };

      const event = acpUpdateToParseEvent('test-session', update);

      expect(event).toBeDefined();
      expect(event?.type).toBe('text'); // Mapped to 'text' type since ParsedEvent doesn't have 'thinking'
      expect(event?.text).toBe('[thinking] Let me think about this...');
    });

    it('should convert tool_call to tool_use event', () => {
      const update: SessionUpdate = {
        tool_call: {
          toolCallId: 'tc-123',
          title: 'read_file',
          kind: 'read',
          status: 'in_progress',
          rawInput: { path: '/tmp/test.txt' },
        },
      };

      const event = acpUpdateToParseEvent('test-session', update);

      expect(event).toBeDefined();
      expect(event?.type).toBe('tool_use');
      expect(event?.toolName).toBe('read_file');
      expect((event?.toolState as any)?.id).toBe('tc-123');
      expect((event?.toolState as any)?.status).toBe('running');
    });

    it('should convert tool_call_update with output', () => {
      const update: SessionUpdate = {
        tool_call_update: {
          toolCallId: 'tc-123',
          status: 'completed',
          rawOutput: { content: 'file contents here' },
        },
      };

      const event = acpUpdateToParseEvent('test-session', update);

      expect(event).toBeDefined();
      expect(event?.type).toBe('tool_use');
      expect((event?.toolState as any)?.status).toBe('completed');
      expect((event?.toolState as any)?.output).toEqual({ content: 'file contents here' });
    });

    it('should create session_id event', () => {
      const event = createSessionIdEvent('ses_abc123');

      expect(event.type).toBe('init'); // Mapped to 'init' type since ParsedEvent doesn't have 'session_id'
      expect(event.sessionId).toBe('ses_abc123');
    });
  });
});
