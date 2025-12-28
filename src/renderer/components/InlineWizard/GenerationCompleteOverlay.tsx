/**
 * GenerationCompleteOverlay.tsx
 *
 * Overlay shown when document generation finishes. Displays a celebratory
 * header ("Your action plan is ready!"), task count summary, and a prominent
 * "Done" button. On click, triggers confetti animation and calls onComplete().
 */

import type { Theme } from '../../types';

/**
 * Props for GenerationCompleteOverlay
 */
export interface GenerationCompleteOverlayProps {
  /** Theme for styling */
  theme: Theme;
  /** Total number of tasks in generated documents */
  taskCount: number;
  /** Called when user clicks Done - triggers confetti and completes wizard */
  onDone: () => void;
}

/**
 * GenerationCompleteOverlay - Shown when document generation finishes
 *
 * Contains:
 * - Celebratory header ("Your action plan is ready!")
 * - Task count summary
 * - Prominent "Done" button with accent color
 *
 * On click: triggers confetti animation, then calls onComplete() callback
 */
export function GenerationCompleteOverlay({
  theme,
  taskCount,
  onDone,
}: GenerationCompleteOverlayProps): JSX.Element {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        backgroundColor: `${theme.colors.bgMain}E6`,
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Celebratory header */}
      <div className="text-center mb-6">
        <h2
          className="text-2xl font-bold mb-2"
          style={{ color: theme.colors.textMain }}
        >
          Your action plan is ready!
        </h2>
        <p
          className="text-sm"
          style={{ color: theme.colors.textDim }}
        >
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'} prepared and ready to run
        </p>
      </div>

      {/* Done button - prominent, centered, with accent color */}
      <button
        onClick={onDone}
        className="px-8 py-3 rounded-lg font-semibold text-lg transition-all hover:scale-105"
        style={{
          backgroundColor: theme.colors.accent,
          color: theme.colors.accentForeground,
          boxShadow: `0 4px 14px ${theme.colors.accent}40`,
        }}
      >
        Done
      </button>
    </div>
  );
}
