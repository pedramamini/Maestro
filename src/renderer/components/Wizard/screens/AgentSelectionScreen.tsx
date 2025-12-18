/**
 * AgentSelectionScreen.tsx
 *
 * First screen of the onboarding wizard - displays available AI agents
 * in a tiled grid layout with agent logos. Users can select an agent
 * and optionally provide a project name.
 *
 * Features:
 * - Tiled grid view of agent logos (Claude Code highlighted, others ghosted)
 * - Detection status indicators (checkmark for found, X for not found)
 * - Optional Name field with placeholder "My Project"
 * - Keyboard navigation (arrow keys to move between tiles, Tab to Name field, Enter to proceed)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import type { Theme, AgentConfig } from '../../../types';
import { useWizard } from '../WizardContext';
import { ScreenReaderAnnouncement } from '../ScreenReaderAnnouncement';

interface AgentSelectionScreenProps {
  theme: Theme;
}

/**
 * Agent tile data for display
 */
interface AgentTile {
  id: string;
  name: string;
  supported: boolean; // Whether Maestro supports this agent (only Claude for now)
  description: string;
  brandColor?: string; // Brand color for the logo
}

/**
 * Define the agents to display in the grid
 * Supported agents: Claude Code, Codex, OpenCode (shown first)
 * Unsupported agents: shown ghosted with "Coming soon" (at bottom)
 */
const AGENT_TILES: AgentTile[] = [
  // Supported agents first
  {
    id: 'claude-code',
    name: 'Claude Code',
    supported: true,
    description: 'Anthropic\'s AI coding assistant',
    brandColor: '#D97757', // Claude's orange/coral color
  },
  {
    id: 'codex',
    name: 'Codex',
    supported: true,
    description: 'OpenAI\'s AI coding assistant',
    brandColor: '#10A37F', // OpenAI green
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    supported: true,
    description: 'Open-source AI coding assistant',
    brandColor: '#F97316', // Orange
  },
  // Coming soon agents at the bottom
  {
    id: 'aider',
    name: 'Aider',
    supported: false,
    description: 'Coming soon',
    brandColor: '#14B8A6', // Teal
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    supported: false,
    description: 'Coming soon',
    brandColor: '#4285F4', // Google blue
  },
  {
    id: 'qwen3-coder',
    name: 'Qwen3 Coder',
    supported: false,
    description: 'Coming soon',
    brandColor: '#6366F1', // Indigo/purple
  },
];

// Grid dimensions for keyboard navigation (3 cols for 5 items)
const GRID_COLS = 3;
const GRID_ROWS = 2;

/**
 * Get SVG logo for an agent with brand colors
 */
function AgentLogo({ agentId, supported, detected, brandColor, theme }: {
  agentId: string;
  supported: boolean;
  detected: boolean;
  brandColor?: string;
  theme: Theme;
}): JSX.Element {
  // Use brand color for supported+detected, dimmed for others
  const color = supported && detected ? (brandColor || theme.colors.accent) : theme.colors.textDim;
  const opacity = supported ? 1 : 0.35;

  // Return appropriate icon based on agent ID
  switch (agentId) {
    case 'claude-code':
      // Claude Code - Anthropic's iconic spark/A logo
      return (
        <svg
          className="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity }}
        >
          {/* Anthropic spark logo - simplified iconic version */}
          <path
            d="M28.5 8L17 40h5.5l2.3-7h10.4l2.3 7H43L31.5 8h-3zm1.5 6.5L34.2 28h-8.4l4.2-13.5z"
            fill={color}
          />
          <path
            d="M5 40l8-20h5l-8 20H5z"
            fill={color}
          />
        </svg>
      );

    case 'codex':
      // Codex (OpenAI) - hexagonal/circular logo
      return (
        <svg
          className="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity }}
        >
          {/* OpenAI hexagon-inspired logo */}
          <path
            d="M24 6L40 15v18l-16 9-16-9V15l16-9z"
            stroke={color}
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M24 6v36M40 15L8 33M8 15l32 18"
            stroke={color}
            strokeWidth="2"
          />
        </svg>
      );

    case 'aider':
      // Aider - chat bubble with code brackets
      return (
        <svg
          className="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity }}
        >
          {/* Chat bubble with code brackets */}
          <path
            d="M8 12C8 9.79 9.79 8 12 8H36C38.21 8 40 9.79 40 12V28C40 30.21 38.21 32 36 32H20L12 40V32H12C9.79 32 8 30.21 8 28V12Z"
            stroke={color}
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M18 16L14 20L18 24M30 16L34 20L30 24"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'gemini-cli':
      // Gemini - Google's sparkle/star logo
      return (
        <svg
          className="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity }}
        >
          {/* Gemini sparkle logo */}
          <path
            d="M24 4C24 4 24 20 24 24C24 28 4 24 4 24C4 24 20 24 24 24C28 24 24 44 24 44C24 44 24 28 24 24C24 20 44 24 44 24C44 24 28 24 24 24"
            fill={color}
          />
        </svg>
      );

    case 'opencode':
      // OpenCode - terminal/code brackets
      return (
        <svg
          className="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity }}
        >
          {/* OpenCode - terminal prompt style */}
          <rect
            x="4"
            y="8"
            width="40"
            height="32"
            rx="4"
            stroke={color}
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M12 20l6 4-6 4M22 28h10"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'qwen3-coder':
      // Qwen - Alibaba cloud inspired
      return (
        <svg
          className="w-12 h-12"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity }}
        >
          {/* Qwen - Q with code element */}
          <circle
            cx="24"
            cy="22"
            r="14"
            stroke={color}
            strokeWidth="2.5"
            fill="none"
          />
          <path
            d="M30 30l8 10"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M18 22l4 4 6-8"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    default:
      return (
        <div
          className="w-12 h-12 rounded-full border-2"
          style={{ borderColor: color, opacity }}
        />
      );
  }
}

/**
 * AgentSelectionScreen - Agent selection with tiled grid view
 */
export function AgentSelectionScreen({ theme }: AgentSelectionScreenProps): JSX.Element {
  const {
    state,
    setSelectedAgent,
    setAvailableAgents,
    setAgentName,
    nextStep,
    canProceedToNext,
  } = useWizard();

  // Local state
  const [focusedTileIndex, setFocusedTileIndex] = useState<number>(0);
  const [isNameFieldFocused, setIsNameFieldFocused] = useState(false);
  const [isDetecting, setIsDetecting] = useState(true);
  const [detectedAgents, setDetectedAgents] = useState<AgentConfig[]>([]);

  // Screen reader announcement state
  const [announcement, setAnnouncement] = useState('');
  const [announcementKey, setAnnouncementKey] = useState(0);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Detect available agents on mount
  useEffect(() => {
    let mounted = true;

    async function detectAgents() {
      try {
        const agents = await window.maestro.agents.detect();
        if (mounted) {
          // Filter out hidden agents (like terminal)
          const visibleAgents = agents.filter((a: AgentConfig) => !a.hidden);
          setDetectedAgents(visibleAgents);
          setAvailableAgents(visibleAgents);

          // Count available agents for announcement
          const availableCount = visibleAgents.filter((a: AgentConfig) => a.available).length;
          const totalCount = visibleAgents.length;

          // Auto-select Claude Code if it's available and nothing is selected
          if (!state.selectedAgent) {
            const claudeCode = visibleAgents.find((a: AgentConfig) => a.id === 'claude-code' && a.available);
            if (claudeCode) {
              setSelectedAgent('claude-code');
              // Announce detection complete with auto-selection
              setAnnouncement(
                `Agent detection complete. ${availableCount} of ${totalCount} agents available. Claude Code automatically selected.`
              );
            } else {
              // Announce detection complete without auto-selection
              setAnnouncement(
                `Agent detection complete. ${availableCount} of ${totalCount} agents available.`
              );
            }
          } else {
            // Announce detection complete (agent already selected from restore)
            setAnnouncement(
              `Agent detection complete. ${availableCount} of ${totalCount} agents available.`
            );
          }
          setAnnouncementKey((prev) => prev + 1);

          setIsDetecting(false);
        }
      } catch (error) {
        console.error('Failed to detect agents:', error);
        if (mounted) {
          setAnnouncement('Failed to detect available agents. Please try again.');
          setAnnouncementKey((prev) => prev + 1);
          setIsDetecting(false);
        }
      }
    }

    detectAgents();
    return () => { mounted = false; };
  }, [setAvailableAgents, setSelectedAgent, state.selectedAgent]);

  // Focus on mount - currently focus name field since only Claude is supported
  // TODO: When multiple agents are supported, focus the tiles instead
  useEffect(() => {
    if (!isDetecting) {
      // Count how many agents are both supported AND detected
      const supportedAndDetectedCount = AGENT_TILES.filter(tile => {
        if (!tile.supported) return false;
        const detected = detectedAgents.find(a => a.id === tile.id);
        return detected?.available;
      }).length;

      // If only one agent is selectable, focus the name field
      // Otherwise focus the tiles for selection
      if (supportedAndDetectedCount <= 1) {
        // Focus name field since there's only one choice
        setIsNameFieldFocused(true);
        nameInputRef.current?.focus();
      } else {
        // Multiple agents available - focus the tiles
        let focusIndex = 0;
        if (state.selectedAgent) {
          const selectedIndex = AGENT_TILES.findIndex(t => t.id === state.selectedAgent);
          if (selectedIndex !== -1) {
            focusIndex = selectedIndex;
            setFocusedTileIndex(selectedIndex);
          }
        } else {
          // Find first supported and available agent
          const firstAvailableIndex = AGENT_TILES.findIndex(tile => {
            if (!tile.supported) return false;
            const detected = detectedAgents.find(a => a.id === tile.id);
            return detected?.available;
          });
          if (firstAvailableIndex !== -1) {
            focusIndex = firstAvailableIndex;
            setFocusedTileIndex(firstAvailableIndex);
          }
        }
        tileRefs.current[focusIndex]?.focus();
      }
    }
  }, [isDetecting, state.selectedAgent, detectedAgents]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // If name field is focused, only handle Tab and Enter
    if (isNameFieldFocused) {
      if (e.key === 'Tab' && e.shiftKey) {
        // Shift+Tab goes back to last tile
        e.preventDefault();
        setIsNameFieldFocused(false);
        const lastIndex = AGENT_TILES.length - 1;
        setFocusedTileIndex(lastIndex);
        tileRefs.current[lastIndex]?.focus();
      } else if (e.key === 'Enter' && canProceedToNext()) {
        e.preventDefault();
        nextStep();
      }
      return;
    }

    const currentIndex = focusedTileIndex;
    const currentRow = Math.floor(currentIndex / GRID_COLS);
    const currentCol = currentIndex % GRID_COLS;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (currentRow > 0) {
          const newIndex = (currentRow - 1) * GRID_COLS + currentCol;
          setFocusedTileIndex(newIndex);
          tileRefs.current[newIndex]?.focus();
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (currentRow < GRID_ROWS - 1) {
          const newIndex = (currentRow + 1) * GRID_COLS + currentCol;
          if (newIndex < AGENT_TILES.length) {
            setFocusedTileIndex(newIndex);
            tileRefs.current[newIndex]?.focus();
          }
        }
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (currentCol > 0) {
          const newIndex = currentIndex - 1;
          setFocusedTileIndex(newIndex);
          tileRefs.current[newIndex]?.focus();
        }
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (currentCol < GRID_COLS - 1 && currentIndex + 1 < AGENT_TILES.length) {
          const newIndex = currentIndex + 1;
          setFocusedTileIndex(newIndex);
          tileRefs.current[newIndex]?.focus();
        }
        break;

      case 'Tab':
        if (!e.shiftKey) {
          // Tab goes to name field
          e.preventDefault();
          setIsNameFieldFocused(true);
          nameInputRef.current?.focus();
        }
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        // Select the focused tile if supported and detected
        const tile = AGENT_TILES[currentIndex];
        const detected = detectedAgents.find(a => a.id === tile.id);
        if (tile.supported && detected?.available) {
          setSelectedAgent(tile.id as any);
          // If Enter, also proceed to next step if valid
          if (e.key === 'Enter' && canProceedToNext()) {
            nextStep();
          }
        }
        break;
    }
  }, [
    isNameFieldFocused,
    focusedTileIndex,
    detectedAgents,
    setSelectedAgent,
    nextStep,
    canProceedToNext,
  ]);

  /**
   * Handle tile click
   */
  const handleTileClick = useCallback((tile: AgentTile, index: number) => {
    const detected = detectedAgents.find(a => a.id === tile.id);
    // Only allow selection if agent is both supported by Maestro AND detected on system
    if (tile.supported && detected?.available) {
      setSelectedAgent(tile.id as any);
      setFocusedTileIndex(index);
      // Announce agent selection
      setAnnouncement(`${tile.name} selected`);
      setAnnouncementKey((prev) => prev + 1);
    }
  }, [detectedAgents, setSelectedAgent]);

  /**
   * Handle Continue button click
   */
  const handleContinue = useCallback(() => {
    if (canProceedToNext()) {
      nextStep();
    }
  }, [canProceedToNext, nextStep]);

  // Check if an agent is available from detection
  const isAgentAvailable = useCallback((agentId: string): boolean => {
    const detected = detectedAgents.find(a => a.id === agentId);
    return detected?.available ?? false;
  }, [detectedAgents]);

  // Loading state
  if (isDetecting) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center p-8"
        style={{ color: theme.colors.textMain }}
      >
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-4"
          style={{ borderColor: theme.colors.accent, borderTopColor: 'transparent' }}
        />
        <p className="text-sm" style={{ color: theme.colors.textDim }}>
          Detecting available agents...
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-1 min-h-0 px-8 py-6 overflow-y-auto justify-between"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Screen reader announcements */}
      <ScreenReaderAnnouncement
        message={announcement}
        announceKey={announcementKey}
        politeness="polite"
      />

      {/* Section 1: Header */}
      <div className="text-center">
        <h3
          className="text-2xl font-semibold mb-2"
          style={{ color: theme.colors.textMain }}
        >
          Choose Your Provider
        </h3>
        <p
          className="text-sm"
          style={{ color: theme.colors.textDim }}
        >
          Select the provider that will power your agent. Use arrow keys to navigate, Enter to select.
        </p>
      </div>

      {/* Section 2: Agent Grid */}
      <div className="flex justify-center">
        <div className="grid grid-cols-3 gap-4 max-w-3xl">
          {AGENT_TILES.map((tile, index) => {
            const isDetected = isAgentAvailable(tile.id);
            const isSupported = tile.supported;
            const canSelect = isSupported && isDetected;
            const isSelected = state.selectedAgent === tile.id;
            const isFocused = focusedTileIndex === index && !isNameFieldFocused;

            return (
              <button
                key={tile.id}
                ref={(el) => { tileRefs.current[index] = el; }}
                onClick={() => handleTileClick(tile, index)}
                onFocus={() => {
                  setFocusedTileIndex(index);
                  setIsNameFieldFocused(false);
                }}
                disabled={!canSelect}
                className={`
                  relative flex flex-col items-center justify-center p-6 rounded-xl
                  border-2 transition-all duration-200 outline-none min-w-[160px]
                  ${canSelect ? 'cursor-pointer' : 'cursor-not-allowed'}
                `}
                style={{
                  backgroundColor: isSelected
                    ? `${tile.brandColor || theme.colors.accent}15`
                    : theme.colors.bgSidebar,
                  borderColor: isSelected
                    ? tile.brandColor || theme.colors.accent
                    : isFocused && canSelect
                    ? theme.colors.accent
                    : theme.colors.border,
                  opacity: isSupported ? 1 : 0.5,
                  boxShadow: isSelected
                    ? `0 0 0 3px ${tile.brandColor || theme.colors.accent}30`
                    : isFocused && canSelect
                    ? `0 0 0 2px ${theme.colors.accent}40`
                    : 'none',
                }}
                aria-label={`${tile.name}${canSelect ? '' : isSupported ? ' (not installed)' : ' (coming soon)'}`}
                aria-pressed={isSelected}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <div
                    className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: tile.brandColor || theme.colors.accent }}
                  >
                    <Check className="w-3 h-3" style={{ color: '#fff' }} />
                  </div>
                )}

                {/* Detection status indicator for supported agents */}
                {isSupported && !isSelected && (
                  <div
                    className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: isDetected ? '#22c55e20' : '#ef444420',
                    }}
                    title={isDetected ? 'Installed' : 'Not found'}
                  >
                    {isDetected ? (
                      <Check className="w-3 h-3" style={{ color: '#22c55e' }} />
                    ) : (
                      <X className="w-3 h-3" style={{ color: '#ef4444' }} />
                    )}
                  </div>
                )}

                {/* Agent Logo */}
                <div className="mb-3">
                  <AgentLogo
                    agentId={tile.id}
                    supported={isSupported}
                    detected={isDetected}
                    brandColor={tile.brandColor}
                    theme={theme}
                  />
                </div>

                {/* Agent Name */}
                <h4
                  className="text-base font-medium mb-0.5"
                  style={{ color: isSupported ? theme.colors.textMain : theme.colors.textDim }}
                >
                  {tile.name}
                </h4>

                {/* Description / Status */}
                <p
                  className="text-xs text-center"
                  style={{ color: theme.colors.textDim }}
                >
                  {isSupported
                    ? (isDetected ? tile.description : 'Not installed')
                    : 'Coming soon'}
                </p>

                {/* "Soon" badge for unsupported agents */}
                {!isSupported && (
                  <span
                    className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] rounded-full font-medium"
                    style={{
                      backgroundColor: theme.colors.border,
                      color: theme.colors.textDim,
                    }}
                  >
                    Soon
                  </span>
                )}

                {/* "New" badge for Codex and OpenCode */}
                {isSupported && (tile.id === 'codex' || tile.id === 'opencode') && (
                  <span
                    className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] rounded-full font-medium"
                    style={{
                      backgroundColor: '#22c55e30',
                      color: '#22c55e',
                    }}
                  >
                    New
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: Name Your Agent - Prominent */}
      <div className="flex flex-col items-center">
        <label
          htmlFor="project-name"
          className="text-2xl font-semibold mb-4"
          style={{ color: theme.colors.textMain }}
        >
          Name Your Agent
        </label>
        <div className="flex items-center gap-4">
          <input
            ref={nameInputRef}
            id="project-name"
            type="text"
            value={state.agentName}
            onChange={(e) => setAgentName(e.target.value)}
            onFocus={() => setIsNameFieldFocused(true)}
            onBlur={() => setIsNameFieldFocused(false)}
            placeholder=""
            className="w-72 px-4 py-2.5 rounded-lg border outline-none transition-all text-center"
            style={{
              backgroundColor: theme.colors.bgMain,
              borderColor: isNameFieldFocused ? theme.colors.accent : theme.colors.border,
              color: theme.colors.textMain,
              boxShadow: isNameFieldFocused ? `0 0 0 2px ${theme.colors.accent}40` : 'none',
            }}
          />
          <button
            onClick={handleContinue}
            disabled={!canProceedToNext()}
            className="px-8 py-2.5 rounded-lg font-medium transition-all outline-none whitespace-nowrap"
            style={{
              backgroundColor: canProceedToNext() ? theme.colors.accent : theme.colors.border,
              color: canProceedToNext() ? theme.colors.accentForeground : theme.colors.textDim,
              cursor: canProceedToNext() ? 'pointer' : 'not-allowed',
              opacity: canProceedToNext() ? 1 : 0.6,
            }}
          >
            Continue
          </button>
        </div>
      </div>

      {/* Section 4: Keyboard hints (footer) */}
      <div className="flex justify-center gap-6">
        <span
          className="text-xs flex items-center gap-1"
          style={{ color: theme.colors.textDim }}
        >
          <kbd
            className="px-1.5 py-0.5 rounded text-xs"
            style={{ backgroundColor: theme.colors.border }}
          >
            ← → ↑ ↓
          </kbd>
          Navigate
        </span>
        <span
          className="text-xs flex items-center gap-1"
          style={{ color: theme.colors.textDim }}
        >
          <kbd
            className="px-1.5 py-0.5 rounded text-xs"
            style={{ backgroundColor: theme.colors.border }}
          >
            Tab
          </kbd>
          Name field
        </span>
        <span
          className="text-xs flex items-center gap-1"
          style={{ color: theme.colors.textDim }}
        >
          <kbd
            className="px-1.5 py-0.5 rounded text-xs"
            style={{ backgroundColor: theme.colors.border }}
          >
            Enter
          </kbd>
          Continue
        </span>
      </div>
    </div>
  );
}
