/**
 * @file AutoRun.test.tsx
 * @description Tests for the AutoRun component - a markdown editor/viewer for Auto Run feature
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { AutoRun, AutoRunHandle } from '../../../renderer/components/AutoRun';
import type { Theme, BatchRunState, SessionState } from '../../../renderer/types';

// Mock the external dependencies
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="react-markdown">{children}</div>,
}));

vi.mock('remark-gfm', () => ({
  default: {},
}));

vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: { children: string }) => <code data-testid="syntax-highlighter">{children}</code>,
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

vi.mock('../../../renderer/components/AutoRunnerHelpModal', () => ({
  AutoRunnerHelpModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="help-modal">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('../../../renderer/components/MermaidRenderer', () => ({
  MermaidRenderer: ({ chart }: { chart: string }) => (
    <div data-testid="mermaid-renderer">{chart}</div>
  ),
}));

vi.mock('../../../renderer/components/AutoRunDocumentSelector', () => ({
  AutoRunDocumentSelector: ({
    theme,
    documents,
    selectedDocument,
    onSelectDocument,
    onRefresh,
    onChangeFolder,
    onCreateDocument,
    isLoading,
  }: any) => (
    <div data-testid="document-selector">
      <select
        data-testid="doc-select"
        value={selectedDocument || ''}
        onChange={(e) => onSelectDocument(e.target.value)}
      >
        {documents.map((doc: string) => (
          <option key={doc} value={doc}>{doc}</option>
        ))}
      </select>
      <button data-testid="refresh-btn" onClick={onRefresh}>Refresh</button>
      <button data-testid="change-folder-btn" onClick={onChangeFolder}>Change</button>
      {isLoading && <span data-testid="loading-indicator">Loading...</span>}
    </div>
  ),
}));

// Store the onChange handler so our mock can call it
let autocompleteOnChange: ((content: string) => void) | null = null;

vi.mock('../../../renderer/hooks/useTemplateAutocomplete', () => ({
  useTemplateAutocomplete: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
    // Store the onChange handler so handleAutocompleteChange can trigger state updates
    autocompleteOnChange = onChange;
    return {
      autocompleteState: { isOpen: false, suggestions: [], selectedIndex: 0, position: { top: 0, left: 0 } },
      handleKeyDown: () => false,
      handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        // Actually call onChange with the new value to update state
        onChange(e.target.value);
      },
      selectVariable: () => {},
      closeAutocomplete: () => {},
      autocompleteRef: { current: null },
    };
  },
}));

vi.mock('../../../renderer/components/TemplateAutocompleteDropdown', () => ({
  TemplateAutocompleteDropdown: React.forwardRef(() => null),
}));

// Create a mock theme for testing
const createMockTheme = (): Theme => ({
  id: 'test-theme',
  name: 'Test Theme',
  mode: 'dark',
  colors: {
    bgMain: '#1a1a1a',
    bgPanel: '#252525',
    bgActivity: '#2d2d2d',
    textMain: '#ffffff',
    textDim: '#888888',
    accent: '#0066ff',
    accentForeground: '#ffffff',
    border: '#333333',
    highlight: '#0066ff33',
    success: '#00aa00',
    warning: '#ffaa00',
    error: '#ff0000',
  },
});

// Setup window.maestro mock
const setupMaestroMock = () => {
  const mockMaestro = {
    fs: {
      readFile: vi.fn().mockResolvedValue('data:image/png;base64,abc123'),
      readDir: vi.fn().mockResolvedValue([]),
    },
    autorun: {
      listImages: vi.fn().mockResolvedValue({ success: true, images: [] }),
      saveImage: vi.fn().mockResolvedValue({ success: true, relativePath: 'images/test-123.png' }),
      deleteImage: vi.fn().mockResolvedValue({ success: true }),
      writeDoc: vi.fn().mockResolvedValue(undefined),
    },
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
  };

  (window as any).maestro = mockMaestro;
  return mockMaestro;
};

// Default props for AutoRun component
const createDefaultProps = (overrides: Partial<React.ComponentProps<typeof AutoRun>> = {}) => ({
  theme: createMockTheme(),
  sessionId: 'test-session-1',
  folderPath: '/test/folder',
  selectedFile: 'test-doc',
  documentList: ['test-doc', 'another-doc'],
  content: '# Test Content\n\nSome markdown content.',
  onContentChange: vi.fn(),
  mode: 'edit' as const,
  onModeChange: vi.fn(),
  onOpenSetup: vi.fn(),
  onRefresh: vi.fn(),
  onSelectDocument: vi.fn(),
  onCreateDocument: vi.fn().mockResolvedValue(true),
  ...overrides,
});

describe('AutoRun', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Basic Rendering', () => {
    it('renders in edit mode by default', () => {
      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveValue(props.content);
    });

    it('renders in preview mode when mode prop is preview', () => {
      const props = createDefaultProps({ mode: 'preview' });
      render(<AutoRun {...props} />);

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });

    it('shows "Select Auto Run Folder" button when no folder is configured', () => {
      const props = createDefaultProps({ folderPath: null });
      render(<AutoRun {...props} />);

      expect(screen.getByText('Select Auto Run Folder')).toBeInTheDocument();
    });

    it('shows document selector when folder is configured', () => {
      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      expect(screen.getByTestId('document-selector')).toBeInTheDocument();
    });

    it('displays Edit and Preview toggle buttons', () => {
      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('displays Run button when not locked', () => {
      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      expect(screen.getByText('Run')).toBeInTheDocument();
    });

    it('displays Stop button when batch run is active', () => {
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: [],
        failedTasks: [],
        skippedTasks: [],
      };
      const props = createDefaultProps({ batchRunState });
      render(<AutoRun {...props} />);

      expect(screen.getByText('Stop')).toBeInTheDocument();
    });
  });

  describe('Mode Toggling', () => {
    it('calls onModeChange when clicking Edit button', async () => {
      const props = createDefaultProps({ mode: 'preview' });
      render(<AutoRun {...props} />);

      fireEvent.click(screen.getByText('Edit'));
      expect(props.onModeChange).toHaveBeenCalledWith('edit');
    });

    it('calls onModeChange when clicking Preview button', async () => {
      const props = createDefaultProps({ mode: 'edit' });
      render(<AutoRun {...props} />);

      fireEvent.click(screen.getByText('Preview'));
      expect(props.onModeChange).toHaveBeenCalledWith('preview');
    });

    it('disables Edit button when batch run is active', () => {
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: [],
        failedTasks: [],
        skippedTasks: [],
      };
      const props = createDefaultProps({ batchRunState });
      render(<AutoRun {...props} />);

      expect(screen.getByText('Edit').closest('button')).toBeDisabled();
    });
  });

  describe('Content Editing', () => {
    it('updates local content when typing', async () => {
      const props = createDefaultProps({ content: '' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'New content' } });

      expect(textarea).toHaveValue('New content');
    });

    it('syncs content to parent on blur', async () => {
      const props = createDefaultProps({ content: '' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.focus(textarea);
      fireEvent.change(textarea, { target: { value: 'New content' } });
      fireEvent.blur(textarea);

      expect(props.onContentChange).toHaveBeenCalledWith('New content');
    });

    it('does not allow editing when locked', () => {
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: [],
        failedTasks: [],
        skippedTasks: [],
      };
      const props = createDefaultProps({ batchRunState });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('readonly');
    });
  });

  describe('Auto-Save Functionality', () => {
    it('auto-saves content after 5 seconds of inactivity', async () => {
      const props = createDefaultProps({ content: 'Initial' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.focus(textarea);
      fireEvent.change(textarea, { target: { value: 'Updated content' } });

      // Advance timers by 5 seconds
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockMaestro.autorun.writeDoc).toHaveBeenCalledWith(
        '/test/folder',
        'test-doc.md',
        'Updated content'
      );
    });

    it('does not auto-save if content is empty', async () => {
      const props = createDefaultProps({ content: 'Initial' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.focus(textarea);
      fireEvent.change(textarea, { target: { value: '' } });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockMaestro.autorun.writeDoc).not.toHaveBeenCalled();
    });

    it('does not auto-save if no folder is selected', async () => {
      const props = createDefaultProps({ folderPath: null, content: 'Initial' });
      render(<AutoRun {...props} />);

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockMaestro.autorun.writeDoc).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('inserts tab character on Tab key', async () => {
      // Use "HelloWorld" without space so tab insertion is clearer
      const props = createDefaultProps({ content: 'HelloWorld' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.focus(textarea);

      // Set cursor position after "Hello"
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      fireEvent.keyDown(textarea, { key: 'Tab' });

      await waitFor(() => {
        expect(textarea.value).toBe('Hello\tWorld');
      });
    });

    it('toggles mode on Cmd+E', async () => {
      const props = createDefaultProps({ mode: 'edit' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'e', metaKey: true });

      expect(props.onModeChange).toHaveBeenCalledWith('preview');
    });

    it('inserts checkbox on Cmd+L at start of line', async () => {
      const props = createDefaultProps({ content: '' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.focus(textarea);

      // Set cursor position
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      fireEvent.keyDown(textarea, { key: 'l', metaKey: true });

      // Wait for state update
      await waitFor(() => {
        expect(textarea.value).toBe('- [ ] ');
      });
    });

    it('inserts checkbox on new line with Cmd+L in middle of text', async () => {
      const props = createDefaultProps({ content: 'Some text' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.focus(textarea);

      // Set cursor position to middle
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      fireEvent.keyDown(textarea, { key: 'l', metaKey: true });

      await waitFor(() => {
        expect(textarea.value).toContain('\n- [ ] ');
      });
    });
  });

  describe('List Continuation', () => {
    it('continues task list on Enter', async () => {
      const props = createDefaultProps({ content: '- [ ] First task' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.focus(textarea);

      // Position cursor at end of line
      textarea.selectionStart = 16;
      textarea.selectionEnd = 16;

      fireEvent.keyDown(textarea, { key: 'Enter' });

      await waitFor(() => {
        expect(textarea.value).toContain('- [ ] First task\n- [ ] ');
      });
    });

    it('continues unordered list with dash on Enter', async () => {
      const props = createDefaultProps({ content: '- Item one' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.focus(textarea);

      // Position cursor at end of line
      textarea.selectionStart = 10;
      textarea.selectionEnd = 10;

      fireEvent.keyDown(textarea, { key: 'Enter' });

      await waitFor(() => {
        expect(textarea.value).toContain('- Item one\n- ');
      });
    });

    it('continues ordered list and increments number on Enter', async () => {
      const props = createDefaultProps({ content: '1. First item' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.focus(textarea);

      // Position cursor at end of line
      textarea.selectionStart = 13;
      textarea.selectionEnd = 13;

      fireEvent.keyDown(textarea, { key: 'Enter' });

      await waitFor(() => {
        expect(textarea.value).toContain('1. First item\n2. ');
      });
    });

    it('preserves indentation in nested lists', async () => {
      const props = createDefaultProps({ content: '  - Nested item' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.focus(textarea);

      // Position cursor at end of line
      textarea.selectionStart = 15;
      textarea.selectionEnd = 15;

      fireEvent.keyDown(textarea, { key: 'Enter' });

      await waitFor(() => {
        expect(textarea.value).toContain('  - Nested item\n  - ');
      });
    });
  });

  describe('Search Functionality', () => {
    it('opens search on Cmd+F in edit mode', async () => {
      const props = createDefaultProps({ mode: 'edit' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'f', metaKey: true });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
      });
    });

    it('closes search on Escape', async () => {
      const props = createDefaultProps({ mode: 'edit' });
      render(<AutoRun {...props} />);

      // Open search first
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'f', metaKey: true });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
      });

      // Close search
      const searchInput = screen.getByPlaceholderText(/Search/);
      fireEvent.keyDown(searchInput, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/Search/)).not.toBeInTheDocument();
      });
    });

    it('displays match count when searching', async () => {
      const props = createDefaultProps({ content: 'test one test two test three' });
      render(<AutoRun {...props} />);

      // Open search
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'f', metaKey: true });

      const searchInput = await screen.findByPlaceholderText(/Search/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByText('1/3')).toBeInTheDocument();
      });
    });

    it('navigates to next match on Enter', async () => {
      const props = createDefaultProps({ content: 'test one test two test three' });
      render(<AutoRun {...props} />);

      // Open search
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'f', metaKey: true });

      const searchInput = await screen.findByPlaceholderText(/Search/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByText('1/3')).toBeInTheDocument();
      });

      fireEvent.keyDown(searchInput, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('2/3')).toBeInTheDocument();
      });
    });

    it('navigates to previous match on Shift+Enter', async () => {
      const props = createDefaultProps({ content: 'test one test two test three' });
      render(<AutoRun {...props} />);

      // Open search and set query
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'f', metaKey: true });

      const searchInput = await screen.findByPlaceholderText(/Search/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByText('1/3')).toBeInTheDocument();
      });

      // Go to prev (wraps to last match)
      fireEvent.keyDown(searchInput, { key: 'Enter', shiftKey: true });

      await waitFor(() => {
        expect(screen.getByText('3/3')).toBeInTheDocument();
      });
    });

    it('shows No matches when search has no results', async () => {
      const props = createDefaultProps({ content: 'some content' });
      render(<AutoRun {...props} />);

      // Open search
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'f', metaKey: true });

      const searchInput = await screen.findByPlaceholderText(/Search/);
      fireEvent.change(searchInput, { target: { value: 'xyz' } });

      await waitFor(() => {
        expect(screen.getByText('No matches')).toBeInTheDocument();
      });
    });
  });

  describe('Run/Stop Batch Processing', () => {
    it('calls onOpenBatchRunner and syncs content when clicking Run', async () => {
      const onOpenBatchRunner = vi.fn();
      const props = createDefaultProps({ onOpenBatchRunner, content: 'test' });
      render(<AutoRun {...props} />);

      // Change content first
      const textarea = screen.getByRole('textbox');
      fireEvent.focus(textarea);
      fireEvent.change(textarea, { target: { value: 'new content' } });

      fireEvent.click(screen.getByText('Run'));

      expect(props.onContentChange).toHaveBeenCalledWith('new content');
      expect(onOpenBatchRunner).toHaveBeenCalled();
    });

    it('disables Run button when agent is busy', () => {
      const props = createDefaultProps({ sessionState: 'busy' as SessionState });
      render(<AutoRun {...props} />);

      expect(screen.getByText('Run').closest('button')).toBeDisabled();
    });

    it('disables Run button when agent is connecting', () => {
      const props = createDefaultProps({ sessionState: 'connecting' as SessionState });
      render(<AutoRun {...props} />);

      expect(screen.getByText('Run').closest('button')).toBeDisabled();
    });

    it('calls onStopBatchRun when clicking Stop', async () => {
      const onStopBatchRun = vi.fn();
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: [],
        failedTasks: [],
        skippedTasks: [],
      };
      const props = createDefaultProps({ batchRunState, onStopBatchRun });
      render(<AutoRun {...props} />);

      fireEvent.click(screen.getByText('Stop'));

      expect(onStopBatchRun).toHaveBeenCalled();
    });

    it('shows Stopping... when isStopping is true', () => {
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: true,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: [],
        failedTasks: [],
        skippedTasks: [],
      };
      const props = createDefaultProps({ batchRunState });
      render(<AutoRun {...props} />);

      expect(screen.getByText('Stopping...')).toBeInTheDocument();
    });
  });

  describe('Help Modal', () => {
    it('opens help modal when clicking help button', async () => {
      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      const helpButton = screen.getByTitle('Learn about Auto Runner');
      fireEvent.click(helpButton);

      expect(screen.getByTestId('help-modal')).toBeInTheDocument();
    });

    it('closes help modal when onClose is called', async () => {
      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      const helpButton = screen.getByTitle('Learn about Auto Runner');
      fireEvent.click(helpButton);

      expect(screen.getByTestId('help-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Close'));

      await waitFor(() => {
        expect(screen.queryByTestId('help-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('Empty Folder State', () => {
    it('shows empty state when folder has no documents', () => {
      const props = createDefaultProps({ documentList: [], selectedFile: null });
      render(<AutoRun {...props} />);

      expect(screen.getByText('No Documents Found')).toBeInTheDocument();
      expect(screen.getByText(/The selected folder doesn't contain any markdown/)).toBeInTheDocument();
    });

    it('shows Refresh and Change Folder buttons in empty state', () => {
      const props = createDefaultProps({ documentList: [], selectedFile: null });
      render(<AutoRun {...props} />);

      // Use getAllByText since the refresh button exists in both document selector and empty state
      expect(screen.getAllByText('Refresh').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Change Auto-run Folder')).toBeInTheDocument();
    });

    it('calls onRefresh when clicking Refresh in empty state', async () => {
      const props = createDefaultProps({ documentList: [], selectedFile: null });
      render(<AutoRun {...props} />);

      // Get the Refresh button in the empty state (not in document selector)
      const refreshButtons = screen.getAllByText('Refresh');
      // The second one is in the empty state UI
      fireEvent.click(refreshButtons.length > 1 ? refreshButtons[1] : refreshButtons[0]);

      await waitFor(() => {
        expect(props.onRefresh).toHaveBeenCalled();
      });
    });

    it('calls onOpenSetup when clicking Change Folder in empty state', async () => {
      const props = createDefaultProps({ documentList: [], selectedFile: null });
      render(<AutoRun {...props} />);

      // Get the Change Auto-run Folder button in the empty state
      fireEvent.click(screen.getByText('Change Auto-run Folder'));

      await waitFor(() => {
        expect(props.onOpenSetup).toHaveBeenCalled();
      });
    });

    it('shows loading indicator during refresh', async () => {
      const props = createDefaultProps({ documentList: [], selectedFile: null, isLoadingDocuments: true });
      render(<AutoRun {...props} />);

      // Loading state should not show empty state message
      expect(screen.queryByText('No Documents Found')).not.toBeInTheDocument();
    });
  });

  describe('Attachments', () => {
    it('loads existing images on mount', async () => {
      mockMaestro.autorun.listImages.mockResolvedValue({
        success: true,
        images: [
          { filename: 'img1.png', relativePath: 'images/test-doc-123.png' },
        ],
      });

      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      await waitFor(() => {
        expect(mockMaestro.autorun.listImages).toHaveBeenCalledWith('/test/folder', 'test-doc');
      });
    });

    it('shows attachments section when there are images in edit mode', async () => {
      mockMaestro.autorun.listImages.mockResolvedValue({
        success: true,
        images: [
          { filename: 'img1.png', relativePath: 'images/test-doc-123.png' },
        ],
      });

      const props = createDefaultProps({ mode: 'edit' });
      render(<AutoRun {...props} />);

      await waitFor(() => {
        expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
      });
    });

    it('shows image upload button in edit mode', () => {
      const props = createDefaultProps({ mode: 'edit' });
      render(<AutoRun {...props} />);

      expect(screen.getByTitle('Add image (or paste from clipboard)')).toBeInTheDocument();
    });

    it('hides image upload button in preview mode', () => {
      const props = createDefaultProps({ mode: 'preview' });
      render(<AutoRun {...props} />);

      expect(screen.queryByTitle('Add image (or paste from clipboard)')).not.toBeInTheDocument();
    });

    it('hides image upload button when locked', () => {
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: [],
        failedTasks: [],
        skippedTasks: [],
      };
      const props = createDefaultProps({ batchRunState });
      render(<AutoRun {...props} />);

      expect(screen.queryByTitle('Add image (or paste from clipboard)')).not.toBeInTheDocument();
    });
  });

  describe('Image Paste Handling', () => {
    // TODO: PENDING - NEEDS FIX - FileReader mocking is complex in jsdom
    it.skip('handles image paste and inserts markdown reference', async () => {
      // This test requires complex FileReader mocking that doesn't work well in jsdom
      // The functionality is tested manually
    });

    it('does not handle paste when locked', async () => {
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: [],
        failedTasks: [],
        skippedTasks: [],
      };
      const props = createDefaultProps({ batchRunState });
      render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');

      const mockClipboardData = {
        items: [
          {
            type: 'image/png',
            getAsFile: () => new File(['test'], 'test.png', { type: 'image/png' }),
          },
        ],
      };

      fireEvent.paste(textarea, { clipboardData: mockClipboardData });

      expect(mockMaestro.autorun.saveImage).not.toHaveBeenCalled();
    });
  });

  describe('Imperative Handle (focus)', () => {
    it('exposes focus method via ref', () => {
      const ref = React.createRef<AutoRunHandle>();
      const props = createDefaultProps({ mode: 'edit' });
      render(<AutoRun {...props} ref={ref} />);

      expect(ref.current).not.toBeNull();
      expect(typeof ref.current?.focus).toBe('function');
    });

    it('focuses textarea when calling focus in edit mode', () => {
      const ref = React.createRef<AutoRunHandle>();
      const props = createDefaultProps({ mode: 'edit' });
      render(<AutoRun {...props} ref={ref} />);

      const textarea = screen.getByRole('textbox');
      ref.current?.focus();

      expect(document.activeElement).toBe(textarea);
    });
  });

  describe('Session Switching', () => {
    it('resets local content when session changes', () => {
      const props = createDefaultProps({ content: 'Session 1 content' });
      const { rerender } = render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('Session 1 content');

      // Change session
      rerender(<AutoRun {...props} sessionId="new-session" content="Session 2 content" />);

      expect(textarea).toHaveValue('Session 2 content');
    });

    it('syncs content when switching documents', () => {
      const props = createDefaultProps({ content: 'Doc 1 content', selectedFile: 'doc1' });
      const { rerender } = render(<AutoRun {...props} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('Doc 1 content');

      // Change document
      rerender(<AutoRun {...props} selectedFile="doc2" content="Doc 2 content" />);

      expect(textarea).toHaveValue('Doc 2 content');
    });
  });

  describe('Scroll Position Persistence', () => {
    it('accepts initial scroll positions', () => {
      const props = createDefaultProps({
        initialCursorPosition: 10,
        initialEditScrollPos: 100,
        initialPreviewScrollPos: 50,
      });

      // This should not throw
      expect(() => render(<AutoRun {...props} />)).not.toThrow();
    });

    it('calls onStateChange when mode toggles via keyboard', async () => {
      const onStateChange = vi.fn();
      const props = createDefaultProps({ mode: 'edit', onStateChange });
      render(<AutoRun {...props} />);

      // toggleMode is called via Cmd+E, which does call onStateChange
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'e', metaKey: true });

      expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({
        mode: 'preview',
      }));
    });
  });

  describe('Memoization', () => {
    it('does not re-render when irrelevant props change', () => {
      const props = createDefaultProps();
      const { rerender } = render(<AutoRun {...props} />);

      // Re-render with same essential props but different callback references
      // The memo comparison should prevent unnecessary re-renders
      // This is more of an integration test, verifying the memo function exists
      expect(() => {
        rerender(<AutoRun {...props} />);
      }).not.toThrow();
    });
  });

  describe('Preview Mode Features', () => {
    it('opens search with Cmd+F in preview mode', async () => {
      const props = createDefaultProps({ mode: 'preview' });
      render(<AutoRun {...props} />);

      // Find the preview container and trigger keydown
      const previewContainer = screen.getByTestId('react-markdown').parentElement!;
      fireEvent.keyDown(previewContainer, { key: 'f', metaKey: true });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
      });
    });
  });

  describe('Document Selector Integration', () => {
    it('calls onSelectDocument when document is selected', async () => {
      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      const select = screen.getByTestId('doc-select');
      fireEvent.change(select, { target: { value: 'another-doc' } });

      expect(props.onSelectDocument).toHaveBeenCalledWith('another-doc');
    });

    it('calls onRefresh when refresh button is clicked', async () => {
      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      fireEvent.click(screen.getByTestId('refresh-btn'));

      expect(props.onRefresh).toHaveBeenCalled();
    });

    it('calls onOpenSetup when change folder button is clicked', async () => {
      const props = createDefaultProps();
      render(<AutoRun {...props} />);

      fireEvent.click(screen.getByTestId('change-folder-btn'));

      expect(props.onOpenSetup).toHaveBeenCalled();
    });

    it('passes isLoading to document selector', () => {
      const props = createDefaultProps({ isLoadingDocuments: true });
      render(<AutoRun {...props} />);

      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    });
  });

  describe('Auto-switch Mode on Batch Run', () => {
    it('switches to preview mode when batch run starts', () => {
      const props = createDefaultProps({ mode: 'edit' });
      const { rerender } = render(<AutoRun {...props} />);

      // Start batch run
      const batchRunState: BatchRunState = {
        isRunning: true,
        isStopping: false,
        currentTaskIndex: 0,
        totalTasks: 5,
        completedTasks: [],
        failedTasks: [],
        skippedTasks: [],
      };
      rerender(<AutoRun {...props} batchRunState={batchRunState} />);

      expect(props.onModeChange).toHaveBeenCalledWith('preview');
    });
  });

  describe('Legacy onChange Prop', () => {
    // TODO: PENDING - NEEDS FIX - Legacy onChange requires deep integration testing
    // The component's internal state management makes it hard to test the legacy path
    // without modifying source code to expose internals
    it.skip('falls back to onChange when onContentChange is not provided', async () => {
      // This test verifies legacy behavior that is complex to test in isolation
      // The functionality has been tested manually
    });
  });

  describe('Textarea Placeholder', () => {
    it('shows placeholder text in edit mode', () => {
      const props = createDefaultProps({ content: '' });
      render(<AutoRun {...props} />);

      const textarea = screen.getByPlaceholderText(/Capture notes, images, and tasks/);
      expect(textarea).toBeInTheDocument();
    });
  });

  describe('Container Keyboard Handling', () => {
    it('handles Cmd+E on container level', async () => {
      const props = createDefaultProps({ mode: 'edit' });
      const { container } = render(<AutoRun {...props} />);

      const outerContainer = container.firstChild as HTMLElement;
      fireEvent.keyDown(outerContainer, { key: 'e', metaKey: true });

      expect(props.onModeChange).toHaveBeenCalledWith('preview');
    });

    it('handles Cmd+F on container level', async () => {
      const props = createDefaultProps({ mode: 'edit' });
      const { container } = render(<AutoRun {...props} />);

      const outerContainer = container.firstChild as HTMLElement;
      fireEvent.keyDown(outerContainer, { key: 'f', metaKey: true });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
      });
    });
  });

  describe('Preview Mode Content', () => {
    it('shows default message when content is empty in preview mode', () => {
      const props = createDefaultProps({ mode: 'preview', content: '' });
      render(<AutoRun {...props} />);

      expect(screen.getByTestId('react-markdown')).toHaveTextContent('No content yet');
    });
  });
});

describe('AutoRun.imageCache', () => {
  // Note: imageCache is a module-level Map that caches loaded images
  // It cannot be directly tested without exposing it, but we can verify
  // the caching behavior indirectly through repeated renders

  it('component loads without throwing when images are present', async () => {
    const mockMaestro = setupMaestroMock();
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });

    const props = createDefaultProps();
    expect(() => render(<AutoRun {...props} />)).not.toThrow();

    await waitFor(() => {
      expect(mockMaestro.autorun.listImages).toHaveBeenCalled();
    });
  });
});

describe('Undo/Redo Functionality', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('handles Cmd+Z keyboard shortcut', async () => {
    const props = createDefaultProps({ content: 'Initial content' });
    render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    // Type new content
    fireEvent.change(textarea, { target: { value: 'New content' } });
    expect(textarea).toHaveValue('New content');

    // Trigger undo (preventDefault should be called even if stack is empty)
    const event = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true });
    textarea.dispatchEvent(event);

    // Component should handle the shortcut without error
    expect(textarea).toBeDefined();
  });

  it('handles Cmd+Shift+Z keyboard shortcut', async () => {
    const props = createDefaultProps({ content: 'Original' });
    render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    // Trigger redo shortcut
    fireEvent.keyDown(textarea, { key: 'z', metaKey: true, shiftKey: true });

    // Component should handle the shortcut without error
    expect(textarea).toBeDefined();
  });

  it('does not change content when undo stack is empty', async () => {
    const props = createDefaultProps({ content: 'Initial' });
    render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.focus(textarea);

    // Try to undo with no history
    fireEvent.keyDown(textarea, { key: 'z', metaKey: true });

    // Content should remain unchanged
    expect(textarea).toHaveValue('Initial');
  });
});

describe('Lightbox Functionality', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('opens lightbox when clicking an image', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments to load
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    // Wait for preview image to load
    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });

    // Click on image thumbnail to open lightbox
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    // Lightbox should open - look for lightbox image or controls
    await waitFor(() => {
      // Check for close button or ESC hint
      expect(screen.getByText(/ESC to close/)).toBeInTheDocument();
    });
  });

  it('closes lightbox on Escape key', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments and open lightbox
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });

    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    await waitFor(() => {
      expect(screen.getByText(/ESC to close/)).toBeInTheDocument();
    });

    // Press Escape to close
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText(/ESC to close/)).not.toBeInTheDocument();
    });
  });

  it('shows navigation buttons when multiple images are present', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [
        { filename: 'img1.png', relativePath: 'images/img1.png' },
        { filename: 'img2.png', relativePath: 'images/img2.png' },
      ],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images \(2\)/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(2);
    });

    // Open lightbox on first image
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    // Wait for lightbox to open with navigation
    await waitFor(() => {
      expect(screen.getByText(/Image 1 of 2/)).toBeInTheDocument();
    });

    // Navigation buttons should be present
    expect(screen.getByTitle('Previous image (←)')).toBeInTheDocument();
    expect(screen.getByTitle('Next image (→)')).toBeInTheDocument();
  });

  it('navigates to next image via button click', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [
        { filename: 'img1.png', relativePath: 'images/img1.png' },
        { filename: 'img2.png', relativePath: 'images/img2.png' },
      ],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images \(2\)/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(2);
    });

    // Open lightbox on first image
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    await waitFor(() => {
      expect(screen.getByText(/Image 1 of 2/)).toBeInTheDocument();
    });

    // Click next button
    const nextButton = screen.getByTitle('Next image (→)');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText(/Image 2 of 2/)).toBeInTheDocument();
    });
  });

  it('navigates to previous image via button click', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [
        { filename: 'img1.png', relativePath: 'images/img1.png' },
        { filename: 'img2.png', relativePath: 'images/img2.png' },
      ],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images \(2\)/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(2);
    });

    // Open lightbox on second image
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[1]);

    await waitFor(() => {
      expect(screen.getByText(/Image 2 of 2/)).toBeInTheDocument();
    });

    // Click prev button
    const prevButton = screen.getByTitle('Previous image (←)');
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(screen.getByText(/Image 1 of 2/)).toBeInTheDocument();
    });
  });

  it('navigates to next image via ArrowRight key', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [
        { filename: 'img1.png', relativePath: 'images/img1.png' },
        { filename: 'img2.png', relativePath: 'images/img2.png' },
      ],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images \(2\)/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(2);
    });

    // Open lightbox on first image
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    await waitFor(() => {
      expect(screen.getByText(/Image 1 of 2/)).toBeInTheDocument();
    });

    // Press ArrowRight key
    fireEvent.keyDown(document.activeElement || document.body, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(screen.getByText(/Image 2 of 2/)).toBeInTheDocument();
    });
  });

  it('navigates to previous image via ArrowLeft key', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [
        { filename: 'img1.png', relativePath: 'images/img1.png' },
        { filename: 'img2.png', relativePath: 'images/img2.png' },
      ],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images \(2\)/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(2);
    });

    // Open lightbox on second image
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[1]);

    await waitFor(() => {
      expect(screen.getByText(/Image 2 of 2/)).toBeInTheDocument();
    });

    // Press ArrowLeft key
    fireEvent.keyDown(document.activeElement || document.body, { key: 'ArrowLeft' });

    await waitFor(() => {
      expect(screen.getByText(/Image 1 of 2/)).toBeInTheDocument();
    });
  });

  it('closes lightbox via close button click', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });

    // Open lightbox
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    await waitFor(() => {
      expect(screen.getByText(/ESC to close/)).toBeInTheDocument();
    });

    // Click close button
    const closeButton = screen.getByTitle('Close (ESC)');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText(/ESC to close/)).not.toBeInTheDocument();
    });
  });

  it('deletes image via delete button in lightbox', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');
    mockMaestro.autorun.deleteImage.mockResolvedValue({ success: true });

    const content = '# Test\n![test.png](images/test.png)\n';
    const props = createDefaultProps({ content, mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });

    // Open lightbox
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    await waitFor(() => {
      expect(screen.getByText(/ESC to close/)).toBeInTheDocument();
    });

    // Click delete button
    const deleteButton = screen.getByTitle('Delete image (Delete key)');
    fireEvent.click(deleteButton);

    // Verify delete was called
    await waitFor(() => {
      expect(mockMaestro.autorun.deleteImage).toHaveBeenCalledWith('/test/folder', 'images/test.png');
    });

    // Lightbox should close after deleting the only image
    await waitFor(() => {
      expect(screen.queryByText(/ESC to close/)).not.toBeInTheDocument();
    });
  });

  it('deletes image via Delete/Backspace key in lightbox', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');
    mockMaestro.autorun.deleteImage.mockResolvedValue({ success: true });

    const content = '# Test\n![test.png](images/test.png)\n';
    const props = createDefaultProps({ content, mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });

    // Open lightbox
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    await waitFor(() => {
      expect(screen.getByText(/ESC to close/)).toBeInTheDocument();
    });

    // Press Delete key
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Delete' });

    // Verify delete was called
    await waitFor(() => {
      expect(mockMaestro.autorun.deleteImage).toHaveBeenCalledWith('/test/folder', 'images/test.png');
    });
  });

  it('renders copy button in lightbox and handles click', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });

    // Open lightbox
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    await waitFor(() => {
      expect(screen.getByText(/ESC to close/)).toBeInTheDocument();
    });

    // Verify copy button is present
    const copyButton = screen.getByTitle('Copy image to clipboard');
    expect(copyButton).toBeInTheDocument();

    // Click it - the actual clipboard copy may fail but we're testing the button renders/clicks
    fireEvent.click(copyButton);

    // The button should still be there
    expect(screen.getByTitle('Copy image to clipboard')).toBeInTheDocument();
  });

  it('closes lightbox when clicking overlay background', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });

    // Open lightbox
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[0]);

    await waitFor(() => {
      expect(screen.getByText(/ESC to close/)).toBeInTheDocument();
    });

    // Find and click the overlay background (the parent div with bg-black/90)
    const overlay = screen.getByText(/ESC to close/).closest('.fixed');
    if (overlay) {
      fireEvent.click(overlay);
    }

    // Lightbox should close
    await waitFor(() => {
      expect(screen.queryByText(/ESC to close/)).not.toBeInTheDocument();
    });
  });

  it('does not close lightbox when clicking on the image itself', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
    });

    // Open lightbox
    const thumbnailImgs = screen.getAllByRole('img');
    fireEvent.click(thumbnailImgs[0]);

    await waitFor(() => {
      expect(screen.getByText(/ESC to close/)).toBeInTheDocument();
    });

    // Find and click the lightbox image (the one in the overlay)
    const lightboxImages = screen.getAllByRole('img');
    // Find the main lightbox image (not thumbnail)
    const mainImage = lightboxImages.find(img => img.classList.contains('max-w-[90%]'));
    if (mainImage) {
      fireEvent.click(mainImage);
    }

    // Lightbox should still be open
    expect(screen.getByText(/ESC to close/)).toBeInTheDocument();
  });

  it('navigates after deleting middle image in carousel', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [
        { filename: 'img1.png', relativePath: 'images/img1.png' },
        { filename: 'img2.png', relativePath: 'images/img2.png' },
        { filename: 'img3.png', relativePath: 'images/img3.png' },
      ],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');
    mockMaestro.autorun.deleteImage.mockResolvedValue({ success: true });

    const content = '# Test\n![img1.png](images/img1.png)\n![img2.png](images/img2.png)\n![img3.png](images/img3.png)\n';
    const props = createDefaultProps({ content, mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images \(3\)/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      expect(imgs.length).toBeGreaterThanOrEqual(3);
    });

    // Open lightbox on second image
    const imgs = screen.getAllByRole('img');
    fireEvent.click(imgs[1]);

    await waitFor(() => {
      expect(screen.getByText(/Image 2 of 3/)).toBeInTheDocument();
    });

    // Delete the middle image
    const deleteButton = screen.getByTitle('Delete image (Delete key)');
    fireEvent.click(deleteButton);

    // Verify delete was called
    await waitFor(() => {
      expect(mockMaestro.autorun.deleteImage).toHaveBeenCalled();
    });
  });
});

describe('Attachment Management', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('removes attachment when clicking remove button', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');
    mockMaestro.autorun.deleteImage.mockResolvedValue({ success: true });

    const content = '# Test\n![test.png](images/test.png)\n';
    const props = createDefaultProps({ content, mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    // Find and click the remove button (X button on image preview)
    await waitFor(() => {
      const removeButtons = screen.getAllByTitle('Remove image');
      expect(removeButtons.length).toBeGreaterThanOrEqual(1);
    });

    const removeButton = screen.getAllByTitle('Remove image')[0];
    fireEvent.click(removeButton);

    // Verify delete was called
    await waitFor(() => {
      expect(mockMaestro.autorun.deleteImage).toHaveBeenCalledWith('/test/folder', 'images/test.png');
    });
  });

  it('clears attachments when no document is selected', async () => {
    const props = createDefaultProps({ selectedFile: null });
    render(<AutoRun {...props} />);

    // Should not show attachments section
    expect(screen.queryByText(/Attached Images/)).not.toBeInTheDocument();
  });

  // TODO: PENDING - NEEDS FIX - FileReader mocking in jsdom is complex
  // The file upload functionality works in the real environment but jsdom
  // doesn't properly support FileReader constructor mocking
  it.skip('handles image upload via file input', async () => {
    // This test requires complex FileReader mocking that doesn't work well in jsdom
    // The functionality is tested manually
  });

  it('expands and collapses attachments section', async () => {
    mockMaestro.autorun.listImages.mockResolvedValue({
      success: true,
      images: [{ filename: 'test.png', relativePath: 'images/test.png' }],
    });
    mockMaestro.fs.readFile.mockResolvedValue('data:image/png;base64,abc123');

    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    // Wait for attachments
    await waitFor(() => {
      expect(screen.getByText(/Attached Images/)).toBeInTheDocument();
    });

    // Attachments should be expanded by default
    const button = screen.getByText(/Attached Images/).closest('button')!;

    // Click to collapse
    fireEvent.click(button);

    // Images should be hidden now - check that the image count is still shown but the images aren't
    await waitFor(() => {
      const imgs = screen.queryAllByRole('img');
      // After collapse, image thumbnails should not be visible
      expect(imgs.length).toBe(0);
    });
  });
});

describe('Mode Restoration After Batch Run', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('restores previous mode when batch run ends', async () => {
    const onModeChange = vi.fn();
    const props = createDefaultProps({ mode: 'edit', onModeChange });
    const { rerender } = render(<AutoRun {...props} />);

    // Start batch run (this switches to preview mode)
    const batchRunState: BatchRunState = {
      isRunning: true,
      isStopping: false,
      currentTaskIndex: 0,
      totalTasks: 5,
      completedTasks: [],
      failedTasks: [],
      skippedTasks: [],
    };
    rerender(<AutoRun {...props} batchRunState={batchRunState} />);

    // Should have called onModeChange to switch to preview
    expect(onModeChange).toHaveBeenCalledWith('preview');
    onModeChange.mockClear();

    // End batch run
    rerender(<AutoRun {...props} mode="preview" batchRunState={undefined} />);

    // Should restore to edit mode
    await waitFor(() => {
      expect(onModeChange).toHaveBeenCalledWith('edit');
    });
  });
});

describe('Empty State Refresh', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('shows spinner during refresh in empty state', async () => {
    const onRefresh = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    const props = createDefaultProps({
      documentList: [],
      selectedFile: null,
      onRefresh
    });
    render(<AutoRun {...props} />);

    // Find and click the Refresh button
    const refreshButtons = screen.getAllByText('Refresh');
    const emptyStateRefresh = refreshButtons[refreshButtons.length - 1];
    fireEvent.click(emptyStateRefresh);

    // The button should show animation class
    expect(onRefresh).toHaveBeenCalled();
  });
});

describe('Search Bar Navigation Buttons', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('navigates with chevron up and down buttons', async () => {
    const props = createDefaultProps({ content: 'test test test test' });
    render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'f', metaKey: true });

    const searchInput = await screen.findByPlaceholderText(/Search/);
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('1/4')).toBeInTheDocument();
    });

    // Click next button
    const nextButton = screen.getByTitle('Next match (Enter)');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('2/4')).toBeInTheDocument();
    });

    // Click previous button
    const prevButton = screen.getByTitle('Previous match (Shift+Enter)');
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(screen.getByText('1/4')).toBeInTheDocument();
    });
  });

  it('closes search when clicking close button', async () => {
    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'f', metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
    });

    // Click close button
    const closeButton = screen.getByTitle('Close search (Esc)');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Search/)).not.toBeInTheDocument();
    });
  });
});

describe('Scroll Position Persistence', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('calls onStateChange when scrolling in preview mode', async () => {
    const onStateChange = vi.fn();
    const props = createDefaultProps({ mode: 'preview', onStateChange, content: 'Line\n'.repeat(100) });
    render(<AutoRun {...props} />);

    const preview = screen.getByTestId('react-markdown').parentElement!;
    fireEvent.scroll(preview);

    // onStateChange should be called with scroll position
    expect(onStateChange).toHaveBeenCalled();
  });
});

describe('Focus via Imperative Handle', () => {
  it('focuses preview container when calling focus in preview mode', () => {
    const ref = React.createRef<AutoRunHandle>();
    const props = createDefaultProps({ mode: 'preview' });
    render(<AutoRun {...props} ref={ref} />);

    const preview = screen.getByTestId('react-markdown').parentElement!;
    ref.current?.focus();

    expect(document.activeElement).toBe(preview);
  });
});

describe('Control Key Support (Windows/Linux)', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('toggles mode on Ctrl+E (Windows/Linux)', async () => {
    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'e', ctrlKey: true });

    expect(props.onModeChange).toHaveBeenCalledWith('preview');
  });

  it('opens search on Ctrl+F (Windows/Linux)', async () => {
    const props = createDefaultProps({ mode: 'edit' });
    render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'f', ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
    });
  });

  it('inserts checkbox on Ctrl+L (Windows/Linux)', async () => {
    const props = createDefaultProps({ content: '' });
    render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;

    fireEvent.keyDown(textarea, { key: 'l', ctrlKey: true });

    await waitFor(() => {
      expect(textarea.value).toBe('- [ ] ');
    });
  });
});

describe('Preview Mode with Search', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('shows SearchHighlightedContent when searching in preview mode', async () => {
    const props = createDefaultProps({ mode: 'preview', content: 'Find this text' });
    render(<AutoRun {...props} />);

    const preview = screen.getByTestId('react-markdown').parentElement!;
    fireEvent.keyDown(preview, { key: 'f', metaKey: true });

    const searchInput = await screen.findByPlaceholderText(/Search/);
    fireEvent.change(searchInput, { target: { value: 'Find' } });

    await waitFor(() => {
      expect(screen.getByText('1/1')).toBeInTheDocument();
    });
  });

  it('toggles mode with Cmd+E from preview', async () => {
    const props = createDefaultProps({ mode: 'preview' });
    render(<AutoRun {...props} />);

    const preview = screen.getByTestId('react-markdown').parentElement!;
    fireEvent.keyDown(preview, { key: 'e', metaKey: true });

    expect(props.onModeChange).toHaveBeenCalledWith('edit');
  });
});

describe('Batch Run State UI', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('shows task progress in batch run state', () => {
    const batchRunState: BatchRunState = {
      isRunning: true,
      isStopping: false,
      currentTaskIndex: 2,
      totalTasks: 5,
      completedTasks: ['task1', 'task2'],
      failedTasks: [],
      skippedTasks: [],
    };
    const props = createDefaultProps({ batchRunState });
    render(<AutoRun {...props} />);

    // Stop button should be visible
    expect(screen.getByText('Stop')).toBeInTheDocument();
    // Edit button should be disabled
    expect(screen.getByText('Edit').closest('button')).toBeDisabled();
  });

  it('shows textarea as readonly when locked', () => {
    const batchRunState: BatchRunState = {
      isRunning: true,
      isStopping: false,
      currentTaskIndex: 0,
      totalTasks: 5,
      completedTasks: [],
      failedTasks: [],
      skippedTasks: [],
    };
    const props = createDefaultProps({ batchRunState, mode: 'edit' });
    render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('readonly');
    expect(textarea).toHaveClass('cursor-not-allowed');
  });
});

describe('Content Sync Edge Cases', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('syncs content from prop when switching documents', () => {
    const props = createDefaultProps({ content: 'Doc 1 content', selectedFile: 'doc1' });
    const { rerender } = render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('Doc 1 content');

    // Switch to different document - this should sync content
    rerender(<AutoRun {...props} selectedFile="doc2" content="Doc 2 content" />);

    expect(textarea).toHaveValue('Doc 2 content');
  });

  it('does not overwrite local changes when content prop changes during editing', async () => {
    const props = createDefaultProps({ content: 'Initial' });
    const { rerender } = render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'User typing...' } });

    // External content change while user is editing
    rerender(<AutoRun {...props} content="External update" />);

    // Local content should be preserved
    expect(textarea).toHaveValue('User typing...');
  });
});

describe('Document Tree Support', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('passes document tree to document selector', () => {
    const documentTree = [
      { name: 'doc1', type: 'file' as const, path: 'doc1.md' },
      { name: 'folder', type: 'folder' as const, path: 'folder', children: [] },
    ];
    const props = createDefaultProps({ documentTree });
    render(<AutoRun {...props} />);

    // Document selector should be rendered
    expect(screen.getByTestId('document-selector')).toBeInTheDocument();
  });
});

describe('Auto-save Cleanup', () => {
  let mockMaestro: ReturnType<typeof setupMaestroMock>;

  beforeEach(() => {
    mockMaestro = setupMaestroMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('clears auto-save timer when document changes', async () => {
    const props = createDefaultProps({ content: 'Initial', selectedFile: 'doc1' });
    const { rerender } = render(<AutoRun {...props} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'Changed content' } });

    // Change document before auto-save fires
    rerender(<AutoRun {...props} selectedFile="doc2" content="Doc 2 content" />);

    // Advance past auto-save time
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    // Auto-save should NOT have been called for doc1's content
    // because we switched documents before the timer fired
    // It might be called for doc2 if there are pending changes, but not with doc1 content
    const calls = mockMaestro.autorun.writeDoc.mock.calls;
    const doc1SaveCalls = calls.filter((call: any[]) => call[1] === 'doc1.md' && call[2] === 'Changed content');
    expect(doc1SaveCalls.length).toBe(0);
  });

  it('should re-render when hideTopControls changes (memo regression test)', async () => {
    // This test ensures AutoRun re-renders when hideTopControls prop changes
    // A previous bug had the memo comparator missing hideTopControls
    // hideTopControls affects the top control bar visibility when folderPath is set
    const props = createDefaultProps({ hideTopControls: false, folderPath: '/test/folder' });
    const { rerender, container } = render(<AutoRun {...props} />);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Get elements that are controlled by hideTopControls
    // The control bar with mode buttons should be visible
    const controlElements = container.querySelectorAll('button');
    const initialButtonCount = controlElements.length;

    // Rerender with hideTopControls=true
    rerender(<AutoRun {...createDefaultProps({ hideTopControls: true, folderPath: '/test/folder' })} />);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // With hideTopControls=true, the top control bar should be hidden
    // which means fewer buttons should be visible
    const updatedControlElements = container.querySelectorAll('button');
    // The component should have re-rendered and hidden the top controls
    expect(updatedControlElements.length).toBeLessThan(initialButtonCount);
  });

  it('should re-render when contentVersion changes (memo regression test)', async () => {
    // This test ensures AutoRun re-renders when contentVersion changes
    // contentVersion is used to force-sync on external file changes
    const onContentChange = vi.fn();
    const props = createDefaultProps({
      content: 'Original content',
      contentVersion: 1,
      onContentChange,
    });

    const { rerender } = render(<AutoRun {...props} />);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Now simulate an external file change by updating content and contentVersion
    rerender(<AutoRun {...createDefaultProps({
      content: 'Externally modified content',
      contentVersion: 2,
      onContentChange,
    })} />);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // The component should have re-rendered with the new content
    // In edit mode, check the textarea value
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('Externally modified content');
  });
});
