/**
 * iOS Assertions - Index
 *
 * Central export point for all iOS assertion functions.
 */

// =============================================================================
// Visibility Assertions
// =============================================================================

export {
  assertVisible,
  assertVisibleById,
  assertVisibleByLabel,
  assertVisibleByText,
  assertNotVisible,
} from './visible';
export type {
  ElementTarget,
  AssertVisibleOptions,
  VisibleAssertionData,
} from './visible';

// =============================================================================
// Wait For Assertions
// =============================================================================

export {
  waitFor,
  waitForById,
  waitForByLabel,
  waitForByText,
  waitForNot,
  waitForNotById,
  waitForNotByLabel,
  waitForNotByText,
} from './wait-for';
export type {
  WaitForTarget,
  WaitForOptions,
  WaitForData,
} from './wait-for';

// =============================================================================
// Text Assertions
// =============================================================================

export {
  assertText,
  assertTextById,
  assertTextByLabel,
  assertTextContains,
  assertTextMatches,
  assertTextStartsWith,
  assertTextEndsWith,
} from './text';
export type {
  TextMatchMode,
  TextElementTarget,
  AssertTextOptions,
  TextAssertionData,
} from './text';

// =============================================================================
// Crash Assertions
// =============================================================================

export {
  assertNoCrash,
  hasCrashed,
  waitForNoCrash,
  assertNoCrashInWindow,
} from './no-crash';
export type {
  AssertNoCrashOptions,
  NoCrashAssertionData,
} from './no-crash';
