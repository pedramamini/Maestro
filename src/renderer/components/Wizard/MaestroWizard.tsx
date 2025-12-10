/**
 * MaestroWizard.tsx
 *
 * Main orchestrator component for the onboarding wizard.
 * Renders the appropriate screen based on the current step from WizardContext.
 * Handles modal presentation, screen transitions, and LayerStack registration.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useWizard, WIZARD_TOTAL_STEPS, STEP_INDEX, type WizardStep } from './WizardContext';
import { useLayerStack } from '../../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../../constants/modalPriorities';
import { WizardExitConfirmModal } from './WizardExitConfirmModal';
import { ScreenReaderAnnouncement } from './ScreenReaderAnnouncement';
import type { Theme } from '../../types';

/** Duration of the fade-out animation in ms */
const FADE_OUT_DURATION = 150;
/** Duration of the fade-in animation in ms */
const FADE_IN_DURATION = 200;

// Screen components - will be implemented in subsequent tasks
// For now, we render placeholder content until the actual screens are created
import {
  AgentSelectionScreen,
  DirectorySelectionScreen,
  ConversationScreen,
  PhaseReviewScreen,
} from './screens';

interface MaestroWizardProps {
  theme: Theme;
  /** Callback to create session and launch Auto Run when wizard completes */
  onLaunchSession?: (wantsTour: boolean) => Promise<void>;
  /** Analytics callback: Called when wizard is started fresh */
  onWizardStart?: () => void;
  /** Analytics callback: Called when wizard is resumed from saved state */
  onWizardResume?: () => void;
  /** Analytics callback: Called when wizard is abandoned before completion */
  onWizardAbandon?: () => void;
  /** Analytics callback: Called when wizard completes successfully */
  onWizardComplete?: (
    durationMs: number,
    conversationExchanges: number,
    phasesGenerated: number,
    tasksGenerated: number
  ) => void;
}

/**
 * Get human-readable title for each wizard step
 */
function getStepTitle(step: WizardStep): string {
  switch (step) {
    case 'agent-selection':
      return 'Select Your Agent';
    case 'directory-selection':
      return 'Choose Project Directory';
    case 'conversation':
      return 'Project Discovery';
    case 'phase-review':
      return 'Review Your Action Plan';
    default:
      return 'Setup Wizard';
  }
}

/**
 * MaestroWizard - Main wizard orchestrator component
 *
 * Renders the wizard modal and manages screen transitions based on
 * the current step from WizardContext. Integrates with LayerStack for
 * proper modal behavior including Escape key handling.
 */
export function MaestroWizard({
  theme,
  onLaunchSession,
  onWizardStart,
  onWizardResume,
  onWizardAbandon,
  onWizardComplete,
}: MaestroWizardProps): JSX.Element | null {
  const {
    state,
    closeWizard,
    saveStateForResume,
    getCurrentStepNumber,
  } = useWizard();

  const { registerLayer, unregisterLayer } = useLayerStack();

  // State for exit confirmation modal
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Track wizard start time for duration calculation
  const wizardStartTimeRef = useRef<number>(0);
  // Track if wizard start has been recorded for this open session
  const wizardStartedRef = useRef(false);

  // State for screen transition animations
  // displayedStep is the step actually being rendered (lags behind currentStep during transitions)
  const [displayedStep, setDisplayedStep] = useState<WizardStep>(state.currentStep);
  // isTransitioning tracks whether we're in a fade-out/fade-in animation
  const [isTransitioning, setIsTransitioning] = useState(false);
  // transitionDirection indicates whether we're moving forward or backward
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');

  // State for screen reader announcements
  const [announcement, setAnnouncement] = useState('');
  const [announcementKey, setAnnouncementKey] = useState(0);

  // Refs for stable callbacks
  const closeWizardRef = useRef(closeWizard);
  closeWizardRef.current = closeWizard;
  const saveStateForResumeRef = useRef(saveStateForResume);
  saveStateForResumeRef.current = saveStateForResume;

  /**
   * Handle wizard close request
   * Shows confirmation if past step 1, otherwise closes directly
   */
  const handleCloseRequest = useCallback(() => {
    const currentStepNum = getCurrentStepNumber();

    if (currentStepNum > 1) {
      // Show confirmation dialog
      setShowExitConfirm(true);
    } else {
      // On step 1, close directly without saving (no progress to save)
      closeWizardRef.current();
    }
  }, [getCurrentStepNumber]);

  /**
   * Handle confirmed exit - saves state and closes wizard
   */
  const handleConfirmExit = useCallback(() => {
    saveStateForResumeRef.current();
    setShowExitConfirm(false);
    // Record wizard abandonment for analytics
    if (onWizardAbandon) {
      onWizardAbandon();
    }
    closeWizardRef.current();
  }, [onWizardAbandon]);

  /**
   * Handle cancel exit - close confirmation and stay in wizard
   */
  const handleCancelExit = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  // Handle step transitions with fade animation
  useEffect(() => {
    // Only animate if step has actually changed
    if (state.currentStep !== displayedStep && !isTransitioning) {
      // Determine direction based on step indices
      const currentIndex = STEP_INDEX[state.currentStep];
      const displayedIndex = STEP_INDEX[displayedStep];
      setTransitionDirection(currentIndex > displayedIndex ? 'forward' : 'backward');

      // Start the transition (fade out)
      setIsTransitioning(true);

      // After fade-out completes, update the displayed step
      const fadeOutTimer = setTimeout(() => {
        setDisplayedStep(state.currentStep);

        // After a brief moment, end the transition (allows fade-in to complete)
        const fadeInTimer = setTimeout(() => {
          setIsTransitioning(false);
        }, FADE_IN_DURATION);

        return () => clearTimeout(fadeInTimer);
      }, FADE_OUT_DURATION);

      return () => clearTimeout(fadeOutTimer);
    }
  }, [state.currentStep, displayedStep, isTransitioning]);

  // Sync displayedStep when wizard opens (in case state was restored)
  useEffect(() => {
    if (state.isOpen) {
      setDisplayedStep(state.currentStep);
    }
  }, [state.isOpen, state.currentStep]);

  // Track wizard start for analytics
  useEffect(() => {
    if (state.isOpen && !wizardStartedRef.current) {
      wizardStartedRef.current = true;
      wizardStartTimeRef.current = Date.now();

      // Determine if this is a fresh start or resume based on current step
      // If we're on step 1, it's a fresh start. Otherwise, it's a resume.
      if (getCurrentStepNumber() === 1) {
        if (onWizardStart) {
          onWizardStart();
        }
      } else {
        if (onWizardResume) {
          onWizardResume();
        }
      }
    } else if (!state.isOpen) {
      // Reset when wizard closes
      wizardStartedRef.current = false;
    }
  }, [state.isOpen, getCurrentStepNumber, onWizardStart, onWizardResume]);

  // Announce step changes to screen readers
  useEffect(() => {
    // Only announce when wizard is open and not transitioning
    if (state.isOpen && !isTransitioning) {
      const stepNumber = STEP_INDEX[displayedStep];
      const title = getStepTitle(displayedStep);
      const newAnnouncement = `Step ${stepNumber} of ${WIZARD_TOTAL_STEPS}: ${title}`;
      setAnnouncement(newAnnouncement);
      setAnnouncementKey((prev) => prev + 1);
    }
  }, [state.isOpen, displayedStep, isTransitioning]);

  // Register with layer stack for Escape handling
  useEffect(() => {
    if (state.isOpen && !showExitConfirm) {
      const id = registerLayer({
        type: 'modal',
        priority: MODAL_PRIORITIES.WIZARD,
        blocksLowerLayers: true,
        capturesFocus: true,
        focusTrap: 'strict',
        ariaLabel: 'Setup Wizard',
        onEscape: handleCloseRequest,
      });
      return () => unregisterLayer(id);
    }
  }, [state.isOpen, showExitConfirm, registerLayer, unregisterLayer, handleCloseRequest]);

  /**
   * Render the appropriate screen component based on displayed step
   * Uses displayedStep (not currentStep) to allow for transition animations
   * NOTE: This must be defined before the early return to satisfy React hooks rules
   */
  const renderCurrentScreen = useCallback(() => {
    switch (displayedStep) {
      case 'agent-selection':
        return <AgentSelectionScreen theme={theme} />;
      case 'directory-selection':
        return <DirectorySelectionScreen theme={theme} />;
      case 'conversation':
        return <ConversationScreen theme={theme} />;
      case 'phase-review':
        return (
          <PhaseReviewScreen
            theme={theme}
            onLaunchSession={onLaunchSession || (async () => {})}
            onWizardComplete={onWizardComplete}
            wizardStartTime={wizardStartTimeRef.current}
          />
        );
      default:
        return null;
    }
  }, [displayedStep, theme, onLaunchSession, onWizardComplete]);

  // Don't render if wizard is not open
  if (!state.isOpen) {
    return null;
  }

  const currentStepNumber = getCurrentStepNumber();
  const stepTitle = getStepTitle(state.currentStep);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center wizard-backdrop"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          handleCloseRequest();
        }
      }}
    >
      {/* Screen reader announcements for step changes */}
      <ScreenReaderAnnouncement
        message={announcement}
        announceKey={announcementKey}
        politeness="polite"
      />

      <div
        className="w-[90vw] h-[80vh] max-w-5xl rounded-xl border shadow-2xl flex flex-col overflow-hidden wizard-modal"
        style={{
          backgroundColor: theme.colors.bgMain,
          borderColor: theme.colors.border,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b wizard-header"
          style={{
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.bgSidebar,
          }}
        >
          {/* Step indicator and title */}
          <div className="flex items-center gap-4">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold"
              style={{
                backgroundColor: theme.colors.accent,
                color: theme.colors.accentForeground,
              }}
            >
              {currentStepNumber}
            </div>
            <div>
              <h2
                id="wizard-title"
                className="text-lg font-semibold"
                style={{ color: theme.colors.textMain }}
              >
                {stepTitle}
              </h2>
              <p
                className="text-xs"
                style={{ color: theme.colors.textDim }}
              >
                Step {currentStepNumber} of {WIZARD_TOTAL_STEPS}
              </p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {Array.from({ length: WIZARD_TOTAL_STEPS }, (_, i) => {
              const stepNum = i + 1;
              const isActive = stepNum === currentStepNumber;
              const isCompleted = stepNum < currentStepNumber;

              return (
                <div
                  key={stepNum}
                  className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: isActive
                      ? theme.colors.accent
                      : isCompleted
                      ? theme.colors.success
                      : theme.colors.border,
                    transform: isActive ? 'scale(1.2)' : 'scale(1)',
                  }}
                  aria-label={`Step ${stepNum}${isActive ? ' (current)' : isCompleted ? ' (completed)' : ''}`}
                />
              );
            })}
          </div>

          {/* Close button */}
          <button
            onClick={handleCloseRequest}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: theme.colors.textDim }}
            title="Close wizard (Escape)"
            aria-label="Close wizard"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content area - renders the current screen with transition animations */}
        <div
          className={`flex-1 overflow-hidden wizard-content ${
            isTransitioning ? 'wizard-content-exiting' : 'wizard-content-entering'
          } ${transitionDirection === 'forward' ? 'wizard-forward' : 'wizard-backward'}`}
          key={displayedStep}
        >
          {renderCurrentScreen()}
        </div>
      </div>

      {/* Fade transition styles */}
      <style>{`
        .wizard-backdrop {
          animation: wizard-fade-in 0.2s ease-out;
        }

        .wizard-modal {
          animation: wizard-slide-up 0.3s ease-out;
        }

        /* Base content styles */
        .wizard-content {
          transition: opacity 150ms ease-out, transform 150ms ease-out;
          will-change: opacity, transform;
        }

        /* Entering state - content fades in with subtle slide */
        .wizard-content-entering {
          opacity: 1;
          transform: translateX(0);
          animation: wizard-screen-enter 200ms ease-out;
        }

        /* Exiting state - content fades out */
        .wizard-content-exiting {
          opacity: 0;
          transform: translateX(0);
        }

        /* Forward direction (going to next step) - slide from right */
        .wizard-forward.wizard-content-entering {
          animation: wizard-slide-in-right 200ms ease-out;
        }

        /* Backward direction (going to previous step) - slide from left */
        .wizard-backward.wizard-content-entering {
          animation: wizard-slide-in-left 200ms ease-out;
        }

        @keyframes wizard-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes wizard-slide-up {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes wizard-screen-enter {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes wizard-slide-in-right {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes wizard-slide-in-left {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        /* Respect reduced motion preferences */
        @media (prefers-reduced-motion: reduce) {
          .wizard-content {
            transition: opacity 150ms ease-out;
            transform: none !important;
          }

          .wizard-content-entering {
            animation: wizard-screen-enter 200ms ease-out;
          }

          @keyframes wizard-slide-in-right {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes wizard-slide-in-left {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>

      {/* Exit confirmation modal */}
      {showExitConfirm && (
        <WizardExitConfirmModal
          theme={theme}
          currentStep={currentStepNumber}
          totalSteps={WIZARD_TOTAL_STEPS}
          onConfirmExit={handleConfirmExit}
          onCancel={handleCancelExit}
        />
      )}
    </div>
  );
}
