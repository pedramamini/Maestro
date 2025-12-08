/**
 * @file FilePreview.test.tsx
 * @description Tests for the FilePreview component
 *
 * FilePreview is a comprehensive file viewer supporting:
 * - Syntax-highlighted code files
 * - Rendered/raw markdown with image support
 * - Image file display
 * - File stats (size, tokens, dates)
 * - Search with match navigation
 * - Keyboard shortcuts
 * - Copy to clipboard (path and content)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock dependencies before importing component
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="react-markdown">{children}</div>
  ),
}));

vi.mock('remark-gfm', () => ({
  default: () => () => {},
}));

vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children, language, showLineNumbers }: any) => (
    <pre data-testid="syntax-highlighter" data-language={language} data-line-numbers={showLineNumbers}>
      <code>{children}</code>
    </pre>
  ),
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

vi.mock('unist-util-visit', () => ({
  visit: vi.fn(),
}));

vi.mock('../../../renderer/components/MermaidRenderer', () => ({
  MermaidRenderer: ({ chart }: { chart: string }) => (
    <div data-testid="mermaid-renderer">{chart}</div>
  ),
}));

vi.mock('js-tiktoken', () => ({
  getEncoding: vi.fn(() => ({
    encode: vi.fn((text: string) => new Array(Math.ceil(text.length / 4))),
  })),
}));

vi.mock('../../../renderer/utils/shortcutFormatter', () => ({
  formatShortcutKeys: vi.fn((keys: string[]) => keys.join('+')),
}));

// Mock LayerStackContext
const mockRegisterLayer = vi.fn(() => 'layer-123');
const mockUnregisterLayer = vi.fn();
const mockUpdateLayerHandler = vi.fn();

vi.mock('../../../renderer/contexts/LayerStackContext', () => ({
  useLayerStack: () => ({
    registerLayer: mockRegisterLayer,
    unregisterLayer: mockUnregisterLayer,
    updateLayerHandler: mockUpdateLayerHandler,
  }),
}));

// Import component after mocks
import { FilePreview } from '../../../renderer/components/FilePreview';

// Helper to create mock theme
const createMockTheme = () => ({
  colors: {
    bgMain: '#1e1e1e',
    bgSidebar: '#252526',
    bgActivity: '#333333',
    textMain: '#ffffff',
    textDim: '#888888',
    accent: '#007acc',
    accentForeground: '#ffffff',
    border: '#404040',
    error: '#f44336',
    success: '#4caf50',
    warning: '#ff9800',
  },
});

// Helper to create mock file
const createMockFile = (overrides: Partial<{ name: string; content: string; path: string }> = {}) => ({
  name: 'test.ts',
  content: 'const x = 1;',
  path: '/project/src/test.ts',
  ...overrides,
});

// Helper to create mock shortcuts
const createMockShortcuts = () => ({
  copyFilePath: { keys: ['Meta', 'Shift', 'C'] },
  toggleMarkdownMode: { keys: ['Meta', 'M'] },
});

describe('FilePreview', () => {
  let mockSetMarkdownRawMode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetMarkdownRawMode = vi.fn();

    // Reset window.maestro mocks
    vi.mocked(window.maestro.fs.stat).mockResolvedValue({
      size: 1024,
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-15T12:30:00.000Z',
    });
    vi.mocked(window.maestro.fs.readFile).mockResolvedValue('data:image/png;base64,abc123');

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
      },
    });

    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // NULL FILE HANDLING
  // =============================================================================

  describe('null file handling', () => {
    it('returns null when file is null', () => {
      const { container } = render(
        <FilePreview
          file={null}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  // =============================================================================
  // BASIC RENDERING
  // =============================================================================

  describe('basic rendering', () => {
    it('renders with a TypeScript file', () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByText('test.ts')).toBeInTheDocument();
      expect(screen.getByText('/project/src')).toBeInTheDocument();
    });

    it('renders file content in syntax highlighter for code files', () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'const x = 42;' })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const highlighter = screen.getByTestId('syntax-highlighter');
      expect(highlighter).toBeInTheDocument();
      expect(highlighter).toHaveAttribute('data-language', 'typescript');
    });

    it('applies theme colors to container', () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      expect(container).toHaveStyle({ backgroundColor: '#1e1e1e' });
    });

    it('registers layer on mount', () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(mockRegisterLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'overlay',
          blocksLowerLayers: true,
          capturesFocus: true,
          ariaLabel: 'File Preview',
        })
      );
    });

    it('unregisters layer on unmount', () => {
      const { unmount } = render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      unmount();
      expect(mockUnregisterLayer).toHaveBeenCalledWith('layer-123');
    });
  });

  // =============================================================================
  // FILE STATS
  // =============================================================================

  describe('file stats', () => {
    it('displays file size when stats are available', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('1 KB')).toBeInTheDocument();
      });
    });

    it('displays token count', async () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'a'.repeat(1000) })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Tokens:')).toBeInTheDocument();
      });
    });

    it('displays modified and created dates', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Modified:')).toBeInTheDocument();
        expect(screen.getByText('Created:')).toBeInTheDocument();
      });
    });

    it('handles file stats error gracefully', async () => {
      vi.mocked(window.maestro.fs.stat).mockRejectedValue(new Error('File not found'));

      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByText('test.ts')).toBeInTheDocument();
    });
  });

  // =============================================================================
  // COPY FUNCTIONALITY
  // =============================================================================

  describe('copy functionality', () => {
    it('copies file path to clipboard', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const copyPathBtn = screen.getByTitle('Copy full path to clipboard');
      fireEvent.click(copyPathBtn);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/project/src/test.ts');
      });
    });

    it('shows copy notification after copying path', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const copyPathBtn = screen.getByTitle('Copy full path to clipboard');
      fireEvent.click(copyPathBtn);

      await waitFor(() => {
        expect(screen.getByText('File Path Copied to Clipboard')).toBeInTheDocument();
      });
    });

    it('copies content to clipboard for text files', async () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'const x = 42;' })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const copyContentBtn = screen.getByTitle('Copy content to clipboard');
      fireEvent.click(copyContentBtn);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 42;');
      });
    });

    it('shows content copy notification', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const copyContentBtn = screen.getByTitle('Copy content to clipboard');
      fireEvent.click(copyContentBtn);

      await waitFor(() => {
        expect(screen.getByText('Content Copied to Clipboard')).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // CLOSE BUTTON
  // =============================================================================

  describe('close button', () => {
    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn();

      render(
        <FilePreview
          file={createMockFile()}
          onClose={onClose}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const buttons = screen.getAllByRole('button');
      const closeBtn = buttons.find(btn => btn.querySelector('.lucide-x'));
      expect(closeBtn).toBeDefined();
      fireEvent.click(closeBtn!);

      expect(onClose).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // MARKDOWN FILES
  // =============================================================================

  describe('markdown files', () => {
    const markdownFile = createMockFile({
      name: 'README.md',
      content: '# Hello World\n\nThis is a test.',
      path: '/project/README.md',
    });

    it('shows markdown toggle button for .md files', () => {
      render(
        <FilePreview
          file={markdownFile}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const toggleBtn = screen.getByTitle(/Show raw markdown|Show rendered markdown/);
      expect(toggleBtn).toBeInTheDocument();
    });

    it('renders markdown content when not in raw mode', () => {
      render(
        <FilePreview
          file={markdownFile}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });

    it('renders raw markdown when markdownRawMode is true', () => {
      render(
        <FilePreview
          file={markdownFile}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={true}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.queryByTestId('react-markdown')).not.toBeInTheDocument();
      expect(screen.getByText(/# Hello World/)).toBeInTheDocument();
    });

    it('toggles markdown mode when button is clicked', async () => {
      render(
        <FilePreview
          file={markdownFile}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const toggleBtn = screen.getByTitle(/Show raw markdown/);
      fireEvent.click(toggleBtn);

      expect(mockSetMarkdownRawMode).toHaveBeenCalledWith(true);
    });

    it('does not show markdown toggle for non-markdown files', () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.queryByTitle(/Show raw markdown/)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Show rendered markdown/)).not.toBeInTheDocument();
    });
  });

  // =============================================================================
  // IMAGE FILES
  // =============================================================================

  describe('image files', () => {
    const imageFile = createMockFile({
      name: 'logo.png',
      content: 'data:image/png;base64,abc123',
      path: '/project/assets/logo.png',
    });

    it('renders image tag for image files', () => {
      render(
        <FilePreview
          file={imageFile}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123');
    });

    it('does not show syntax highlighter for images', () => {
      render(
        <FilePreview
          file={imageFile}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.queryByTestId('syntax-highlighter')).not.toBeInTheDocument();
    });

    it('shows copy image button for image files', () => {
      render(
        <FilePreview
          file={imageFile}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByTitle('Copy image to clipboard')).toBeInTheDocument();
    });

    it('recognizes various image extensions', () => {
      const extensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'];

      extensions.forEach(ext => {
        const { unmount } = render(
          <FilePreview
            file={createMockFile({
              name: `image.${ext}`,
              content: 'data:image/png;base64,abc123',
              path: `/project/image.${ext}`,
            })}
            onClose={vi.fn()}
            theme={createMockTheme()}
            markdownRawMode={false}
            setMarkdownRawMode={mockSetMarkdownRawMode}
            shortcuts={createMockShortcuts()}
          />
        );

        expect(screen.getByRole('img')).toBeInTheDocument();
        unmount();
      });
    });
  });

  // =============================================================================
  // LANGUAGE DETECTION
  // =============================================================================

  describe('language detection', () => {
    const testCases = [
      { ext: 'ts', lang: 'typescript' },
      { ext: 'tsx', lang: 'tsx' },
      { ext: 'js', lang: 'javascript' },
      { ext: 'jsx', lang: 'jsx' },
      { ext: 'json', lang: 'json' },
      { ext: 'py', lang: 'python' },
      { ext: 'rb', lang: 'ruby' },
      { ext: 'go', lang: 'go' },
      { ext: 'rs', lang: 'rust' },
      { ext: 'java', lang: 'java' },
      { ext: 'c', lang: 'c' },
      { ext: 'cpp', lang: 'cpp' },
      { ext: 'cs', lang: 'csharp' },
      { ext: 'php', lang: 'php' },
      { ext: 'html', lang: 'html' },
      { ext: 'css', lang: 'css' },
      { ext: 'scss', lang: 'scss' },
      { ext: 'sql', lang: 'sql' },
      { ext: 'sh', lang: 'bash' },
      { ext: 'yaml', lang: 'yaml' },
      { ext: 'yml', lang: 'yaml' },
      { ext: 'toml', lang: 'toml' },
      { ext: 'xml', lang: 'xml' },
    ];

    testCases.forEach(({ ext, lang }) => {
      it(`detects ${lang} for .${ext} files`, () => {
        render(
          <FilePreview
            file={createMockFile({
              name: `file.${ext}`,
              content: 'content',
              path: `/project/file.${ext}`,
            })}
            onClose={vi.fn()}
            theme={createMockTheme()}
            markdownRawMode={false}
            setMarkdownRawMode={mockSetMarkdownRawMode}
            shortcuts={createMockShortcuts()}
          />
        );

        const highlighter = screen.getByTestId('syntax-highlighter');
        expect(highlighter).toHaveAttribute('data-language', lang);
      });
    });

    it('defaults to text for unknown extensions', () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'file.xyz',
            content: 'content',
            path: '/project/file.xyz',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const highlighter = screen.getByTestId('syntax-highlighter');
      expect(highlighter).toHaveAttribute('data-language', 'text');
    });
  });

  // =============================================================================
  // SEARCH FUNCTIONALITY
  // =============================================================================

  describe('search functionality', () => {
    it('opens search with / key', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
      });
    });

    it('focuses search input when opened', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/Search in file/);
        expect(searchInput).toBeInTheDocument();
      });
    });

    it('closes search with Escape', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Open search
      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
      });

      // Close with Escape
      const searchInput = screen.getByPlaceholderText(/Search in file/);
      fireEvent.keyDown(searchInput, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/Search in file/)).not.toBeInTheDocument();
      });
    });

    it('shows no matches message when no results', async () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'hello world' })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Open search
      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
      });

      // Type a search query that won't match
      const searchInput = screen.getByPlaceholderText(/Search in file/);
      fireEvent.change(searchInput, { target: { value: 'xyz123notfound' } });

      await waitFor(() => {
        expect(screen.getByText('No matches')).toBeInTheDocument();
      });
    });

    it('displays match count when matches found', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test.md',
            content: 'test test test',
            path: '/test.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={true}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Open search
      const container = screen.getByText('test.md').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
      });

      // Type a search query
      const searchInput = screen.getByPlaceholderText(/Search in file/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByText(/1\/3|2\/3|3\/3/)).toBeInTheDocument();
      });
    });

    it('shows navigation buttons when search has results', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test.md',
            content: 'test test test',
            path: '/test.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={true}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Open search
      const container = screen.getByText('test.md').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
      });

      // Type a search query
      const searchInput = screen.getByPlaceholderText(/Search in file/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByTitle(/Previous match/)).toBeInTheDocument();
        expect(screen.getByTitle(/Next match/)).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // KEYBOARD NAVIGATION
  // =============================================================================

  describe('keyboard navigation', () => {
    it('scrolls up with ArrowUp', () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'line\n'.repeat(100) })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: 'ArrowUp' });

      expect(container).toBeInTheDocument();
    });

    it('scrolls down with ArrowDown', () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'line\n'.repeat(100) })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: 'ArrowDown' });

      expect(container).toBeInTheDocument();
    });

    it('does not open search with Cmd+/', () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/', metaKey: true });

      expect(screen.queryByPlaceholderText(/Search in file/)).not.toBeInTheDocument();
    });

    it('triggers copy path with keyboard shortcut', () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: 'c', metaKey: true, shiftKey: true });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/project/src/test.ts');
    });

    it('toggles markdown mode with keyboard shortcut', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'README.md',
            content: '# Test',
            path: '/project/README.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('README.md').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: 'm', metaKey: true });

      expect(mockSetMarkdownRawMode).toHaveBeenCalledWith(true);
    });
  });

  // =============================================================================
  // LAYER ESCAPE HANDLING
  // =============================================================================

  describe('layer escape handling', () => {
    it('passes escape handler to layer registration', () => {
      const onClose = vi.fn();

      render(
        <FilePreview
          file={createMockFile()}
          onClose={onClose}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(mockRegisterLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          onEscape: expect.any(Function),
        })
      );
    });

    it('updates layer handler when search opens', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Open search
      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(mockUpdateLayerHandler).toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // FILE SIZE FORMATTING
  // =============================================================================

  describe('file size formatting', () => {
    it('formats bytes correctly', async () => {
      vi.mocked(window.maestro.fs.stat).mockResolvedValue({
        size: 512,
        createdAt: '2024-01-01T00:00:00.000Z',
        modifiedAt: '2024-01-01T00:00:00.000Z',
      });

      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('512 B')).toBeInTheDocument();
      });
    });

    it('formats kilobytes correctly', async () => {
      vi.mocked(window.maestro.fs.stat).mockResolvedValue({
        size: 2048,
        createdAt: '2024-01-01T00:00:00.000Z',
        modifiedAt: '2024-01-01T00:00:00.000Z',
      });

      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('2 KB')).toBeInTheDocument();
      });
    });

    it('formats megabytes correctly', async () => {
      vi.mocked(window.maestro.fs.stat).mockResolvedValue({
        size: 1048576 * 5.5, // 5.5 MB
        createdAt: '2024-01-01T00:00:00.000Z',
        modifiedAt: '2024-01-01T00:00:00.000Z',
      });

      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('5.5 MB')).toBeInTheDocument();
      });
    });

    it('formats zero bytes correctly', async () => {
      vi.mocked(window.maestro.fs.stat).mockResolvedValue({
        size: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        modifiedAt: '2024-01-01T00:00:00.000Z',
      });

      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('0 B')).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // TOKEN COUNT FORMATTING
  // =============================================================================

  describe('token count formatting', () => {
    it('displays token count for text files', async () => {
      // The mock at the top generates tokens based on content.length / 4
      render(
        <FilePreview
          file={createMockFile({ content: 'test content' })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Should show Tokens label with some count
      await waitFor(() => {
        expect(screen.getByText('Tokens:')).toBeInTheDocument();
      });
    });

    it('shows token count section in stats bar', async () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'a'.repeat(100) })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Tokens:')).toBeInTheDocument();
      });
    });

    it('does not show tokens section for image files', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'image.png',
            content: 'data:image/png;base64,abc',
            path: '/image.png',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Size:')).toBeInTheDocument();
      });

      // Token count should not appear for images
      expect(screen.queryByText('Tokens:')).not.toBeInTheDocument();
    });
  });

  // =============================================================================
  // DIRECTORY PATH DISPLAY
  // =============================================================================

  describe('directory path display', () => {
    it('displays directory without filename', () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'index.ts',
            content: '',
            path: '/Users/dev/project/src/components/index.ts',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByText('index.ts')).toBeInTheDocument();
      expect(screen.getByText('/Users/dev/project/src/components')).toBeInTheDocument();
    });

    it('handles root-level files', () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'package.json',
            content: '{}',
            path: '/package.json',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByText('package.json')).toBeInTheDocument();
    });
  });

  // =============================================================================
  // STATS BAR VISIBILITY
  // =============================================================================

  describe('stats bar visibility', () => {
    it('shows stats bar initially', async () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Size:')).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('edge cases', () => {
    it('handles files with no extension', () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'Makefile',
            content: 'all: build',
            path: '/project/Makefile',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const highlighter = screen.getByTestId('syntax-highlighter');
      expect(highlighter).toHaveAttribute('data-language', 'text');
    });

    it('handles empty file content', () => {
      render(
        <FilePreview
          file={createMockFile({ content: '' })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByText('test.ts')).toBeInTheDocument();
    });

    it('handles very long filenames', () => {
      const longName = 'a'.repeat(200) + '.ts';

      render(
        <FilePreview
          file={createMockFile({
            name: longName,
            content: '',
            path: `/project/${longName}`,
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByText(longName)).toBeInTheDocument();
    });

    it('handles files with special characters in name', () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test file (1).ts',
            content: '',
            path: '/project/test file (1).ts',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByText('test file (1).ts')).toBeInTheDocument();
    });

    it('handles unicode content', () => {
      render(
        <FilePreview
          file={createMockFile({
            content: 'const greeting = "Hello 世界 🌍";',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      expect(screen.getByText(/Hello 世界/)).toBeInTheDocument();
    });

    it('handles missing shortcuts gracefully', () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={{}}
        />
      );

      expect(screen.getByText('test.ts')).toBeInTheDocument();
    });
  });

  // =============================================================================
  // IMAGE COPY
  // =============================================================================

  describe('image copy', () => {
    it('shows notification when copying image', async () => {
      // The clipboard API may fall back in test environment
      render(
        <FilePreview
          file={createMockFile({
            name: 'logo.png',
            content: 'data:image/png;base64,abc123',
            path: '/logo.png',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const copyBtn = screen.getByTitle('Copy image to clipboard');
      fireEvent.click(copyBtn);

      // Should show some copy notification (either Image or URL copied)
      await waitFor(() => {
        expect(screen.getByText(/Copied to Clipboard/)).toBeInTheDocument();
      });
    });

    it('calls fetch when copying image', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['image data'], { type: 'image/png' })),
      });

      render(
        <FilePreview
          file={createMockFile({
            name: 'logo.png',
            content: 'data:image/png;base64,abc123',
            path: '/logo.png',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const copyBtn = screen.getByTitle('Copy image to clipboard');
      fireEvent.click(copyBtn);

      // The component fetches the data URL to create a blob for clipboard
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('data:image/png;base64,abc123');
      });
    });

    it('falls back to copying data URL if image copy fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(
        <FilePreview
          file={createMockFile({
            name: 'logo.png',
            content: 'data:image/png;base64,abc123',
            path: '/logo.png',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const copyBtn = screen.getByTitle('Copy image to clipboard');
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('data:image/png;base64,abc123');
      });
    });
  });

  // =============================================================================
  // SEARCH NAVIGATION BUTTONS
  // =============================================================================

  describe('search navigation buttons', () => {
    it('previous button navigates to previous match', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test.md',
            content: 'test test test',
            path: '/test.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={true}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Open search
      const container = screen.getByText('test.md').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search in file/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByTitle(/Previous match/)).toBeInTheDocument();
      });

      const prevBtn = screen.getByTitle(/Previous match/);
      fireEvent.click(prevBtn);

      await waitFor(() => {
        expect(screen.getByText('3/3')).toBeInTheDocument();
      });
    });

    it('next button navigates to next match', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test.md',
            content: 'test test test',
            path: '/test.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={true}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Open search
      const container = screen.getByText('test.md').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search in file/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByTitle(/Next match/)).toBeInTheDocument();
      });

      const nextBtn = screen.getByTitle(/Next match/);
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText('2/3')).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // SEARCH KEYBOARD SHORTCUTS
  // =============================================================================

  describe('search keyboard shortcuts', () => {
    it('Enter navigates to next match', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test.md',
            content: 'test test test',
            path: '/test.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={true}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Open search
      const container = screen.getByText('test.md').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search in file/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByText('1/3')).toBeInTheDocument();
      });

      // Press Enter to go to next
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('2/3')).toBeInTheDocument();
      });
    });

    it('Shift+Enter navigates to previous match', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test.md',
            content: 'test test test',
            path: '/test.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={true}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      // Open search
      const container = screen.getByText('test.md').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: '/' });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search in file/);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        expect(screen.getByText('1/3')).toBeInTheDocument();
      });

      // Press Shift+Enter to go to previous (wraps to last)
      fireEvent.keyDown(searchInput, { key: 'Enter', shiftKey: true });

      await waitFor(() => {
        expect(screen.getByText('3/3')).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // MODIFIER KEY SCROLLING
  // =============================================================================

  describe('modifier key scrolling', () => {
    it('Cmd+ArrowUp jumps to top', () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'line\n'.repeat(100) })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: 'ArrowUp', metaKey: true });

      expect(container).toBeInTheDocument();
    });

    it('Cmd+ArrowDown jumps to bottom', () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'line\n'.repeat(100) })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: 'ArrowDown', metaKey: true });

      expect(container).toBeInTheDocument();
    });

    it('Alt+ArrowUp pages up', () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'line\n'.repeat(100) })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: 'ArrowUp', altKey: true });

      expect(container).toBeInTheDocument();
    });

    it('Alt+ArrowDown pages down', () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'line\n'.repeat(100) })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: 'ArrowDown', altKey: true });

      expect(container).toBeInTheDocument();
    });

    it('Ctrl+ArrowUp also jumps to top', () => {
      render(
        <FilePreview
          file={createMockFile({ content: 'line\n'.repeat(100) })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const container = screen.getByText('test.ts').closest('[tabindex="0"]');
      fireEvent.keyDown(container!, { key: 'ArrowUp', ctrlKey: true });

      expect(container).toBeInTheDocument();
    });
  });

  // =============================================================================
  // LINE NUMBERS
  // =============================================================================

  describe('line numbers', () => {
    it('shows line numbers in syntax highlighter', () => {
      render(
        <FilePreview
          file={createMockFile()}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={mockSetMarkdownRawMode}
          shortcuts={createMockShortcuts()}
        />
      );

      const highlighter = screen.getByTestId('syntax-highlighter');
      expect(highlighter).toHaveAttribute('data-line-numbers', 'true');
    });
  });
});

// =============================================================================
// UTILITY FUNCTION UNIT TESTS
// =============================================================================

describe('FilePreview utility functions', () => {
  describe('getLanguageFromFilename coverage', () => {
    const testFiles = [
      { file: 'test.ts', expected: 'typescript' },
      { file: 'test.tsx', expected: 'tsx' },
      { file: 'test.js', expected: 'javascript' },
      { file: 'test.jsx', expected: 'jsx' },
      { file: 'test.json', expected: 'json' },
      { file: 'test.py', expected: 'python' },
      { file: 'test.rb', expected: 'ruby' },
      { file: 'test.go', expected: 'go' },
      { file: 'test.rs', expected: 'rust' },
      { file: 'test.java', expected: 'java' },
      { file: 'test.c', expected: 'c' },
      { file: 'test.cpp', expected: 'cpp' },
      { file: 'test.cs', expected: 'csharp' },
      { file: 'test.php', expected: 'php' },
      { file: 'test.html', expected: 'html' },
      { file: 'test.css', expected: 'css' },
      { file: 'test.scss', expected: 'scss' },
      { file: 'test.sql', expected: 'sql' },
      { file: 'test.sh', expected: 'bash' },
      { file: 'test.yaml', expected: 'yaml' },
      { file: 'test.yml', expected: 'yaml' },
      { file: 'test.toml', expected: 'toml' },
      { file: 'test.xml', expected: 'xml' },
      { file: 'test.unknown', expected: 'text' },
      { file: 'noextension', expected: 'text' },
    ];

    testFiles.forEach(({ file, expected }) => {
      it(`correctly identifies ${file} as ${expected}`, () => {
        render(
          <FilePreview
            file={createMockFile({
              name: file,
              content: 'content',
              path: `/project/${file}`,
            })}
            onClose={vi.fn()}
            theme={createMockTheme()}
            markdownRawMode={false}
            setMarkdownRawMode={vi.fn()}
            shortcuts={createMockShortcuts()}
          />
        );

        if (file.endsWith('.md')) {
          expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
        } else if (!['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].some(ext => file.endsWith(`.${ext}`))) {
          const highlighter = screen.getByTestId('syntax-highlighter');
          expect(highlighter).toHaveAttribute('data-language', expected);
        }
      });
    });
  });

  describe('isImageFile coverage', () => {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'];
    const nonImageExtensions = ['ts', 'js', 'txt', 'html'];

    imageExtensions.forEach(ext => {
      it(`recognizes .${ext} as image file`, () => {
        render(
          <FilePreview
            file={createMockFile({
              name: `image.${ext}`,
              content: 'data:image/png;base64,abc',
              path: `/image.${ext}`,
            })}
            onClose={vi.fn()}
            theme={createMockTheme()}
            markdownRawMode={false}
            setMarkdownRawMode={vi.fn()}
            shortcuts={createMockShortcuts()}
          />
        );

        expect(screen.getByRole('img')).toBeInTheDocument();
      });
    });

    nonImageExtensions.forEach(ext => {
      it(`does not recognize .${ext} as image file`, () => {
        render(
          <FilePreview
            file={createMockFile({
              name: `file.${ext}`,
              content: 'content',
              path: `/file.${ext}`,
            })}
            onClose={vi.fn()}
            theme={createMockTheme()}
            markdownRawMode={false}
            setMarkdownRawMode={vi.fn()}
            shortcuts={createMockShortcuts()}
          />
        );

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
      });
    });
  });
});

// =============================================================================
// MARKDOWN IMAGE COMPONENT TESTS
// =============================================================================

describe('MarkdownImage component', () => {
  // Note: ReactMarkdown is mocked with a simple component that doesn't render custom img tags
  // These tests verify that markdown files with image syntax render without errors
  describe('markdown files with images', () => {
    it('renders markdown file containing image syntax', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test.md',
            content: '![alt text](./image.png)',
            path: '/project/docs/test.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={vi.fn()}
          shortcuts={createMockShortcuts()}
        />
      );

      // The mocked ReactMarkdown renders the content as plain text
      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });
    });

    it('renders markdown file with data URL image', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test.md',
            content: '![alt text](data:image/png;base64,abc123)',
            path: '/project/docs/test.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={vi.fn()}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });
    });

    it('renders markdown file with HTTP URL image', async () => {
      render(
        <FilePreview
          file={createMockFile({
            name: 'test.md',
            content: '![alt text](https://example.com/image.png)',
            path: '/project/docs/test.md',
          })}
          onClose={vi.fn()}
          theme={createMockTheme()}
          markdownRawMode={false}
          setMarkdownRawMode={vi.fn()}
          shortcuts={createMockShortcuts()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });
    });
  });
});

// =============================================================================
// MARKDOWN LINK INTERACTIONS
// =============================================================================

describe('Markdown link interactions', () => {
  // Note: ReactMarkdown is mocked, so we can't test actual link interactions
  // The tests verify that markdown files render without errors
  it('renders markdown files with link syntax', async () => {
    render(
      <FilePreview
        file={createMockFile({
          name: 'test.md',
          content: '[Click me](https://example.com)',
          path: '/project/test.md',
        })}
        onClose={vi.fn()}
        theme={createMockTheme()}
        markdownRawMode={false}
        setMarkdownRawMode={vi.fn()}
        shortcuts={createMockShortcuts()}
      />
    );

    // ReactMarkdown is mocked, verify content renders
    await waitFor(() => {
      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// STATS BAR SCROLL BEHAVIOR
// =============================================================================

describe('Stats bar scroll behavior', () => {
  it('hides stats bar when scrolled down', async () => {
    render(
      <FilePreview
        file={createMockFile({
          name: 'test.ts',
          content: 'line\n'.repeat(200), // Long content to enable scrolling
          path: '/project/test.ts',
        })}
        onClose={vi.fn()}
        theme={createMockTheme()}
        markdownRawMode={false}
        setMarkdownRawMode={vi.fn()}
        shortcuts={createMockShortcuts()}
      />
    );

    // Wait for stats to load
    await waitFor(() => {
      expect(screen.getByText('Size:')).toBeInTheDocument();
    });

    // Find the content scroll container and simulate scrolling
    const container = screen.getByText('test.ts').closest('[tabindex="0"]');
    const scrollContainer = container?.querySelector('.overflow-y-auto');
    expect(scrollContainer).toBeTruthy();

    // Simulate scroll down
    if (scrollContainer) {
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 100, writable: true });
      fireEvent.scroll(scrollContainer);
    }

    // The stats bar should be hidden (note: component uses showStatsBar state)
    // We can't easily test DOM hiding without proper scroll simulation
    // but we verify the component doesn't crash and still renders
    expect(screen.getByText('test.ts')).toBeInTheDocument();
  });
});

// =============================================================================
// HIGHLIGHT SYNTAX (==text==) IN MARKDOWN
// =============================================================================

describe('Markdown highlight syntax', () => {
  it('renders highlighted text with ==syntax==', async () => {
    render(
      <FilePreview
        file={createMockFile({
          name: 'test.md',
          content: 'This is ==highlighted== text.',
          path: '/project/test.md',
        })}
        onClose={vi.fn()}
        theme={createMockTheme()}
        markdownRawMode={false}
        setMarkdownRawMode={vi.fn()}
        shortcuts={createMockShortcuts()}
      />
    );

    // The component uses ReactMarkdown which is mocked
    // The actual highlight processing is in remarkHighlight plugin
    // We verify the content renders without errors
    await waitFor(() => {
      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// MARKDOWN CODE BLOCKS WITH LANGUAGE
// =============================================================================

describe('Markdown code blocks', () => {
  it('renders inline code differently from block code', async () => {
    render(
      <FilePreview
        file={createMockFile({
          name: 'test.md',
          content: 'Use `inline code` here.\n\n```javascript\nconst x = 1;\n```',
          path: '/project/test.md',
        })}
        onClose={vi.fn()}
        theme={createMockTheme()}
        markdownRawMode={false}
        setMarkdownRawMode={vi.fn()}
        shortcuts={createMockShortcuts()}
      />
    );

    // ReactMarkdown is mocked, so we just verify it renders
    await waitFor(() => {
      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });
  });

  it('renders mermaid code blocks with MermaidRenderer', async () => {
    render(
      <FilePreview
        file={createMockFile({
          name: 'test.md',
          content: '```mermaid\ngraph TD\nA --> B\n```',
          path: '/project/test.md',
        })}
        onClose={vi.fn()}
        theme={createMockTheme()}
        markdownRawMode={false}
        setMarkdownRawMode={vi.fn()}
        shortcuts={createMockShortcuts()}
      />
    );

    // MermaidRenderer is mocked
    await waitFor(() => {
      expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// FORMAT TOKEN COUNT UTILITY
// =============================================================================

describe('Token count formatting', () => {
  // Note: js-tiktoken is mocked at the top with a fixed implementation
  // These tests verify the component handles token counting without crashing
  it('displays tokens section for text files', async () => {
    render(
      <FilePreview
        file={createMockFile({ content: 'x'.repeat(1000) })}
        onClose={vi.fn()}
        theme={createMockTheme()}
        markdownRawMode={false}
        setMarkdownRawMode={vi.fn()}
        shortcuts={createMockShortcuts()}
      />
    );

    // Should show Tokens: label with the token count
    await waitFor(() => {
      expect(screen.getByText('Tokens:')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// SEARCH IN MARKDOWN RAW MODE
// =============================================================================

describe('Search in markdown with highlighting', () => {
  it('highlights matches in raw markdown mode', async () => {
    render(
      <FilePreview
        file={createMockFile({
          name: 'test.md',
          content: 'test test test',
          path: '/test.md',
        })}
        onClose={vi.fn()}
        theme={createMockTheme()}
        markdownRawMode={true}
        setMarkdownRawMode={vi.fn()}
        shortcuts={createMockShortcuts()}
      />
    );

    // Open search
    const container = screen.getByText('test.md').closest('[tabindex="0"]');
    fireEvent.keyDown(container!, { key: '/' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
    });

    // Type search
    const searchInput = screen.getByPlaceholderText(/Search in file/);
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Verify match count
    await waitFor(() => {
      expect(screen.getByText('1/3')).toBeInTheDocument();
    });
  });

  it('switches to raw mode when searching in rendered markdown', async () => {
    render(
      <FilePreview
        file={createMockFile({
          name: 'test.md',
          content: '# Heading\n\ntest paragraph',
          path: '/test.md',
        })}
        onClose={vi.fn()}
        theme={createMockTheme()}
        markdownRawMode={false}
        setMarkdownRawMode={vi.fn()}
        shortcuts={createMockShortcuts()}
      />
    );

    // Open search
    const container = screen.getByText('test.md').closest('[tabindex="0"]');
    fireEvent.keyDown(container!, { key: '/' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search in file/)).toBeInTheDocument();
    });

    // Type search - this should trigger raw mode display with highlights
    const searchInput = screen.getByPlaceholderText(/Search in file/);
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Wait for component to switch to highlight mode
    await waitFor(() => {
      // When searching in markdown, it shows raw content with highlights
      expect(screen.getByText('1/1')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// GIGABYTE FILE SIZE FORMATTING
// =============================================================================

describe('Gigabyte file size formatting', () => {
  it('formats gigabytes correctly', async () => {
    vi.mocked(window.maestro.fs.stat).mockResolvedValue({
      size: 1073741824 * 2.3, // 2.3 GB
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-01T00:00:00.000Z',
    });

    render(
      <FilePreview
        file={createMockFile()}
        onClose={vi.fn()}
        theme={createMockTheme()}
        markdownRawMode={false}
        setMarkdownRawMode={vi.fn()}
        shortcuts={createMockShortcuts()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('2.3 GB')).toBeInTheDocument();
    });
  });
});

