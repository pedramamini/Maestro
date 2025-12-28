/**
 * Tests for useInlineWizard hook
 *
 * Tests the inline wizard state management and intent parsing flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInlineWizard } from '../../../renderer/hooks/useInlineWizard';

// Mock the dependencies
vi.mock('../../../renderer/services/wizardIntentParser', () => ({
  parseWizardIntent: vi.fn(),
}));

vi.mock('../../../renderer/utils/existingDocsDetector', () => ({
  hasExistingAutoRunDocs: vi.fn(),
  getExistingAutoRunDocs: vi.fn(),
}));

// Import mocked modules
import { parseWizardIntent } from '../../../renderer/services/wizardIntentParser';
import {
  hasExistingAutoRunDocs,
  getExistingAutoRunDocs,
} from '../../../renderer/utils/existingDocsDetector';

const mockParseWizardIntent = vi.mocked(parseWizardIntent);
const mockHasExistingAutoRunDocs = vi.mocked(hasExistingAutoRunDocs);
const mockGetExistingAutoRunDocs = vi.mocked(getExistingAutoRunDocs);

describe('useInlineWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockHasExistingAutoRunDocs.mockResolvedValue(false);
    mockGetExistingAutoRunDocs.mockResolvedValue([]);
    mockParseWizardIntent.mockReturnValue({ mode: 'new' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useInlineWizard());

      expect(result.current.isWizardActive).toBe(false);
      expect(result.current.isInitializing).toBe(false);
      expect(result.current.wizardMode).toBe(null);
      expect(result.current.wizardGoal).toBe(null);
      expect(result.current.confidence).toBe(0);
      expect(result.current.conversationHistory).toEqual([]);
      expect(result.current.isGeneratingDocs).toBe(false);
      expect(result.current.generatedDocuments).toEqual([]);
      expect(result.current.existingDocuments).toEqual([]);
      expect(result.current.error).toBe(null);
    });
  });

  describe('startWizard - intent parsing flow', () => {
    describe('when no input is provided', () => {
      it('should set mode to "ask" when existing docs exist', async () => {
        mockHasExistingAutoRunDocs.mockResolvedValue(true);

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard(undefined, undefined, '/test/project');
        });

        expect(result.current.isWizardActive).toBe(true);
        expect(result.current.wizardMode).toBe('ask');
        expect(mockHasExistingAutoRunDocs).toHaveBeenCalledWith('/test/project');
      });

      it('should set mode to "new" when no existing docs', async () => {
        mockHasExistingAutoRunDocs.mockResolvedValue(false);

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard(undefined, undefined, '/test/project');
        });

        expect(result.current.wizardMode).toBe('new');
      });

      it('should set mode to "new" when no project path is provided', async () => {
        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard();
        });

        // Without a project path, hasExistingDocs defaults to false → new mode
        expect(result.current.wizardMode).toBe('new');
        expect(mockHasExistingAutoRunDocs).not.toHaveBeenCalled();
      });
    });

    describe('when input is provided', () => {
      it('should call parseWizardIntent with input and hasExistingDocs', async () => {
        mockHasExistingAutoRunDocs.mockResolvedValue(true);
        mockParseWizardIntent.mockReturnValue({ mode: 'iterate', goal: 'add auth' });

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('add authentication', undefined, '/test/project');
        });

        expect(mockParseWizardIntent).toHaveBeenCalledWith('add authentication', true);
        expect(result.current.wizardMode).toBe('iterate');
        expect(result.current.wizardGoal).toBe('add auth');
      });

      it('should handle new mode from intent parser', async () => {
        mockHasExistingAutoRunDocs.mockResolvedValue(true);
        mockParseWizardIntent.mockReturnValue({ mode: 'new' });

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('start fresh', undefined, '/test/project');
        });

        expect(result.current.wizardMode).toBe('new');
        expect(result.current.wizardGoal).toBe(null);
      });

      it('should handle ask mode from intent parser', async () => {
        mockHasExistingAutoRunDocs.mockResolvedValue(true);
        mockParseWizardIntent.mockReturnValue({ mode: 'ask' });

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('do something', undefined, '/test/project');
        });

        expect(result.current.wizardMode).toBe('ask');
      });

      it('should trim whitespace from input', async () => {
        mockParseWizardIntent.mockReturnValue({ mode: 'new' });

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('  add feature  ', undefined, '/test/project');
        });

        expect(mockParseWizardIntent).toHaveBeenCalledWith('add feature', expect.any(Boolean));
      });
    });

    describe('loading existing docs for iterate mode', () => {
      it('should load existing docs when mode is iterate', async () => {
        const mockDocs = [
          { name: 'phase-1', filename: 'phase-1.md', path: '/test/Auto Run Docs/phase-1.md' },
          { name: 'phase-2', filename: 'phase-2.md', path: '/test/Auto Run Docs/phase-2.md' },
        ];
        mockHasExistingAutoRunDocs.mockResolvedValue(true);
        mockGetExistingAutoRunDocs.mockResolvedValue(mockDocs);
        mockParseWizardIntent.mockReturnValue({ mode: 'iterate', goal: 'add feature' });

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('add new feature', undefined, '/test/project');
        });

        expect(mockGetExistingAutoRunDocs).toHaveBeenCalledWith('/test/project');
        expect(result.current.existingDocuments).toEqual(mockDocs);
      });

      it('should not load existing docs when mode is new', async () => {
        mockHasExistingAutoRunDocs.mockResolvedValue(true);
        mockParseWizardIntent.mockReturnValue({ mode: 'new' });

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('start fresh', undefined, '/test/project');
        });

        expect(mockGetExistingAutoRunDocs).not.toHaveBeenCalled();
        expect(result.current.existingDocuments).toEqual([]);
      });

      it('should not load existing docs when mode is ask', async () => {
        mockHasExistingAutoRunDocs.mockResolvedValue(true);
        mockParseWizardIntent.mockReturnValue({ mode: 'ask' });

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('do something', undefined, '/test/project');
        });

        expect(mockGetExistingAutoRunDocs).not.toHaveBeenCalled();
      });
    });

    describe('isInitializing state', () => {
      it('should set isInitializing to false after async operations complete', async () => {
        mockHasExistingAutoRunDocs.mockResolvedValue(false);

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('test', undefined, '/test/project');
        });

        // After the async operation completes, isInitializing should be false
        expect(result.current.isInitializing).toBe(false);
        expect(result.current.isWizardActive).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should handle errors from hasExistingAutoRunDocs', async () => {
        mockHasExistingAutoRunDocs.mockRejectedValue(new Error('Failed to check docs'));

        const { result } = renderHook(() => useInlineWizard());
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await act(async () => {
          await result.current.startWizard('test', undefined, '/test/project');
        });

        expect(result.current.error).toBe('Failed to check docs');
        expect(result.current.wizardMode).toBe('new'); // Fallback to new mode
        expect(result.current.isInitializing).toBe(false);

        consoleSpy.mockRestore();
      });

      it('should handle errors from getExistingAutoRunDocs', async () => {
        mockHasExistingAutoRunDocs.mockResolvedValue(true);
        mockParseWizardIntent.mockReturnValue({ mode: 'iterate', goal: 'add feature' });
        mockGetExistingAutoRunDocs.mockRejectedValue(new Error('Failed to load docs'));

        const { result } = renderHook(() => useInlineWizard());
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await act(async () => {
          await result.current.startWizard('add feature', undefined, '/test/project');
        });

        expect(result.current.error).toBe('Failed to load docs');
        expect(result.current.wizardMode).toBe('new'); // Fallback to new mode
        expect(result.current.isInitializing).toBe(false);

        consoleSpy.mockRestore();
      });

      it('should handle non-Error exceptions', async () => {
        mockHasExistingAutoRunDocs.mockRejectedValue('String error');

        const { result } = renderHook(() => useInlineWizard());
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await act(async () => {
          await result.current.startWizard('test', undefined, '/test/project');
        });

        expect(result.current.error).toBe('Failed to initialize wizard');

        consoleSpy.mockRestore();
      });
    });

    describe('previousUIState preservation', () => {
      it('should store and restore previousUIState', async () => {
        const uiState = { readOnlyMode: true, saveToHistory: false, showThinking: true };

        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('test', uiState, '/test/project');
        });

        expect(result.current.state.previousUIState).toEqual(uiState);

        let returnedState: typeof uiState | null;
        act(() => {
          returnedState = result.current.endWizard();
        });

        expect(returnedState).toEqual(uiState);
      });
    });

    describe('projectPath storage', () => {
      it('should store projectPath in state', async () => {
        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('test', undefined, '/my/project/path');
        });

        expect(result.current.state.projectPath).toBe('/my/project/path');
      });

      it('should handle missing projectPath', async () => {
        const { result } = renderHook(() => useInlineWizard());

        await act(async () => {
          await result.current.startWizard('test');
        });

        expect(result.current.state.projectPath).toBe(null);
      });
    });
  });

  describe('endWizard', () => {
    it('should reset state to initial values', async () => {
      const { result } = renderHook(() => useInlineWizard());

      // Start wizard
      await act(async () => {
        await result.current.startWizard('add feature', undefined, '/test/project');
      });

      expect(result.current.isWizardActive).toBe(true);

      // End wizard
      act(() => {
        result.current.endWizard();
      });

      expect(result.current.isWizardActive).toBe(false);
      expect(result.current.wizardMode).toBe(null);
      expect(result.current.wizardGoal).toBe(null);
      expect(result.current.existingDocuments).toEqual([]);
    });
  });

  describe('setExistingDocuments', () => {
    it('should update existing documents', async () => {
      const { result } = renderHook(() => useInlineWizard());

      const docs = [
        { name: 'phase-1', filename: 'phase-1.md', path: '/test/phase-1.md' },
      ];

      act(() => {
        result.current.setExistingDocuments(docs);
      });

      expect(result.current.existingDocuments).toEqual(docs);
    });
  });

  describe('sendMessage', () => {
    it('should add user message to conversation history', () => {
      const { result } = renderHook(() => useInlineWizard());

      act(() => {
        result.current.sendMessage('Hello wizard');
      });

      expect(result.current.conversationHistory).toHaveLength(1);
      expect(result.current.conversationHistory[0].role).toBe('user');
      expect(result.current.conversationHistory[0].content).toBe('Hello wizard');
    });
  });

  describe('addAssistantMessage', () => {
    it('should add assistant message with confidence', () => {
      const { result } = renderHook(() => useInlineWizard());

      act(() => {
        result.current.addAssistantMessage('I understand your request', 75, false);
      });

      expect(result.current.conversationHistory).toHaveLength(1);
      expect(result.current.conversationHistory[0].role).toBe('assistant');
      expect(result.current.conversationHistory[0].confidence).toBe(75);
      expect(result.current.confidence).toBe(75);
    });
  });

  describe('setMode', () => {
    it('should update wizard mode', () => {
      const { result } = renderHook(() => useInlineWizard());

      act(() => {
        result.current.setMode('iterate');
      });

      expect(result.current.wizardMode).toBe('iterate');
    });
  });

  describe('setGoal', () => {
    it('should update wizard goal', () => {
      const { result } = renderHook(() => useInlineWizard());

      act(() => {
        result.current.setGoal('add authentication');
      });

      expect(result.current.wizardGoal).toBe('add authentication');
    });
  });

  describe('reset', () => {
    it('should reset wizard to initial state', async () => {
      const { result } = renderHook(() => useInlineWizard());

      // Start wizard with state
      await act(async () => {
        await result.current.startWizard('test', undefined, '/test/project');
      });

      act(() => {
        result.current.setConfidence(50);
        result.current.sendMessage('Hello');
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.isWizardActive).toBe(false);
      expect(result.current.confidence).toBe(0);
      expect(result.current.conversationHistory).toEqual([]);
      expect(result.current.state.projectPath).toBe(null);
    });
  });
});
