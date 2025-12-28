/**
 * WizardConversationView.tsx
 *
 * Scrollable conversation area for the inline wizard that renders WizardMessageBubble
 * components for each message in the wizard's conversation history.
 *
 * Features:
 * - Auto-scroll to bottom on new messages
 * - Typing indicator with filler phrases from fillerPhrases.ts when waiting for AI
 * - Matches the look of the normal AI terminal log view
 * - Streaming text display for real-time response
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Theme } from '../../types';
import { WizardMessageBubble, type WizardMessageBubbleMessage } from './WizardMessageBubble';
import { getNextFillerPhrase } from '../Wizard/services/fillerPhrases';

/**
 * Ready confidence threshold for "Let's Go" button (matches READY_CONFIDENCE_THRESHOLD)
 */
const READY_CONFIDENCE_THRESHOLD = 80;

/**
 * Props for WizardConversationView
 */
export interface WizardConversationViewProps {
  /** Theme for styling */
  theme: Theme;
  /** Conversation history to display */
  conversationHistory: WizardMessageBubbleMessage[];
  /** Whether the AI is currently generating a response */
  isLoading?: boolean;
  /** Streaming text being received from the AI (shown before complete response) */
  streamingText?: string;
  /** Agent name for assistant messages */
  agentName?: string;
  /** Provider name (e.g., "Claude", "OpenCode") for assistant messages */
  providerName?: string;
  /** Optional className for the container */
  className?: string;
  /** Confidence level from AI responses (0-100) */
  confidence?: number;
  /** Whether the AI is ready to proceed with document generation */
  ready?: boolean;
  /** Callback when user clicks the "Let's Go" button to start document generation */
  onLetsGo?: () => void;
}

/**
 * Check if a string contains an emoji
 */
function containsEmoji(str: string): boolean {
  const emojiRegex =
    /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u;
  return emojiRegex.test(str);
}

/**
 * Format agent name with robot emoji prefix if no emoji present
 */
function formatAgentName(name: string): string {
  if (!name) return '🤖 Agent';
  return containsEmoji(name) ? name : `🤖 ${name}`;
}

/**
 * TypingIndicator - Shows when agent is "thinking" with a typewriter effect filler phrase.
 * Rotates to a new phrase every 5 seconds after typing completes.
 */
function TypingIndicator({
  theme,
  agentName,
  fillerPhrase,
  onRequestNewPhrase,
}: {
  theme: Theme;
  agentName: string;
  fillerPhrase: string;
  onRequestNewPhrase: () => void;
}): JSX.Element {
  const [displayedText, setDisplayedText] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  // Typewriter effect
  useEffect(() => {
    const text = fillerPhrase || 'Thinking...';
    let currentIndex = 0;
    setDisplayedText('');
    setIsTypingComplete(false);

    const typeInterval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsTypingComplete(true);
        clearInterval(typeInterval);
      }
    }, 30); // 30ms per character for a natural typing speed

    return () => clearInterval(typeInterval);
  }, [fillerPhrase]);

  // Rotate to new phrase 5 seconds after typing completes
  useEffect(() => {
    if (!isTypingComplete) return;

    const rotateTimer = setTimeout(() => {
      onRequestNewPhrase();
    }, 5000);

    return () => clearTimeout(rotateTimer);
  }, [isTypingComplete, onRequestNewPhrase]);

  return (
    <div className="flex justify-start mb-4" data-testid="wizard-typing-indicator">
      <div
        className="max-w-[80%] rounded-lg rounded-bl-none px-4 py-3"
        style={{ backgroundColor: theme.colors.bgActivity }}
      >
        <div
          className="text-xs font-medium mb-2"
          style={{ color: theme.colors.accent }}
        >
          {formatAgentName(agentName)}
        </div>
        <div className="text-sm" style={{ color: theme.colors.textMain }}>
          <span
            className="italic"
            style={{ color: theme.colors.textDim }}
            data-testid="typing-indicator-text"
          >
            {displayedText}
          </span>
          <span
            className={`ml-1 inline-flex items-center gap-0.5 ${isTypingComplete ? 'opacity-100' : 'opacity-50'}`}
            data-testid="typing-indicator-dots"
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{
                backgroundColor: theme.colors.accent,
                animation: 'wizard-typing-bounce 0.6s infinite',
                animationDelay: '0ms',
              }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{
                backgroundColor: theme.colors.accent,
                animation: 'wizard-typing-bounce 0.6s infinite',
                animationDelay: '150ms',
              }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{
                backgroundColor: theme.colors.accent,
                animation: 'wizard-typing-bounce 0.6s infinite',
                animationDelay: '300ms',
              }}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * StreamingResponse - Shows streaming text from the AI as it arrives
 */
function StreamingResponse({
  theme,
  agentName,
  streamingText,
}: {
  theme: Theme;
  agentName: string;
  streamingText: string;
}): JSX.Element {
  return (
    <div className="flex justify-start mb-4" data-testid="wizard-streaming-response">
      <div
        className="max-w-[80%] rounded-lg rounded-bl-none px-4 py-3"
        style={{ backgroundColor: theme.colors.bgActivity }}
      >
        <div
          className="text-xs font-medium mb-2"
          style={{ color: theme.colors.accent }}
        >
          {formatAgentName(agentName)}
        </div>
        <div
          className="text-sm whitespace-pre-wrap"
          style={{ color: theme.colors.textMain }}
          data-testid="streaming-response-text"
        >
          {streamingText}
          <span className="animate-pulse" data-testid="streaming-cursor">
            ▊
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * WizardConversationView - Scrollable conversation area for the inline wizard
 */
export function WizardConversationView({
  theme,
  conversationHistory,
  isLoading = false,
  streamingText = '',
  agentName = 'Agent',
  providerName,
  className = '',
  confidence = 0,
  ready = false,
  onLetsGo,
}: WizardConversationViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [fillerPhrase, setFillerPhrase] = useState(() => getNextFillerPhrase());

  // Auto-scroll to bottom on new messages or when loading state changes
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory, isLoading, streamingText, scrollToBottom]);

  // Get a new filler phrase when requested by the TypingIndicator
  const handleRequestNewPhrase = useCallback(() => {
    setFillerPhrase(getNextFillerPhrase());
  }, []);

  // Reset filler phrase when loading starts
  useEffect(() => {
    if (isLoading && !streamingText) {
      setFillerPhrase(getNextFillerPhrase());
    }
  }, [isLoading, streamingText]);

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-h-0 overflow-y-auto px-6 py-4 ${className}`}
      style={{ backgroundColor: theme.colors.bgMain }}
      data-testid="wizard-conversation-view"
    >
      {/* Empty state */}
      {conversationHistory.length === 0 && !isLoading && (
        <div
          className="flex items-center justify-center h-full"
          data-testid="wizard-conversation-empty"
        >
          <p
            className="text-sm italic"
            style={{ color: theme.colors.textDim }}
          >
            Start your conversation with the wizard...
          </p>
        </div>
      )}

      {/* Conversation History */}
      {conversationHistory.map((message) => (
        <WizardMessageBubble
          key={message.id}
          message={message}
          theme={theme}
          agentName={agentName}
          providerName={providerName}
        />
      ))}

      {/* Streaming Response or Typing Indicator */}
      {isLoading &&
        (streamingText ? (
          <StreamingResponse
            theme={theme}
            agentName={agentName}
            streamingText={streamingText}
          />
        ) : (
          <TypingIndicator
            theme={theme}
            agentName={agentName}
            fillerPhrase={fillerPhrase}
            onRequestNewPhrase={handleRequestNewPhrase}
          />
        ))}

      {/* "Let's Go" Action Button - shown when ready and confidence threshold met */}
      {ready && confidence >= READY_CONFIDENCE_THRESHOLD && !isLoading && onLetsGo && (
        <div
          className="mx-auto max-w-md mb-4 p-4 rounded-lg text-center"
          style={{
            backgroundColor: `${theme.colors.success}15`,
            border: `1px solid ${theme.colors.success}40`,
          }}
          data-testid="wizard-lets-go-container"
        >
          <p
            className="text-sm font-medium mb-3"
            style={{ color: theme.colors.success }}
          >
            I think I have a good understanding of your project. Ready to create your action plan?
          </p>
          <button
            onClick={onLetsGo}
            className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-105"
            style={{
              backgroundColor: theme.colors.success,
              color: theme.colors.bgMain,
              boxShadow: `0 4px 12px ${theme.colors.success}40`,
            }}
            data-testid="wizard-lets-go-button"
          >
            Let's create your action plan! 🚀
          </button>
          <p
            className="text-xs mt-3"
            style={{ color: theme.colors.textDim }}
          >
            Or continue chatting below to add more details
          </p>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={messagesEndRef} data-testid="wizard-scroll-anchor" />

      {/* Bounce animation for typing indicator dots */}
      <style>{`
        @keyframes wizard-typing-bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
      `}</style>
    </div>
  );
}
