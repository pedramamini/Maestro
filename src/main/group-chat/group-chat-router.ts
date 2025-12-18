/**
 * @file group-chat-router.ts
 * @description Message routing for Group Chat feature.
 *
 * Routes messages between:
 * - User -> Moderator
 * - Moderator -> Participants (via @mentions)
 * - Participants -> Moderator
 */

import { GroupChatParticipant, loadGroupChat } from './group-chat-storage';
import { appendToLog, readLog, GroupChatMessage } from './group-chat-log';
import {
  IProcessManager,
  getModeratorSessionId,
  isModeratorActive,
  MODERATOR_SYSTEM_PROMPT,
} from './group-chat-moderator';
import {
  getParticipantSessionId,
  isParticipantActive,
} from './group-chat-agent';
import { AgentDetector } from '../agent-detector';

// Import emitters from IPC handlers (will be populated after handlers are registered)
import { groupChatEmitters } from '../ipc/handlers/groupChat';

/**
 * Extracts @mentions from text that match known participants.
 *
 * @param text - The text to search for mentions
 * @param participants - List of valid participants
 * @returns Array of participant names that were mentioned
 */
export function extractMentions(
  text: string,
  participants: GroupChatParticipant[]
): string[] {
  const participantNames = new Set(participants.map((p) => p.name));
  const mentions: string[] = [];

  // Match @Name patterns (alphanumeric and underscores)
  const mentionPattern = /@(\w+)/g;
  let match;

  while ((match = mentionPattern.exec(text)) !== null) {
    const name = match[1];
    if (participantNames.has(name) && !mentions.includes(name)) {
      mentions.push(name);
    }
  }

  return mentions;
}

/**
 * Routes a user message to the moderator.
 *
 * Spawns a batch process for the moderator to handle this specific message.
 * The chat history is included in the system prompt for context.
 *
 * @param groupChatId - The ID of the group chat
 * @param message - The message from the user
 * @param processManager - The process manager (optional)
 * @param agentDetector - The agent detector for resolving agent commands (optional)
 * @param readOnly - Optional flag indicating read-only mode
 */
export async function routeUserMessage(
  groupChatId: string,
  message: string,
  processManager?: IProcessManager,
  agentDetector?: AgentDetector,
  readOnly?: boolean
): Promise<void> {
  const chat = await loadGroupChat(groupChatId);
  if (!chat) {
    throw new Error(`Group chat not found: ${groupChatId}`);
  }

  if (!isModeratorActive(groupChatId)) {
    throw new Error(`Moderator is not active for group chat: ${groupChatId}`);
  }

  // Log the message as coming from user
  await appendToLog(chat.logPath, 'user', message, readOnly);

  // Emit message event to renderer so it shows immediately
  const userMessage: GroupChatMessage = {
    timestamp: new Date().toISOString(),
    from: 'user',
    content: message,
    readOnly,
  };
  groupChatEmitters.emitMessage?.(groupChatId, userMessage);

  // Spawn a batch process for the moderator to handle this message
  // The response will be captured via the process:data event handler in index.ts
  if (processManager && agentDetector) {
    const sessionIdPrefix = getModeratorSessionId(groupChatId);
    if (sessionIdPrefix) {
      // Create a unique session ID for this message
      const sessionId = `${sessionIdPrefix}-${Date.now()}`;

      // Resolve the agent configuration to get the executable command
      const agent = await agentDetector.getAgent(chat.moderatorAgentId);
      if (!agent || !agent.available) {
        throw new Error(`Agent '${chat.moderatorAgentId}' is not available`);
      }

      // Use the resolved path if available, otherwise fall back to command
      const command = agent.path || agent.command;
      // Get the base args from the agent configuration
      const args = [...agent.args];

      // Build the prompt with context
      const chatHistory = await readLog(chat.logPath);
      const historyContext = chatHistory.slice(-20).map(m =>
        `[${m.from}]: ${m.content}`
      ).join('\n');

      const fullPrompt = readOnly
        ? `${MODERATOR_SYSTEM_PROMPT}\n\n## Chat History:\n${historyContext}\n\n## User Request (READ-ONLY MODE - do not make changes):\n${message}`
        : `${MODERATOR_SYSTEM_PROMPT}\n\n## Chat History:\n${historyContext}\n\n## User Request:\n${message}`;

      // Spawn the moderator process in batch mode
      try {
        processManager.spawn({
          sessionId,
          toolType: chat.moderatorAgentId,
          cwd: process.env.HOME || '/tmp',
          command,
          args,
          readOnlyMode: true,
          prompt: fullPrompt,
        });
      } catch (error) {
        console.error(`[GroupChatRouter] Failed to spawn moderator for ${groupChatId}:`, error);
        throw new Error(`Failed to spawn moderator: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else if (processManager && !agentDetector) {
    console.error(`[GroupChatRouter] AgentDetector not available, cannot spawn moderator`);
    throw new Error('AgentDetector not available');
  }
}

/**
 * Routes a moderator response, forwarding to mentioned agents.
 *
 * - Logs the message as coming from 'moderator'
 * - Extracts @mentions and forwards to those participants
 *
 * @param groupChatId - The ID of the group chat
 * @param message - The message from the moderator
 * @param processManager - The process manager (optional)
 */
export async function routeModeratorResponse(
  groupChatId: string,
  message: string,
  processManager?: IProcessManager
): Promise<void> {
  const chat = await loadGroupChat(groupChatId);
  if (!chat) {
    throw new Error(`Group chat not found: ${groupChatId}`);
  }

  // Log the message as coming from moderator
  await appendToLog(chat.logPath, 'moderator', message);

  // Extract mentions and forward to those participants
  const mentions = extractMentions(message, chat.participants);

  if (processManager) {
    for (const participantName of mentions) {
      if (isParticipantActive(groupChatId, participantName)) {
        const sessionId = getParticipantSessionId(groupChatId, participantName);
        if (sessionId) {
          try {
            // Send the full message to the mentioned participant
            processManager.write(sessionId, message + '\n');
          } catch (error) {
            console.error(`[GroupChatRouter] Failed to write to participant ${participantName}:`, error);
            // Continue with other participants even if one fails
          }
        }
      }
    }
  }
}

/**
 * Routes an agent's response back to the moderator.
 *
 * - Logs the message as coming from the participant
 * - Notifies the moderator of the response
 *
 * @param groupChatId - The ID of the group chat
 * @param participantName - The name of the responding participant
 * @param message - The message from the participant
 * @param processManager - The process manager (optional)
 */
export async function routeAgentResponse(
  groupChatId: string,
  participantName: string,
  message: string,
  processManager?: IProcessManager
): Promise<void> {
  const chat = await loadGroupChat(groupChatId);
  if (!chat) {
    throw new Error(`Group chat not found: ${groupChatId}`);
  }

  // Verify participant exists
  const participant = chat.participants.find((p) => p.name === participantName);
  if (!participant) {
    throw new Error(`Participant '${participantName}' not found in group chat`);
  }

  // Log the message as coming from the participant
  await appendToLog(chat.logPath, participantName, message);

  // Notify moderator
  if (processManager && isModeratorActive(groupChatId)) {
    const sessionId = getModeratorSessionId(groupChatId);
    if (sessionId) {
      try {
        // Format the notification to clearly indicate who responded
        const notification = `[${participantName}]: ${message}`;
        processManager.write(sessionId, notification + '\n');
      } catch (error) {
        console.error(`[GroupChatRouter] Failed to notify moderator from ${participantName}:`, error);
        // Don't throw - the message was already logged
      }
    }
  }
}
