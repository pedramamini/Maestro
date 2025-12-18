/**
 * @fileoverview Tests for NewInstanceModal component
 * Tests: Modal rendering, agent detection, folder selection, form submission,
 * tilde expansion, layer stack integration, keyboard shortcuts, custom agent paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NewInstanceModal } from '../../../renderer/components/NewInstanceModal';
import type { Theme, Session } from '../../../renderer/types';
import type { AgentConfig } from '../../../renderer/types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Folder: ({ className }: { className?: string }) => (
    <span data-testid="folder-icon" className={className}>📁</span>
  ),
  X: ({ className }: { className?: string }) => (
    <span data-testid="x-icon" className={className}>×</span>
  ),
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="refresh-icon" className={className}>🔄</span>
  ),
  ChevronRight: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <span data-testid="chevron-right-icon" className={className} style={style}>▶</span>
  ),
  Check: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <span data-testid="check-icon" className={className} style={style}>✓</span>
  ),
  AlertCircle: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <span data-testid="alert-circle-icon" className={className} style={style}>⚠</span>
  ),
}));

// Mock layer stack context
const mockRegisterLayer = vi.fn(() => 'layer-new-instance-123');
const mockUnregisterLayer = vi.fn();
const mockUpdateLayerHandler = vi.fn();

vi.mock('../../../renderer/contexts/LayerStackContext', () => ({
  useLayerStack: () => ({
    registerLayer: mockRegisterLayer,
    unregisterLayer: mockUnregisterLayer,
    updateLayerHandler: mockUpdateLayerHandler,
  }),
}));

// Create test theme
const createTheme = (): Theme => ({
  id: 'test-dark',
  name: 'Test Dark',
  mode: 'dark',
  colors: {
    bgMain: '#1a1a2e',
    bgSidebar: '#16213e',
    bgActivity: '#0f3460',
    textMain: '#e8e8e8',
    textDim: '#888888',
    accent: '#7b2cbf',
    accentDim: '#5a1f8f',
    accentForeground: '#ffffff',
    border: '#333355',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    bgAccentHover: '#9333ea',
  },
});

// Create test agent configs
const createAgentConfig = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  id: 'claude-code',
  name: 'Claude Code',
  available: true,
  path: '/usr/local/bin/claude',
  binaryName: 'claude',
  hidden: false,
  ...overrides,
});

describe('NewInstanceModal', () => {
  let theme: Theme;
  let onClose: ReturnType<typeof vi.fn>;
  let onCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    theme = createTheme();
    onClose = vi.fn();
    onCreate = vi.fn();

    // Reset all mocks
    mockRegisterLayer.mockClear().mockReturnValue('layer-new-instance-123');
    mockUnregisterLayer.mockClear();
    mockUpdateLayerHandler.mockClear();

    // Setup default mock implementations
    vi.mocked(window.maestro.fs.homeDir).mockResolvedValue('/home/testuser');
    vi.mocked(window.maestro.agents.detect).mockResolvedValue([
      createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
    ]);
    vi.mocked(window.maestro.agents.getAllCustomPaths).mockResolvedValue({});
    vi.mocked(window.maestro.dialog.selectFolder).mockResolvedValue(null);
    vi.mocked(window.maestro.agents.refresh).mockResolvedValue({
      agents: [createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true })],
      debugInfo: null,
    });
    vi.mocked(window.maestro.agents.setCustomPath).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial render and visibility', () => {
    it('should render null when isOpen is false', async () => {
      const { container } = render(
        <NewInstanceModal
          isOpen={false}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );
      // Wait for any pending promises to resolve
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.firstChild).toBeNull();
    });

    it('should render modal with dialog role when isOpen is true', async () => {
      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-label', 'Create New Agent');
    });

    it('should display modal header with title and close button', async () => {
      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      expect(screen.getByText('Create New Agent')).toBeInTheDocument();
      expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      expect(screen.getByText('Loading agents...')).toBeInTheDocument();
    });
  });

  describe('Agent detection and display', () => {
    it('should load and display available agents', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true, path: '/usr/bin/claude' }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
        expect(screen.getByText('Available')).toBeInTheDocument();
      });
    });

    it('should display path for available agents', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true, path: '/usr/bin/claude' }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      // Wait for agents to load, then click to expand
      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Claude Code'));

      await waitFor(() => {
        expect(screen.getByText('/usr/bin/claude')).toBeInTheDocument();
      });
    });

    it('should display "Not Found" for unavailable Claude Code agent', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false, path: null }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Not Found')).toBeInTheDocument();
      });
    });

    it('should display "Coming Soon" for non-claude-code agents', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
        createAgentConfig({ id: 'openai-codex', name: 'OpenAI Codex', available: false }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Coming Soon')).toBeInTheDocument();
      });
    });

    it('should hide hidden agents from display', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
        createAgentConfig({ id: 'hidden-agent', name: 'Hidden Agent', available: true, hidden: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      expect(screen.queryByText('Hidden Agent')).not.toBeInTheDocument();
    });

    it('should select default agent when available', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        const option = screen.getByRole('option', { name: /Claude Code/i });
        expect(option).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('should select first available agent when default is not available', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'unavailable-agent', name: 'Unavailable Agent', available: false }),
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        const claudeOption = options.find(opt => opt.textContent?.includes('Claude Code'));
        expect(claudeOption).toHaveAttribute('aria-selected', 'true');
      });
    });
  });

  describe('Agent selection', () => {
    it('should allow selecting claude-code when available', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const option = screen.getByRole('option', { name: /Claude Code/i });
      fireEvent.click(option);
      expect(option).toHaveAttribute('aria-selected', 'true');
    });

    it('should not allow selecting unavailable claude-code', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const option = screen.getByRole('option', { name: /Claude Code/i });
      fireEvent.click(option);
      // Should not be selected because it's not available
      expect(option).toHaveAttribute('aria-selected', 'false');
    });

    it('should not allow selecting non-claude-code agents', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
        createAgentConfig({ id: 'openai-codex', name: 'OpenAI Codex', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const codexOption = screen.getByRole('option', { name: /OpenAI Codex/i });
      fireEvent.click(codexOption);
      // Should still have claude-code selected
      const claudeOption = screen.getByRole('option', { name: /Claude Code/i });
      expect(claudeOption).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Agent refresh', () => {
    it('should refresh agent when refresh button is clicked', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.agents.refresh).mockResolvedValue({
        agents: [createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true })],
        debugInfo: null,
      });

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const refreshButton = screen.getByTitle('Refresh detection');
      await act(async () => {
        fireEvent.click(refreshButton);
      });

      expect(window.maestro.agents.refresh).toHaveBeenCalledWith('claude-code');
    });

    it('should display debug info when agent refresh shows not found', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false }),
      ]);
      vi.mocked(window.maestro.agents.refresh).mockResolvedValue({
        agents: [createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false })],
        debugInfo: {
          agentId: 'claude-code',
          available: false,
          path: null,
          binaryName: 'claude',
          envPath: '/usr/bin:/usr/local/bin',
          homeDir: '/home/testuser',
          platform: 'darwin',
          whichCommand: 'which',
          error: 'Command not found in PATH',
        },
      });

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const refreshButton = screen.getByTitle('Refresh detection');
      await act(async () => {
        fireEvent.click(refreshButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Debug Info: claude not found')).toBeInTheDocument();
        expect(screen.getByText('Command not found in PATH')).toBeInTheDocument();
        expect(screen.getByText('darwin')).toBeInTheDocument();
      });
    });

    it('should dismiss debug info when dismiss button is clicked', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false }),
      ]);
      vi.mocked(window.maestro.agents.refresh).mockResolvedValue({
        agents: [createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false })],
        debugInfo: {
          agentId: 'claude-code',
          available: false,
          path: null,
          binaryName: 'claude',
          envPath: '/usr/bin',
          homeDir: '/home/testuser',
          platform: 'darwin',
          whichCommand: 'which',
          error: 'Not found',
        },
      });

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const refreshButton = screen.getByTitle('Refresh detection');
      await act(async () => {
        fireEvent.click(refreshButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Dismiss')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Dismiss'));

      await waitFor(() => {
        expect(screen.queryByText(/Debug Info:/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Form inputs', () => {
    it('should allow typing in instance name input', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Agent Name')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Agent Name');
      fireEvent.change(nameInput, { target: { value: 'My Custom Session' } });
      expect(nameInput).toHaveValue('My Custom Session');
    });

    it('should allow typing in working directory input', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Select directory...')).toBeInTheDocument();
      });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '/path/to/project' } });
      expect(dirInput).toHaveValue('/path/to/project');
    });

    it('should focus name input on modal open', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        const nameInput = screen.getByLabelText('Agent Name');
        expect(document.activeElement).toBe(nameInput);
      });
    });
  });

  describe('Folder selection', () => {
    it('should open folder dialog when folder button is clicked', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.dialog.selectFolder).mockResolvedValue('/selected/folder');

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Browse folders (Cmd+O)')).toBeInTheDocument();
      });

      const folderButton = screen.getByTitle('Browse folders (Cmd+O)');
      await act(async () => {
        fireEvent.click(folderButton);
      });

      expect(window.maestro.dialog.selectFolder).toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Select directory...')).toHaveValue('/selected/folder');
      });
    });

    it('should not update input when folder selection is cancelled', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.dialog.selectFolder).mockResolvedValue(null);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Browse folders (Cmd+O)')).toBeInTheDocument();
      });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '/existing/path' } });

      const folderButton = screen.getByTitle('Browse folders (Cmd+O)');
      await act(async () => {
        fireEvent.click(folderButton);
      });

      expect(dirInput).toHaveValue('/existing/path');
    });
  });

  describe('Tilde expansion', () => {
    it('should expand tilde to home directory on create', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.fs.homeDir).mockResolvedValue('/home/testuser');

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Select directory...')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Agent Name');
      fireEvent.change(nameInput, { target: { value: 'My Session' } });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '~/projects' } });

      const createButton = screen.getByText('Create Agent');
      await act(async () => {
        fireEvent.click(createButton);
      });

      expect(onCreate).toHaveBeenCalledWith('claude-code', '/home/testuser/projects', 'My Session', undefined);
    });

    it('should expand lone tilde to home directory', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.fs.homeDir).mockResolvedValue('/home/testuser');

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Select directory...')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Agent Name');
      fireEvent.change(nameInput, { target: { value: 'Home Session' } });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '~' } });

      const createButton = screen.getByText('Create Agent');
      await act(async () => {
        fireEvent.click(createButton);
      });

      expect(onCreate).toHaveBeenCalledWith('claude-code', '/home/testuser', 'Home Session', undefined);
    });

    it('should not expand tilde in middle of path', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.fs.homeDir).mockResolvedValue('/home/testuser');

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Select directory...')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Agent Name');
      fireEvent.change(nameInput, { target: { value: 'Tilde Test' } });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '/path/with~tilde' } });

      const createButton = screen.getByText('Create Agent');
      await act(async () => {
        fireEvent.click(createButton);
      });

      expect(onCreate).toHaveBeenCalledWith('claude-code', '/path/with~tilde', 'Tilde Test', undefined);
    });
  });

  describe('Form submission', () => {
    it('should call onCreate with correct values when Create button is clicked', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Agent Name')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Agent Name');
      fireEvent.change(nameInput, { target: { value: 'My Session' } });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '/my/project' } });

      const createButton = screen.getByText('Create Agent');
      await act(async () => {
        fireEvent.click(createButton);
      });

      expect(onCreate).toHaveBeenCalledWith('claude-code', '/my/project', 'My Session', undefined);
      expect(onClose).toHaveBeenCalled();
    });

    it('should disable Create button when no instance name provided', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Select directory...')).toBeInTheDocument();
      });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '/my/project' } });

      // Button should be disabled because instance name is not provided
      const createButton = screen.getByText('Create Agent');
      expect(createButton).toBeDisabled();
    });

    it('should disable Create button when no working directory', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const createButton = screen.getByText('Create Agent');
      expect(createButton).toBeDisabled();
    });

    it('should disable Create button when agent is not available', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '/my/project' } });

      const createButton = screen.getByText('Create Agent');
      expect(createButton).toBeDisabled();
    });

    it('should reset form after creation', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      const { rerender } = render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Agent Name')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Agent Name');
      fireEvent.change(nameInput, { target: { value: 'Test Session' } });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '/test/path' } });

      const createButton = screen.getByText('Create Agent');
      await act(async () => {
        fireEvent.click(createButton);
      });

      // Re-render with isOpen=true to check reset (simulating modal reopen)
      rerender(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Agent Name')).toHaveValue('');
        expect(screen.getByPlaceholderText('Select directory...')).toHaveValue('');
      });
    });
  });

  describe('Cancel button', () => {
    it('should call onClose when Cancel button is clicked', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when X button is clicked', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('x-icon')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('x-icon').parentElement!);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Keyboard shortcuts', () => {
    it('should trigger folder selection on Cmd+O', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.dialog.selectFolder).mockResolvedValue('/selected/via/shortcut');

      const { container } = render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Keyboard events are handled by the wrapper div around Modal
      const wrapper = container.firstChild as HTMLElement;
      await act(async () => {
        fireEvent.keyDown(wrapper, { key: 'o', metaKey: true });
      });

      expect(window.maestro.dialog.selectFolder).toHaveBeenCalled();
    });

    it('should trigger folder selection on Ctrl+O', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.dialog.selectFolder).mockResolvedValue('/selected/via/shortcut');

      const { container } = render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Keyboard events are handled by the wrapper div around Modal
      const wrapper = container.firstChild as HTMLElement;
      await act(async () => {
        fireEvent.keyDown(wrapper, { key: 'O', ctrlKey: true });
      });

      expect(window.maestro.dialog.selectFolder).toHaveBeenCalled();
    });

    it('should create agent on Cmd+Enter when form is valid', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      const { container } = render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Select directory...')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Agent Name');
      fireEvent.change(nameInput, { target: { value: 'Test Session' } });

      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '/my/project' } });

      // Keyboard events are handled by the wrapper div around Modal
      const wrapper = container.firstChild as HTMLElement;
      await act(async () => {
        fireEvent.keyDown(wrapper, { key: 'Enter', metaKey: true });
      });

      expect(onCreate).toHaveBeenCalled();
    });

    it('should not create agent on Cmd+Enter when form is invalid', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const modal = screen.getByRole('dialog');
      await act(async () => {
        fireEvent.keyDown(modal, { key: 'Enter', metaKey: true });
      });

      expect(onCreate).not.toHaveBeenCalled();
    });

    it('should not create agent on Cmd+Enter when instance name is missing', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Select directory...')).toBeInTheDocument();
      });

      // Only set working directory, not instance name
      const dirInput = screen.getByPlaceholderText('Select directory...');
      fireEvent.change(dirInput, { target: { value: '/my/project' } });

      const modal = screen.getByRole('dialog');
      await act(async () => {
        fireEvent.keyDown(modal, { key: 'Enter', metaKey: true });
      });

      expect(onCreate).not.toHaveBeenCalled();
    });
  });

  describe('Layer stack integration', () => {
    it('should register layer when modal opens', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      expect(mockRegisterLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'modal',
          blocksLowerLayers: true,
          capturesFocus: true,
          focusTrap: 'strict',
          ariaLabel: 'Create New Agent',
        })
      );
    });

    it('should unregister layer when modal closes', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      const { rerender } = render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      expect(mockRegisterLayer).toHaveBeenCalled();

      rerender(
        <NewInstanceModal
          isOpen={false}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      expect(mockUnregisterLayer).toHaveBeenCalledWith('layer-new-instance-123');
    });

    it('should update layer handler when onClose changes', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      const { rerender } = render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      const newOnClose = vi.fn();
      rerender(
        <NewInstanceModal
          isOpen={true}
          onClose={newOnClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      expect(mockUpdateLayerHandler).toHaveBeenCalledWith('layer-new-instance-123', newOnClose);
    });
  });

  describe('Custom agent paths', () => {
    it('should display custom path input for Claude Code agent', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      // Wait for agents to load, then click to expand
      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Claude Code'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('/path/to/claude')).toBeInTheDocument();
        expect(screen.getByText('Custom Path (optional)')).toBeInTheDocument();
      });
    });

    it('should load existing custom paths on open', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.agents.getAllCustomPaths).mockResolvedValue({
        'claude-code': '/custom/path/to/claude',
      });

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      // Wait for agents to load, then click to expand
      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Claude Code'));

      await waitFor(() => {
        const customPathInput = screen.getByPlaceholderText('/path/to/claude');
        expect(customPathInput).toHaveValue('/custom/path/to/claude');
      });
    });

    it('should save custom path on blur', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      // Wait for agents to load, then click to expand
      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Claude Code'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('/path/to/claude')).toBeInTheDocument();
      });

      const customPathInput = screen.getByPlaceholderText('/path/to/claude');
      fireEvent.change(customPathInput, { target: { value: '/new/custom/path' } });

      await act(async () => {
        fireEvent.blur(customPathInput);
      });

      expect(window.maestro.agents.setCustomPath).toHaveBeenCalledWith('claude-code', '/new/custom/path');
    });

    it('should clear custom path when clear button is clicked', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.agents.getAllCustomPaths).mockResolvedValue({
        'claude-code': '/existing/path',
      });

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      // Wait for agents to load, then click to expand
      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Claude Code'));

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Clear'));
      });

      expect(window.maestro.agents.setCustomPath).toHaveBeenCalledWith('claude-code', null);
    });

    it('should refresh agents after setting custom path', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      // Wait for agents to load, then click to expand
      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Claude Code'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('/path/to/claude')).toBeInTheDocument();
      });

      const customPathInput = screen.getByPlaceholderText('/path/to/claude');
      fireEvent.change(customPathInput, { target: { value: '/custom/claude' } });

      // Clear initial call count
      vi.mocked(window.maestro.agents.detect).mockClear();

      await act(async () => {
        fireEvent.blur(customPathInput);
      });

      // Should refresh agents after setting custom path
      expect(window.maestro.agents.detect).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle agent detection failure gracefully', async () => {
      vi.mocked(window.maestro.agents.detect).mockRejectedValue(new Error('Detection failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load agents:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    it('should handle agent refresh failure gracefully', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);
      vi.mocked(window.maestro.agents.refresh).mockRejectedValue(new Error('Refresh failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Refresh detection')).toBeInTheDocument();
      });

      const refreshButton = screen.getByTitle('Refresh detection');
      await act(async () => {
        fireEvent.click(refreshButton);
      });

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to refresh agent:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Styling and theming', () => {
    it('should apply theme colors to modal', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        const title = screen.getByText('Create New Agent');
        expect(title).toHaveStyle({ color: theme.colors.textMain });
      });
    });

    it('should apply success color to Available badge', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        const badge = screen.getByText('Available');
        expect(badge).toHaveStyle({ color: theme.colors.success });
      });
    });

    it('should apply error color to Not Found badge', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        const badge = screen.getByText('Not Found');
        expect(badge).toHaveStyle({ color: theme.colors.error });
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes on modal', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-label', 'Create New Agent');
    });

    it('should have proper role=option on agent selections', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThan(0);
      });
    });

    it('should have tabindex=-1 on modal container', () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('tabIndex', '-1');
    });

    it('should have tabindex=0 for available claude-code option', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        const option = screen.getByRole('option', { name: /Claude Code/i });
        expect(option).toHaveAttribute('tabIndex', '0');
      });
    });

    it('should have tabindex=-1 for unsupported agents (coming soon)', async () => {
      // Note: tabIndex is based on isSupported (in SUPPORTED_AGENTS), not availability
      // gemini-cli is not in SUPPORTED_AGENTS so it should have tabIndex=-1
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'gemini-cli', name: 'Gemini CLI', available: false }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        const option = screen.getByRole('option', { name: /Gemini CLI/i });
        expect(option).toHaveAttribute('tabIndex', '-1');
      });
    });
  });

  describe('Multiple agents display', () => {
    it('should display multiple agents correctly', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
        createAgentConfig({ id: 'openai-codex', name: 'OpenAI Codex', available: false }),
        createAgentConfig({ id: 'gemini-cli', name: 'Gemini CLI', available: false }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
        expect(screen.getByText('OpenAI Codex')).toBeInTheDocument();
        expect(screen.getByText('Gemini CLI')).toBeInTheDocument();
      });
    });

    it('should display correct badge for each agent type', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: true }),
        createAgentConfig({ id: 'openai-codex', name: 'OpenAI Codex', available: false }),
      ]);

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Available')).toBeInTheDocument();
        expect(screen.getByText('Coming Soon')).toBeInTheDocument();
      });
    });
  });

  describe('PATH display in debug info', () => {
    it('should split and display PATH entries correctly', async () => {
      vi.mocked(window.maestro.agents.detect).mockResolvedValue([
        createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false }),
      ]);
      vi.mocked(window.maestro.agents.refresh).mockResolvedValue({
        agents: [createAgentConfig({ id: 'claude-code', name: 'Claude Code', available: false })],
        debugInfo: {
          agentId: 'claude-code',
          available: false,
          path: null,
          binaryName: 'claude',
          envPath: '/usr/bin:/usr/local/bin:/home/user/.local/bin',
          homeDir: '/home/user',
          platform: 'linux',
          whichCommand: 'which',
          error: null,
        },
      });

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
        existingSessions={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Refresh detection')).toBeInTheDocument();
      });

      const refreshButton = screen.getByTitle('Refresh detection');
      await act(async () => {
        fireEvent.click(refreshButton);
      });

      await waitFor(() => {
        expect(screen.getByText('/usr/bin')).toBeInTheDocument();
        expect(screen.getByText('/usr/local/bin')).toBeInTheDocument();
        expect(screen.getByText('/home/user/.local/bin')).toBeInTheDocument();
      });
    });
  });

  describe('model autocomplete', () => {
    it('should load models when expanding an agent with supportsModelSelection', async () => {
      const agentWithModelSelection = createAgentConfig({
        id: 'opencode',
        name: 'OpenCode',
        available: true,
        capabilities: {
          supportsResume: false,
          supportsReadOnlyMode: false,
          supportsJsonOutput: true,
          supportsSessionId: true,
          supportsImageInput: false,
          supportsSlashCommands: false,
          supportsSessionStorage: false,
          supportsCostTracking: false,
          supportsUsageStats: true,
          supportsBatchMode: true,
          supportsStreaming: true,
          supportsResultMessages: true,
          supportsModelSelection: true,
        },
        configOptions: [
          {
            key: 'model',
            type: 'text',
            label: 'Model',
            description: 'Model to use',
            default: '',
          },
        ],
      });

      vi.mocked(window.maestro.agents.detect).mockResolvedValue([agentWithModelSelection]);
      vi.mocked(window.maestro.agents.getModels).mockResolvedValue([
        'ollama/qwen3:8b',
        'anthropic/claude-sonnet-4-20250514',
        'opencode/gpt-5-nano',
      ]);
      vi.mocked(window.maestro.agents.getConfig).mockResolvedValue({});

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
          existingSessions={[]}
        />
      );

      // Wait for agents to load and click to expand
      await waitFor(() => {
        expect(screen.getByText('OpenCode')).toBeInTheDocument();
      });

      // Click to expand the agent
      const agentRow = screen.getByText('OpenCode').closest('[role="option"]');
      if (agentRow) {
        await act(async () => {
          fireEvent.click(agentRow);
        });
      }

      // Should call getModels when expanding
      await waitFor(() => {
        expect(window.maestro.agents.getModels).toHaveBeenCalledWith('opencode', false);
      });
    });

    it('should show model count when models are loaded', async () => {
      const agentWithModelSelection = createAgentConfig({
        id: 'opencode',
        name: 'OpenCode',
        available: true,
        capabilities: {
          supportsResume: false,
          supportsReadOnlyMode: false,
          supportsJsonOutput: true,
          supportsSessionId: true,
          supportsImageInput: false,
          supportsSlashCommands: false,
          supportsSessionStorage: false,
          supportsCostTracking: false,
          supportsUsageStats: true,
          supportsBatchMode: true,
          supportsStreaming: true,
          supportsResultMessages: true,
          supportsModelSelection: true,
        },
        configOptions: [
          {
            key: 'model',
            type: 'text',
            label: 'Model',
            description: 'Model to use',
            default: '',
          },
        ],
      });

      vi.mocked(window.maestro.agents.detect).mockResolvedValue([agentWithModelSelection]);
      vi.mocked(window.maestro.agents.getModels).mockResolvedValue([
        'model1',
        'model2',
        'model3',
      ]);
      vi.mocked(window.maestro.agents.getConfig).mockResolvedValue({});

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
          existingSessions={[]}
        />
      );

      // Wait for agents to load and click to expand
      await waitFor(() => {
        expect(screen.getByText('OpenCode')).toBeInTheDocument();
      });

      // Click to expand the agent
      const agentRow = screen.getByText('OpenCode').closest('[role="option"]');
      if (agentRow) {
        await act(async () => {
          fireEvent.click(agentRow);
        });
      }

      // Should show model count
      await waitFor(() => {
        expect(screen.getByText('3 models available')).toBeInTheDocument();
      });
    });

    it('should not load models for agents without supportsModelSelection', async () => {
      const agentWithoutModelSelection = createAgentConfig({
        id: 'claude-code',
        name: 'Claude Code',
        available: true,
        capabilities: {
          supportsResume: true,
          supportsReadOnlyMode: true,
          supportsJsonOutput: true,
          supportsSessionId: true,
          supportsImageInput: true,
          supportsSlashCommands: true,
          supportsSessionStorage: true,
          supportsCostTracking: true,
          supportsUsageStats: true,
          supportsBatchMode: true,
          supportsStreaming: true,
          supportsResultMessages: true,
          supportsModelSelection: false,
        },
      });

      vi.mocked(window.maestro.agents.detect).mockResolvedValue([agentWithoutModelSelection]);
      vi.mocked(window.maestro.agents.getConfig).mockResolvedValue({});

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
          existingSessions={[]}
        />
      );

      // Wait for agents to load and click to expand
      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      // Click to expand the agent
      const agentRow = screen.getByText('Claude Code').closest('[role="option"]');
      if (agentRow) {
        await act(async () => {
          fireEvent.click(agentRow);
        });
      }

      // Should NOT call getModels
      expect(window.maestro.agents.getModels).not.toHaveBeenCalled();
    });

    it('should show refresh button for model input when supportsModelSelection', async () => {
      const agentWithModelSelection = createAgentConfig({
        id: 'opencode',
        name: 'OpenCode',
        available: true,
        capabilities: {
          supportsResume: false,
          supportsReadOnlyMode: false,
          supportsJsonOutput: true,
          supportsSessionId: true,
          supportsImageInput: false,
          supportsSlashCommands: false,
          supportsSessionStorage: false,
          supportsCostTracking: false,
          supportsUsageStats: true,
          supportsBatchMode: true,
          supportsStreaming: true,
          supportsResultMessages: true,
          supportsModelSelection: true,
        },
        configOptions: [
          {
            key: 'model',
            type: 'text',
            label: 'Model',
            description: 'Model to use',
            default: '',
          },
        ],
      });

      vi.mocked(window.maestro.agents.detect).mockResolvedValue([agentWithModelSelection]);
      vi.mocked(window.maestro.agents.getModels).mockResolvedValue(['model1']);
      vi.mocked(window.maestro.agents.getConfig).mockResolvedValue({});

      render(
        <NewInstanceModal
          isOpen={true}
          onClose={onClose}
          onCreate={onCreate}
          theme={theme}
          existingSessions={[]}
        />
      );

      // Wait for agents to load and click to expand
      await waitFor(() => {
        expect(screen.getByText('OpenCode')).toBeInTheDocument();
      });

      // Click to expand the agent
      const agentRow = screen.getByText('OpenCode').closest('[role="option"]');
      if (agentRow) {
        await act(async () => {
          fireEvent.click(agentRow);
        });
      }

      // Should show refresh button with correct title
      await waitFor(() => {
        expect(screen.getByTitle('Refresh available models')).toBeInTheDocument();
      });
    });
  });
});
