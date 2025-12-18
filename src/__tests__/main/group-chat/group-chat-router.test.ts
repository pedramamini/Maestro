/**
 * @file group-chat-router.test.ts
 * @description Unit tests for the Group Chat message router.
 *
 * Tests cover:
 * - Extracting @mentions (5.1, 5.2)
 * - Routing user messages (5.3)
 * - Routing moderator responses (5.4)
 * - Routing agent responses (5.5)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractMentions,
  routeUserMessage,
  routeModeratorResponse,
  routeAgentResponse,
} from '../../../main/group-chat/group-chat-router';
import {
  spawnModerator,
  clearAllModeratorSessions,
  type IProcessManager,
} from '../../../main/group-chat/group-chat-moderator';
import {
  addParticipant,
  clearAllParticipantSessionsGlobal,
} from '../../../main/group-chat/group-chat-agent';
import {
  createGroupChat,
  deleteGroupChat,
  loadGroupChat,
  GroupChatParticipant,
} from '../../../main/group-chat/group-chat-storage';
import { readLog } from '../../../main/group-chat/group-chat-log';
import { AgentDetector } from '../../../main/agent-detector';

describe('group-chat-router', () => {
  let mockProcessManager: IProcessManager;
  let mockAgentDetector: AgentDetector;
  let createdChats: string[] = [];

  beforeEach(() => {
    // Create a fresh mock for each test
    mockProcessManager = {
      spawn: vi.fn().mockReturnValue({ pid: 12345, success: true }),
      write: vi.fn().mockReturnValue(true),
      kill: vi.fn().mockReturnValue(true),
    };

    // Create a mock agent detector that returns a mock agent config
    mockAgentDetector = {
      getAgent: vi.fn().mockResolvedValue({
        id: 'claude-code',
        name: 'Claude Code',
        binaryName: 'claude',
        command: 'claude',
        args: ['--print', '--verbose', '--output-format', 'stream-json'],
        available: true,
        path: '/usr/local/bin/claude',
        capabilities: {},
      }),
      detectAgents: vi.fn().mockResolvedValue([]),
      clearCache: vi.fn(),
      setCustomPaths: vi.fn(),
      getCustomPaths: vi.fn().mockReturnValue({}),
      discoverModels: vi.fn().mockResolvedValue([]),
      clearModelCache: vi.fn(),
    } as unknown as AgentDetector;

    // Clear any leftover sessions from previous tests
    clearAllModeratorSessions();
    clearAllParticipantSessionsGlobal();
  });

  afterEach(async () => {
    // Clean up any created chats
    for (const id of createdChats) {
      try {
        await deleteGroupChat(id);
      } catch {
        // Ignore errors
      }
    }
    createdChats = [];

    // Clear sessions
    clearAllModeratorSessions();
    clearAllParticipantSessionsGlobal();

    // Clear mocks
    vi.clearAllMocks();
  });

  // Helper to track created chats for cleanup
  async function createTestChat(name: string, agentId: string = 'claude-code') {
    const chat = await createGroupChat(name, agentId);
    createdChats.push(chat.id);
    return chat;
  }

  // Helper to create chat with moderator spawned
  async function createTestChatWithModerator(name: string, agentId: string = 'claude-code') {
    const chat = await createTestChat(name, agentId);
    await spawnModerator(chat, mockProcessManager);
    return chat;
  }

  // ===========================================================================
  // Test 5.1: extractMentions finds @mentions
  // ===========================================================================
  describe('extractMentions', () => {
    it('extracts @mentions from text', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Client', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
        { name: 'Server', agentId: 'claude-code', sessionId: '2', addedAt: 0 },
      ];

      const mentions = extractMentions('Hey @Client and @Server, please coordinate', participants);
      expect(mentions).toEqual(['Client', 'Server']);
    });

    it('returns mentions in order of appearance', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Alpha', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
        { name: 'Beta', agentId: 'claude-code', sessionId: '2', addedAt: 0 },
        { name: 'Gamma', agentId: 'claude-code', sessionId: '3', addedAt: 0 },
      ];

      const mentions = extractMentions('@Gamma first, then @Alpha, finally @Beta', participants);
      expect(mentions).toEqual(['Gamma', 'Alpha', 'Beta']);
    });

    it('handles single mention', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Client', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
      ];

      const mentions = extractMentions('@Client: Please implement this', participants);
      expect(mentions).toEqual(['Client']);
    });

    it('returns empty array for no mentions', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Client', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
      ];

      const mentions = extractMentions('No mentions here', participants);
      expect(mentions).toEqual([]);
    });

    it('handles empty text', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Client', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
      ];

      const mentions = extractMentions('', participants);
      expect(mentions).toEqual([]);
    });

    it('handles empty participants list', () => {
      const mentions = extractMentions('@Client and @Server', []);
      expect(mentions).toEqual([]);
    });

    it('does not duplicate mentions', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Client', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
      ];

      const mentions = extractMentions('@Client and then @Client again', participants);
      expect(mentions).toEqual(['Client']);
    });

    it('handles mentions with underscores', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Backend_Dev', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
      ];

      const mentions = extractMentions('@Backend_Dev: Please help', participants);
      expect(mentions).toEqual(['Backend_Dev']);
    });

    it('handles mentions with numbers', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Agent1', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
        { name: 'Agent2', agentId: 'claude-code', sessionId: '2', addedAt: 0 },
      ];

      const mentions = extractMentions('@Agent1 and @Agent2', participants);
      expect(mentions).toEqual(['Agent1', 'Agent2']);
    });
  });

  // ===========================================================================
  // Test 5.2: extractMentions ignores unknown mentions
  // ===========================================================================
  describe('extractMentions - unknown mentions', () => {
    it('ignores mentions not in participants', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Client', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
      ];

      const mentions = extractMentions('Hey @Client and @Unknown', participants);
      expect(mentions).toEqual(['Client']);
    });

    it('returns empty when all mentions are unknown', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Client', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
      ];

      const mentions = extractMentions('@Unknown1 and @Unknown2', participants);
      expect(mentions).toEqual([]);
    });

    it('case sensitive - ignores wrong case', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Client', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
      ];

      const mentions = extractMentions('@client @CLIENT @Client', participants);
      expect(mentions).toEqual(['Client']); // Only exact match
    });

    it('only matches valid participant names', () => {
      const participants: GroupChatParticipant[] = [
        { name: 'Client', agentId: 'claude-code', sessionId: '1', addedAt: 0 },
        { name: 'Server', agentId: 'claude-code', sessionId: '2', addedAt: 0 },
      ];

      // @Cli shouldn't match Client, @ServerX shouldn't match Server
      const mentions = extractMentions('@Cli and @ServerX and @Client', participants);
      expect(mentions).toEqual(['Client']);
    });
  });

  // ===========================================================================
  // Test 5.3: routeUserMessage spawns moderator process in batch mode
  // Note: routeUserMessage now spawns a batch process per message instead of
  // writing to a persistent session.
  // ===========================================================================
  describe('routeUserMessage', () => {
    it('routes user message to moderator', async () => {
      const chat = await createTestChatWithModerator('Route Test');

      await routeUserMessage(chat.id, 'Hello', mockProcessManager, mockAgentDetector);

      // Should be in log
      const messages = await readLog(chat.logPath);
      expect(messages.some(m => m.from === 'user')).toBe(true);
      expect(messages.some(m => m.content === 'Hello')).toBe(true);

      // Should spawn a batch process for the moderator
      expect(mockProcessManager.spawn).toHaveBeenCalled();
    });

    it('logs message with correct sender', async () => {
      const chat = await createTestChatWithModerator('Sender Test');

      await routeUserMessage(chat.id, 'User message here', mockProcessManager, mockAgentDetector);

      const messages = await readLog(chat.logPath);
      const userMessage = messages.find(m => m.from === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage?.content).toBe('User message here');
    });

    it('sends message to moderator session', async () => {
      const chat = await createTestChatWithModerator('Session Test');

      await routeUserMessage(chat.id, 'Test message', mockProcessManager, mockAgentDetector);

      // Check that spawn was called with prompt containing the message
      expect(mockProcessManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Test message'),
        })
      );
    });

    it('throws for non-existent chat', async () => {
      await expect(routeUserMessage('non-existent-id', 'Hello', mockProcessManager, mockAgentDetector))
        .rejects.toThrow(/not found/i);
    });

    it('throws when moderator is not active', async () => {
      const chat = await createTestChat('No Moderator');
      // Don't spawn moderator

      await expect(routeUserMessage(chat.id, 'Hello', mockProcessManager, mockAgentDetector))
        .rejects.toThrow(/not active/i);
    });

    it('works without process manager (log only)', async () => {
      const chat = await createTestChatWithModerator('Log Only Test');

      // No process manager - should still log
      await routeUserMessage(chat.id, 'Log only message');

      const messages = await readLog(chat.logPath);
      expect(messages.some(m => m.from === 'user' && m.content === 'Log only message')).toBe(true);
    });
  });

  // ===========================================================================
  // Test 5.4: routeModeratorResponse forwards to mentioned agents
  // ===========================================================================
  describe('routeModeratorResponse', () => {
    it('forwards to mentioned agents', async () => {
      const chat = await createTestChatWithModerator('Forward Test');
      await addParticipant(chat.id, 'Client', 'claude-code', mockProcessManager);

      await routeModeratorResponse(chat.id, '@Client: Please implement the login form', mockProcessManager);

      // Should forward to Client
      const loaded = await loadGroupChat(chat.id);
      const clientSession = loaded?.participants[0].sessionId;

      // Find the write call to the client session
      const writeCalls = mockProcessManager.write.mock.calls;
      const clientWrite = writeCalls.find(call => call[0] === clientSession);
      expect(clientWrite).toBeDefined();
      expect(clientWrite?.[1]).toContain('login form');
    });

    it('logs moderator message', async () => {
      const chat = await createTestChatWithModerator('Log Test');
      await addParticipant(chat.id, 'Client', 'claude-code', mockProcessManager);

      await routeModeratorResponse(chat.id, '@Client: Task for you', mockProcessManager);

      const messages = await readLog(chat.logPath);
      expect(messages.some(m => m.from === 'moderator' && m.content.includes('Task for you'))).toBe(true);
    });

    it('forwards to multiple mentioned agents', async () => {
      const chat = await createTestChatWithModerator('Multi Forward Test');
      const client = await addParticipant(chat.id, 'Client', 'claude-code', mockProcessManager);
      const server = await addParticipant(chat.id, 'Server', 'claude-code', mockProcessManager);

      await routeModeratorResponse(chat.id, '@Client and @Server: Coordinate on API', mockProcessManager);

      const writeCalls = mockProcessManager.write.mock.calls;

      // Should have written to both participants
      const clientWrite = writeCalls.find(call => call[0] === client.sessionId);
      const serverWrite = writeCalls.find(call => call[0] === server.sessionId);

      expect(clientWrite).toBeDefined();
      expect(serverWrite).toBeDefined();
    });

    it('ignores unknown mentions', async () => {
      const chat = await createTestChatWithModerator('Unknown Mention Test');
      await addParticipant(chat.id, 'Client', 'claude-code', mockProcessManager);

      // Clear the write mock after setup
      mockProcessManager.write.mockClear();

      await routeModeratorResponse(chat.id, '@Unknown: This should not route', mockProcessManager);

      // Should not write to any session (since Unknown doesn't exist)
      expect(mockProcessManager.write).not.toHaveBeenCalled();
    });

    it('throws for non-existent chat', async () => {
      await expect(routeModeratorResponse('non-existent-id', 'Hello', mockProcessManager))
        .rejects.toThrow(/not found/i);
    });

    it('works without process manager (log only)', async () => {
      const chat = await createTestChatWithModerator('Log Only Mod Test');
      await addParticipant(chat.id, 'Client', 'claude-code', mockProcessManager);

      mockProcessManager.write.mockClear();

      // No process manager - should still log
      await routeModeratorResponse(chat.id, '@Client: Log only');

      const messages = await readLog(chat.logPath);
      expect(messages.some(m => m.from === 'moderator')).toBe(true);
    });
  });

  // ===========================================================================
  // Test 5.5: routeAgentResponse logs and notifies moderator
  // ===========================================================================
  describe('routeAgentResponse', () => {
    it('logs agent response and notifies moderator', async () => {
      const chat = await createTestChatWithModerator('Agent Response Test');
      await addParticipant(chat.id, 'Client', 'claude-code', mockProcessManager);

      // Clear write mock after setup
      mockProcessManager.write.mockClear();

      await routeAgentResponse(chat.id, 'Client', 'Done implementing the form', mockProcessManager);

      // Should be in log
      const messages = await readLog(chat.logPath);
      expect(messages.some(m => m.from === 'Client')).toBe(true);
      expect(messages.some(m => m.content === 'Done implementing the form')).toBe(true);

      // Should notify moderator
      expect(mockProcessManager.write).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Client')
      );
    });

    it('logs message with participant name as sender', async () => {
      const chat = await createTestChatWithModerator('Sender Name Test');
      await addParticipant(chat.id, 'Backend', 'claude-code', mockProcessManager);

      await routeAgentResponse(chat.id, 'Backend', 'API endpoint created', mockProcessManager);

      const messages = await readLog(chat.logPath);
      const agentMessage = messages.find(m => m.from === 'Backend');
      expect(agentMessage).toBeDefined();
      expect(agentMessage?.content).toBe('API endpoint created');
    });

    it('formats notification for moderator', async () => {
      const chat = await createTestChatWithModerator('Format Test');
      await addParticipant(chat.id, 'Frontend', 'claude-code', mockProcessManager);

      mockProcessManager.write.mockClear();

      await routeAgentResponse(chat.id, 'Frontend', 'Component ready', mockProcessManager);

      // Should include participant name in brackets
      expect(mockProcessManager.write).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('[Frontend]')
      );
    });

    it('throws for non-existent chat', async () => {
      await expect(routeAgentResponse('non-existent-id', 'Client', 'Hello', mockProcessManager))
        .rejects.toThrow(/not found/i);
    });

    it('throws for unknown participant', async () => {
      const chat = await createTestChatWithModerator('Unknown Agent Test');

      await expect(routeAgentResponse(chat.id, 'Unknown', 'Hello', mockProcessManager))
        .rejects.toThrow(/not found/i);
    });

    it('works without process manager (log only)', async () => {
      const chat = await createTestChatWithModerator('Log Only Agent Test');
      await addParticipant(chat.id, 'Client', 'claude-code', mockProcessManager);

      mockProcessManager.write.mockClear();

      // No process manager - should still log
      await routeAgentResponse(chat.id, 'Client', 'Log only response');

      const messages = await readLog(chat.logPath);
      expect(messages.some(m => m.from === 'Client' && m.content === 'Log only response')).toBe(true);
    });

    it('handles multiple responses from same agent', async () => {
      const chat = await createTestChatWithModerator('Multi Response Test');
      await addParticipant(chat.id, 'Client', 'claude-code', mockProcessManager);

      await routeAgentResponse(chat.id, 'Client', 'First message', mockProcessManager);
      await routeAgentResponse(chat.id, 'Client', 'Second message', mockProcessManager);

      const messages = await readLog(chat.logPath);
      const clientMessages = messages.filter(m => m.from === 'Client');
      expect(clientMessages).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Edge cases and integration scenarios
  // ===========================================================================
  describe('edge cases', () => {
    it('handles full message flow', async () => {
      const chat = await createTestChatWithModerator('Full Flow Test');
      await addParticipant(chat.id, 'Dev', 'claude-code', mockProcessManager);

      // User message
      await routeUserMessage(chat.id, 'Please help me build a feature', mockProcessManager, mockAgentDetector);

      // Moderator response
      await routeModeratorResponse(chat.id, '@Dev: Build the feature', mockProcessManager);

      // Agent response
      await routeAgentResponse(chat.id, 'Dev', 'Feature built!', mockProcessManager);

      const messages = await readLog(chat.logPath);
      expect(messages.filter(m => m.from === 'user')).toHaveLength(1);
      expect(messages.filter(m => m.from === 'moderator')).toHaveLength(1);
      expect(messages.filter(m => m.from === 'Dev')).toHaveLength(1);
    });

    it('handles special characters in messages', async () => {
      const chat = await createTestChatWithModerator('Special Char Test');
      await addParticipant(chat.id, 'Client', 'claude-code', mockProcessManager);

      await routeUserMessage(chat.id, 'Message with pipes | and newlines\nand more', mockProcessManager, mockAgentDetector);

      const messages = await readLog(chat.logPath);
      const userMessage = messages.find(m => m.from === 'user');
      expect(userMessage?.content).toBe('Message with pipes | and newlines\nand more');
    });

    it('handles concurrent routing', async () => {
      const chat = await createTestChatWithModerator('Concurrent Test');
      await addParticipant(chat.id, 'Agent1', 'claude-code', mockProcessManager);
      await addParticipant(chat.id, 'Agent2', 'claude-code', mockProcessManager);

      // Send multiple messages concurrently
      await Promise.all([
        routeAgentResponse(chat.id, 'Agent1', 'Response 1', mockProcessManager),
        routeAgentResponse(chat.id, 'Agent2', 'Response 2', mockProcessManager),
      ]);

      const messages = await readLog(chat.logPath);
      expect(messages.filter(m => m.from === 'Agent1' || m.from === 'Agent2')).toHaveLength(2);
    });
  });
});
