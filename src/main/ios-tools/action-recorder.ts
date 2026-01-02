/**
 * iOS Tools - Action Recorder
 *
 * Records user interactions on the iOS Simulator and converts them
 * into replayable Maestro Mobile YAML flows or native driver actions.
 *
 * This recorder captures:
 * - Tap/touch events with coordinates and element identification
 * - Text input events
 * - Scroll/swipe gestures
 * - App lifecycle events
 *
 * The recorded actions can be exported to:
 * - Maestro Mobile YAML format for use with /ios.run_flow
 * - Native driver action sequences for use with NativeDriver
 */

import { IOSResult } from './types';
import { logger } from '../utils/logger';
import { getBootedSimulators } from './simulator';
import { generateFlow, FlowStep, FlowConfig, GeneratedFlow } from './flow-generator';
import { ActionRequest, SwipeDirection } from './native-driver';

const LOG_CONTEXT = '[iOS-ActionRecorder]';

// =============================================================================
// Types
// =============================================================================

/**
 * Types of recordable actions
 */
export type RecordedActionType =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'type'
  | 'scroll'
  | 'swipe'
  | 'launchApp'
  | 'terminateApp'
  | 'screenshot';

/**
 * A recorded action with timestamp and context
 */
export interface RecordedAction {
  /** Unique ID for this action */
  id: string;
  /** Type of action */
  type: RecordedActionType;
  /** Timestamp when action occurred */
  timestamp: Date;
  /** Duration of the action in milliseconds (for long press, etc.) */
  duration?: number;
  /** Target element information if available */
  element?: RecordedElement;
  /** Coordinates if available */
  coordinates?: {
    x: number;
    y: number;
  };
  /** End coordinates for swipe/scroll */
  endCoordinates?: {
    x: number;
    y: number;
  };
  /** Text content for type actions */
  text?: string;
  /** Direction for scroll/swipe */
  direction?: SwipeDirection;
  /** App bundle ID for launch/terminate */
  bundleId?: string;
  /** Screenshot path if captured */
  screenshotPath?: string;
  /** User-provided description/annotation */
  annotation?: string;
}

/**
 * Information about a recorded element
 */
export interface RecordedElement {
  /** Accessibility identifier */
  identifier?: string;
  /** Accessibility label */
  label?: string;
  /** Element type (e.g., "Button", "TextField") */
  type?: string;
  /** Element text content */
  text?: string;
  /** Element frame */
  frame?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Options for starting a recording session
 */
export interface RecordingOptions {
  /** Simulator UDID (auto-detects if not provided) */
  udid?: string;
  /** App bundle ID being recorded */
  bundleId?: string;
  /** Directory to save screenshots */
  screenshotDir?: string;
  /** Whether to capture screenshots automatically on each action */
  autoScreenshot?: boolean;
  /** Whether to include element information (requires inspection) */
  captureElements?: boolean;
  /** Maximum recording duration in milliseconds (default: 5 minutes) */
  maxDuration?: number;
  /** Flow name for the recording */
  flowName?: string;
  /** Description for the recording */
  description?: string;
}

/**
 * State of a recording session
 */
export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

/**
 * Recording session information
 */
export interface RecordingSession {
  /** Session ID */
  id: string;
  /** Current state */
  state: RecordingState;
  /** When recording started */
  startTime: Date;
  /** When recording ended (if stopped) */
  endTime?: Date;
  /** Total duration in milliseconds */
  duration: number;
  /** Recording options */
  options: Required<RecordingOptions>;
  /** Recorded actions */
  actions: RecordedAction[];
  /** Number of actions recorded */
  actionCount: number;
  /** Target simulator */
  simulator?: {
    udid: string;
    name: string;
  };
}

/**
 * Result of stopping a recording
 */
export interface StopRecordingResult {
  /** Recording session information */
  session: RecordingSession;
  /** Generated Maestro YAML flow (if requested) */
  maestroFlow?: GeneratedFlow;
  /** Generated native driver actions (if requested) */
  nativeActions?: ActionRequest[];
  /** Path to saved recording file (if saved) */
  savedPath?: string;
}

/**
 * Options for stopping a recording
 */
export interface StopRecordingOptions {
  /** Generate Maestro YAML flow */
  generateMaestroFlow?: boolean;
  /** Generate native driver actions */
  generateNativeActions?: boolean;
  /** Save recording to file */
  savePath?: string;
  /** Optional flow config for Maestro YAML */
  flowConfig?: FlowConfig;
}

// =============================================================================
// Recording State
// =============================================================================

/** Current recording session (null when not recording) */
let currentSession: RecordingSession | null = null;

/** Action ID counter */
let actionIdCounter = 0;

/** Recording timeout handle */
let recordingTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

// =============================================================================
// Session Management
// =============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique action ID
 */
function generateActionId(): string {
  actionIdCounter++;
  return `action-${actionIdCounter}`;
}

/**
 * Check if recording is currently active
 */
export function isRecordingActive(): boolean {
  return currentSession !== null && currentSession.state === 'recording';
}

/**
 * Get the current recording session (if any)
 */
export function getCurrentSession(): RecordingSession | null {
  return currentSession;
}

/**
 * Get recording statistics
 */
export function getRecordingStats(): {
  isRecording: boolean;
  actionCount: number;
  duration: number;
  state: RecordingState;
} {
  if (!currentSession) {
    return {
      isRecording: false,
      actionCount: 0,
      duration: 0,
      state: 'idle',
    };
  }

  return {
    isRecording: currentSession.state === 'recording',
    actionCount: currentSession.actions.length,
    duration: Date.now() - currentSession.startTime.getTime(),
    state: currentSession.state,
  };
}

// =============================================================================
// Recording Control
// =============================================================================

/**
 * Start a new recording session.
 *
 * @param options - Recording configuration options
 * @returns Result with the started recording session
 */
export async function startRecording(
  options: RecordingOptions = {}
): Promise<IOSResult<RecordingSession>> {
  // Check if already recording
  if (currentSession && currentSession.state === 'recording') {
    return {
      success: false,
      error: 'Recording already in progress. Stop the current recording first.',
      errorCode: 'COMMAND_FAILED',
    };
  }

  logger.info(`${LOG_CONTEXT} Starting recording session`, LOG_CONTEXT);

  // Determine simulator
  let simulator: { udid: string; name: string } | undefined;

  if (options.udid) {
    simulator = { udid: options.udid, name: 'Unknown' };
  } else {
    const bootedResult = await getBootedSimulators();
    if (bootedResult.success && bootedResult.data && bootedResult.data.length > 0) {
      const sim = bootedResult.data[0];
      simulator = { udid: sim.udid, name: sim.name };
    }
  }

  if (!simulator) {
    return {
      success: false,
      error: 'No booted simulator found. Please boot a simulator first.',
      errorCode: 'SIMULATOR_NOT_BOOTED',
    };
  }

  // Create session with resolved options
  const sessionId = generateSessionId();
  const resolvedOptions: Required<RecordingOptions> = {
    udid: simulator.udid,
    bundleId: options.bundleId ?? '',
    screenshotDir: options.screenshotDir ?? '',
    autoScreenshot: options.autoScreenshot ?? false,
    captureElements: options.captureElements ?? false,
    maxDuration: options.maxDuration ?? 5 * 60 * 1000, // 5 minutes default
    flowName: options.flowName ?? `Recording ${new Date().toISOString()}`,
    description: options.description ?? '',
  };

  currentSession = {
    id: sessionId,
    state: 'recording',
    startTime: new Date(),
    duration: 0,
    options: resolvedOptions,
    actions: [],
    actionCount: 0,
    simulator,
  };

  // Set up max duration timeout
  if (resolvedOptions.maxDuration > 0) {
    recordingTimeoutHandle = setTimeout(() => {
      logger.warn(
        `${LOG_CONTEXT} Recording max duration reached (${resolvedOptions.maxDuration}ms)`,
        LOG_CONTEXT
      );
      if (currentSession && currentSession.state === 'recording') {
        currentSession.state = 'stopped';
        currentSession.endTime = new Date();
        currentSession.duration = Date.now() - currentSession.startTime.getTime();
      }
    }, resolvedOptions.maxDuration);
  }

  logger.info(
    `${LOG_CONTEXT} Recording started: ${sessionId} on simulator ${simulator.name}`,
    LOG_CONTEXT
  );

  return {
    success: true,
    data: currentSession,
  };
}

/**
 * Stop the current recording session.
 *
 * @param options - Options for stopping and exporting the recording
 * @returns Result with the stopped session and optional exports
 */
export async function stopRecording(
  options: StopRecordingOptions = {}
): Promise<IOSResult<StopRecordingResult>> {
  if (!currentSession) {
    return {
      success: false,
      error: 'No recording in progress',
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Clear timeout if set
  if (recordingTimeoutHandle) {
    clearTimeout(recordingTimeoutHandle);
    recordingTimeoutHandle = null;
  }

  // Update session state
  currentSession.state = 'stopped';
  currentSession.endTime = new Date();
  currentSession.duration = currentSession.endTime.getTime() - currentSession.startTime.getTime();
  currentSession.actionCount = currentSession.actions.length;

  logger.info(
    `${LOG_CONTEXT} Recording stopped: ${currentSession.id} (${currentSession.actions.length} actions)`,
    LOG_CONTEXT
  );

  const result: StopRecordingResult = {
    session: { ...currentSession },
  };

  // Generate Maestro flow if requested
  if (options.generateMaestroFlow !== false) {
    const flowSteps = convertToFlowSteps(currentSession.actions);
    if (flowSteps.length > 0) {
      const flowConfig: FlowConfig = {
        appId: currentSession.options.bundleId || undefined,
        name: currentSession.options.flowName,
        ...options.flowConfig,
      };
      const flowResult = generateFlow(flowSteps, flowConfig);
      if (flowResult.success && flowResult.data) {
        result.maestroFlow = flowResult.data;
      }
    }
  }

  // Generate native actions if requested
  if (options.generateNativeActions) {
    result.nativeActions = convertToNativeActions(currentSession.actions);
  }

  // Clear current session
  currentSession = null;
  actionIdCounter = 0;

  return {
    success: true,
    data: result,
  };
}

/**
 * Pause the current recording session.
 */
export function pauseRecording(): IOSResult<RecordingSession> {
  if (!currentSession) {
    return {
      success: false,
      error: 'No recording in progress',
      errorCode: 'COMMAND_FAILED',
    };
  }

  if (currentSession.state !== 'recording') {
    return {
      success: false,
      error: `Cannot pause recording in state: ${currentSession.state}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  currentSession.state = 'paused';
  logger.info(`${LOG_CONTEXT} Recording paused`, LOG_CONTEXT);

  return {
    success: true,
    data: currentSession,
  };
}

/**
 * Resume a paused recording session.
 */
export function resumeRecording(): IOSResult<RecordingSession> {
  if (!currentSession) {
    return {
      success: false,
      error: 'No recording in progress',
      errorCode: 'COMMAND_FAILED',
    };
  }

  if (currentSession.state !== 'paused') {
    return {
      success: false,
      error: `Cannot resume recording in state: ${currentSession.state}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  currentSession.state = 'recording';
  logger.info(`${LOG_CONTEXT} Recording resumed`, LOG_CONTEXT);

  return {
    success: true,
    data: currentSession,
  };
}

/**
 * Cancel and discard the current recording.
 */
export function cancelRecording(): IOSResult<void> {
  if (!currentSession) {
    return {
      success: false,
      error: 'No recording in progress',
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Clear timeout if set
  if (recordingTimeoutHandle) {
    clearTimeout(recordingTimeoutHandle);
    recordingTimeoutHandle = null;
  }

  logger.info(`${LOG_CONTEXT} Recording cancelled: ${currentSession.id}`, LOG_CONTEXT);

  currentSession = null;
  actionIdCounter = 0;

  return { success: true };
}

// =============================================================================
// Action Recording
// =============================================================================

/**
 * Record a tap action
 */
export function recordTap(
  x: number,
  y: number,
  element?: RecordedElement,
  annotation?: string
): IOSResult<RecordedAction> {
  return recordAction({
    type: 'tap',
    coordinates: { x, y },
    element,
    annotation,
  });
}

/**
 * Record a double tap action
 */
export function recordDoubleTap(
  x: number,
  y: number,
  element?: RecordedElement,
  annotation?: string
): IOSResult<RecordedAction> {
  return recordAction({
    type: 'doubleTap',
    coordinates: { x, y },
    element,
    annotation,
  });
}

/**
 * Record a long press action
 */
export function recordLongPress(
  x: number,
  y: number,
  duration: number,
  element?: RecordedElement,
  annotation?: string
): IOSResult<RecordedAction> {
  return recordAction({
    type: 'longPress',
    coordinates: { x, y },
    duration,
    element,
    annotation,
  });
}

/**
 * Record a text input action
 */
export function recordType(
  text: string,
  element?: RecordedElement,
  annotation?: string
): IOSResult<RecordedAction> {
  return recordAction({
    type: 'type',
    text,
    element,
    annotation,
  });
}

/**
 * Record a scroll action
 */
export function recordScroll(
  direction: SwipeDirection,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  annotation?: string
): IOSResult<RecordedAction> {
  return recordAction({
    type: 'scroll',
    direction,
    coordinates: { x: startX, y: startY },
    endCoordinates: { x: endX, y: endY },
    annotation,
  });
}

/**
 * Record a swipe action
 */
export function recordSwipe(
  direction: SwipeDirection,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  annotation?: string
): IOSResult<RecordedAction> {
  return recordAction({
    type: 'swipe',
    direction,
    coordinates: { x: startX, y: startY },
    endCoordinates: { x: endX, y: endY },
    annotation,
  });
}

/**
 * Record an app launch action
 */
export function recordLaunchApp(bundleId: string, annotation?: string): IOSResult<RecordedAction> {
  return recordAction({
    type: 'launchApp',
    bundleId,
    annotation,
  });
}

/**
 * Record an app terminate action
 */
export function recordTerminateApp(
  bundleId: string,
  annotation?: string
): IOSResult<RecordedAction> {
  return recordAction({
    type: 'terminateApp',
    bundleId,
    annotation,
  });
}

/**
 * Record a screenshot capture
 */
export function recordScreenshot(
  screenshotPath: string,
  annotation?: string
): IOSResult<RecordedAction> {
  return recordAction({
    type: 'screenshot',
    screenshotPath,
    annotation,
  });
}

/**
 * Add an annotation to the last recorded action
 */
export function annotateLastAction(annotation: string): IOSResult<RecordedAction> {
  if (!currentSession || currentSession.actions.length === 0) {
    return {
      success: false,
      error: 'No actions to annotate',
      errorCode: 'COMMAND_FAILED',
    };
  }

  const lastAction = currentSession.actions[currentSession.actions.length - 1];
  lastAction.annotation = annotation;

  return {
    success: true,
    data: lastAction,
  };
}

/**
 * Internal function to record an action
 */
function recordAction(
  action: Omit<RecordedAction, 'id' | 'timestamp'>
): IOSResult<RecordedAction> {
  if (!currentSession) {
    return {
      success: false,
      error: 'No recording in progress',
      errorCode: 'COMMAND_FAILED',
    };
  }

  if (currentSession.state !== 'recording') {
    return {
      success: false,
      error: `Cannot record action in state: ${currentSession.state}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  const recordedAction: RecordedAction = {
    ...action,
    id: generateActionId(),
    timestamp: new Date(),
  };

  currentSession.actions.push(recordedAction);

  logger.debug(
    `${LOG_CONTEXT} Recorded action: ${recordedAction.type} (${recordedAction.id})`,
    LOG_CONTEXT
  );

  return {
    success: true,
    data: recordedAction,
  };
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert recorded actions to Maestro FlowStep array
 */
export function convertToFlowSteps(actions: RecordedAction[]): FlowStep[] {
  const steps: FlowStep[] = [];

  for (const action of actions) {
    const step = convertActionToFlowStep(action);
    if (step) {
      steps.push(step);
    }
  }

  return steps;
}

/**
 * Convert a single recorded action to a Maestro FlowStep
 */
function convertActionToFlowStep(action: RecordedAction): FlowStep | null {
  switch (action.type) {
    case 'tap':
      // Prefer element identifier/label over coordinates
      if (action.element?.identifier) {
        return {
          action: 'tap',
          id: action.element.identifier,
          description: action.annotation,
        };
      }
      if (action.element?.label) {
        return {
          action: 'tap',
          text: action.element.label,
          description: action.annotation,
        };
      }
      if (action.coordinates) {
        return {
          action: 'tap',
          point: action.coordinates,
          description: action.annotation,
        };
      }
      return null;

    case 'doubleTap':
      // Double tap uses tapCount: 2 in Maestro
      if (action.element?.identifier) {
        return {
          action: 'tap',
          id: action.element.identifier,
          tapCount: 2,
          description: action.annotation,
        };
      }
      if (action.element?.label) {
        return {
          action: 'tap',
          text: action.element.label,
          tapCount: 2,
          description: action.annotation,
        };
      }
      if (action.coordinates) {
        return {
          action: 'tap',
          point: action.coordinates,
          tapCount: 2,
          description: action.annotation,
        };
      }
      return null;

    case 'type':
      if (action.text) {
        return {
          action: 'inputText',
          text: action.text,
          id: action.element?.identifier,
          description: action.annotation,
        };
      }
      return null;

    case 'scroll':
      if (action.direction) {
        return {
          action: 'scroll',
          direction: action.direction,
          description: action.annotation,
        };
      }
      return null;

    case 'swipe':
      if (action.coordinates && action.endCoordinates) {
        return {
          action: 'swipe',
          start: { x: action.coordinates.x, y: action.coordinates.y },
          end: { x: action.endCoordinates.x, y: action.endCoordinates.y },
          description: action.annotation,
        };
      }
      return null;

    case 'launchApp':
      return {
        action: 'launchApp',
        bundleId: action.bundleId,
        description: action.annotation,
      };

    case 'terminateApp':
      return {
        action: 'stopApp',
        bundleId: action.bundleId,
        description: action.annotation,
      };

    case 'screenshot':
      return {
        action: 'screenshot',
        filename: action.screenshotPath,
        description: action.annotation,
      };

    case 'longPress':
      // Maestro doesn't have direct long press, but we can note it
      if (action.coordinates) {
        return {
          action: 'tap',
          point: action.coordinates,
          description: action.annotation
            ? `Long press (${action.duration}ms): ${action.annotation}`
            : `Long press (${action.duration}ms)`,
        };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Convert recorded actions to native driver ActionRequest array
 */
export function convertToNativeActions(actions: RecordedAction[]): ActionRequest[] {
  const requests: ActionRequest[] = [];

  for (const action of actions) {
    const request = convertActionToNativeRequest(action);
    if (request) {
      requests.push(request);
    }
  }

  return requests;
}

/**
 * Convert a single recorded action to a native driver ActionRequest
 */
function convertActionToNativeRequest(action: RecordedAction): ActionRequest | null {
  switch (action.type) {
    case 'tap':
      if (action.element?.identifier) {
        return {
          type: 'tap',
          target: { type: 'identifier', value: action.element.identifier },
        };
      }
      if (action.element?.label) {
        return {
          type: 'tap',
          target: { type: 'label', value: action.element.label },
        };
      }
      if (action.coordinates) {
        return {
          type: 'tap',
          target: { type: 'coordinates', value: `${action.coordinates.x},${action.coordinates.y}` },
        };
      }
      return null;

    case 'doubleTap':
      if (action.element?.identifier) {
        return {
          type: 'doubleTap',
          target: { type: 'identifier', value: action.element.identifier },
        };
      }
      if (action.element?.label) {
        return {
          type: 'doubleTap',
          target: { type: 'label', value: action.element.label },
        };
      }
      if (action.coordinates) {
        return {
          type: 'doubleTap',
          target: { type: 'coordinates', value: `${action.coordinates.x},${action.coordinates.y}` },
        };
      }
      return null;

    case 'longPress':
      if (action.element?.identifier) {
        return {
          type: 'longPress',
          target: { type: 'identifier', value: action.element.identifier },
          duration: action.duration ? action.duration / 1000 : 1.0,
        };
      }
      if (action.coordinates) {
        return {
          type: 'longPress',
          target: { type: 'coordinates', value: `${action.coordinates.x},${action.coordinates.y}` },
          duration: action.duration ? action.duration / 1000 : 1.0,
        };
      }
      return null;

    case 'type':
      if (action.text) {
        if (action.element?.identifier) {
          return {
            type: 'typeText',
            text: action.text,
            target: { type: 'identifier', value: action.element.identifier },
          };
        }
        return {
          type: 'typeText',
          text: action.text,
        };
      }
      return null;

    case 'scroll':
      if (action.direction) {
        return {
          type: 'scroll',
          direction: action.direction,
        };
      }
      return null;

    case 'swipe':
      if (action.direction) {
        return {
          type: 'swipe',
          direction: action.direction,
        };
      }
      return null;

    default:
      return null;
  }
}

// =============================================================================
// Export Functions
// =============================================================================

/**
 * Export the current or provided session to Maestro YAML
 */
export function exportToMaestroYaml(
  session: RecordingSession,
  config?: FlowConfig
): IOSResult<GeneratedFlow> {
  const steps = convertToFlowSteps(session.actions);

  if (steps.length === 0) {
    return {
      success: false,
      error: 'No actions to export',
      errorCode: 'PARSE_ERROR',
    };
  }

  const flowConfig: FlowConfig = {
    appId: session.options.bundleId || undefined,
    name: session.options.flowName,
    ...config,
  };

  return generateFlow(steps, flowConfig);
}

/**
 * Export the current or provided session to native driver actions
 */
export function exportToNativeActions(session: RecordingSession): IOSResult<ActionRequest[]> {
  const actions = convertToNativeActions(session.actions);

  if (actions.length === 0) {
    return {
      success: false,
      error: 'No actions to export',
      errorCode: 'PARSE_ERROR',
    };
  }

  return {
    success: true,
    data: actions,
  };
}
