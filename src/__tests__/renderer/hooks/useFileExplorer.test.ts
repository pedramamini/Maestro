import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileExplorer, FileNode } from '../../../renderer/hooks/useFileExplorer';
import type { Session, AITab } from '../../../renderer/types';

// Helper to create a minimal valid session
const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  id: `session-${Date.now()}-${Math.random()}`,
  name: 'Test Session',
  toolType: 'claude-code',
  state: 'idle',
  cwd: '/test/path',
  fullPath: '/test/path',
  projectRoot: '/test/path',
  aiLogs: [],
  shellLogs: [],
  workLog: [],
  contextUsage: 0,
  inputMode: 'ai',
  aiPid: 0,
  terminalPid: 0,
  port: 3000,
  isLive: false,
  changedFiles: [],
  isGitRepo: true,
  fileTree: [],
  fileExplorerExpanded: [],
  fileExplorerScrollPos: 0,
  aiTabs: [],
  activeTabId: '',
  closedTabHistory: [],
  executionQueue: [],
  activeTimeMs: 0,
  ...overrides,
});

// Store original maestro mock for restoration
const originalMaestro = { ...window.maestro };

// Add missing shell mock to window.maestro
const extendMaestro = () => {
  Object.assign(window.maestro, {
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined),
    },
    fs: {
      readDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue(''),
    },
    dialog: {
      selectFolder: vi.fn().mockResolvedValue(null),
    },
  });
};

describe('useFileExplorer', () => {
  let setActiveFocusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setActiveFocusMock = vi.fn();
    extendMaestro();
  });

  afterEach(() => {
    // Restore original maestro
    Object.assign(window.maestro, originalMaestro);
  });

  describe('shouldOpenExternally', () => {
    // Get the function through the hook
    const getShouldOpenExternally = () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));
      return result.current.shouldOpenExternally;
    };

    describe('document extensions', () => {
      it('should return true for .pdf files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('document.pdf')).toBe(true);
      });

      it('should return true for .doc files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('document.doc')).toBe(true);
      });

      it('should return true for .docx files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('document.docx')).toBe(true);
      });

      it('should return true for .xls files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('spreadsheet.xls')).toBe(true);
      });

      it('should return true for .xlsx files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('spreadsheet.xlsx')).toBe(true);
      });

      it('should return true for .ppt files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('presentation.ppt')).toBe(true);
      });

      it('should return true for .pptx files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('presentation.pptx')).toBe(true);
      });
    });

    describe('image extensions', () => {
      it('should return true for .png files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('image.png')).toBe(true);
      });

      it('should return true for .jpg files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('image.jpg')).toBe(true);
      });

      it('should return true for .jpeg files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('photo.jpeg')).toBe(true);
      });

      it('should return true for .gif files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('animation.gif')).toBe(true);
      });

      it('should return true for .bmp files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('bitmap.bmp')).toBe(true);
      });

      it('should return true for .svg files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('vector.svg')).toBe(true);
      });

      it('should return true for .webp files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('modern.webp')).toBe(true);
      });
    });

    describe('video extensions', () => {
      it('should return true for .mp4 files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('video.mp4')).toBe(true);
      });

      it('should return true for .mov files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('movie.mov')).toBe(true);
      });

      it('should return true for .avi files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('clip.avi')).toBe(true);
      });

      it('should return true for .mkv files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('video.mkv')).toBe(true);
      });

      it('should return true for .webm files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('video.webm')).toBe(true);
      });
    });

    describe('audio extensions', () => {
      it('should return true for .mp3 files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('song.mp3')).toBe(true);
      });

      it('should return true for .wav files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('audio.wav')).toBe(true);
      });

      it('should return true for .flac files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('lossless.flac')).toBe(true);
      });

      it('should return true for .aac files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('compressed.aac')).toBe(true);
      });
    });

    describe('archive extensions', () => {
      it('should return true for .zip files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('archive.zip')).toBe(true);
      });

      it('should return true for .tar files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('archive.tar')).toBe(true);
      });

      it('should return true for .gz files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('compressed.gz')).toBe(true);
      });

      it('should return true for .7z files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('archive.7z')).toBe(true);
      });

      it('should return true for .rar files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('archive.rar')).toBe(true);
      });
    });

    describe('executable extensions', () => {
      it('should return true for .exe files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('program.exe')).toBe(true);
      });

      it('should return true for .dmg files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('installer.dmg')).toBe(true);
      });

      it('should return true for .app files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('Application.app')).toBe(true);
      });

      it('should return true for .deb files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('package.deb')).toBe(true);
      });

      it('should return true for .rpm files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('package.rpm')).toBe(true);
      });
    });

    describe('code and text files (should NOT open externally)', () => {
      it('should return false for .ts files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('code.ts')).toBe(false);
      });

      it('should return false for .tsx files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('component.tsx')).toBe(false);
      });

      it('should return false for .js files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('script.js')).toBe(false);
      });

      it('should return false for .jsx files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('component.jsx')).toBe(false);
      });

      it('should return false for .json files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('config.json')).toBe(false);
      });

      it('should return false for .md files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('README.md')).toBe(false);
      });

      it('should return false for .txt files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('notes.txt')).toBe(false);
      });

      it('should return false for .html files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('page.html')).toBe(false);
      });

      it('should return false for .css files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('styles.css')).toBe(false);
      });

      it('should return false for .py files', () => {
        const fn = getShouldOpenExternally();
        expect(fn('script.py')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for files with no extension', () => {
        const fn = getShouldOpenExternally();
        expect(fn('Makefile')).toBe(false);
      });

      it('should handle uppercase extensions (case insensitive)', () => {
        const fn = getShouldOpenExternally();
        expect(fn('IMAGE.PNG')).toBe(true);
        expect(fn('document.PDF')).toBe(true);
      });

      it('should return false for empty filename', () => {
        const fn = getShouldOpenExternally();
        expect(fn('')).toBe(false);
      });

      it('should handle multiple dots in filename', () => {
        const fn = getShouldOpenExternally();
        expect(fn('file.name.with.dots.pdf')).toBe(true);
        expect(fn('archive.tar.gz')).toBe(true);
      });

      it('should return false for hidden files without extension', () => {
        const fn = getShouldOpenExternally();
        expect(fn('.gitignore')).toBe(false);
      });

      it('should handle hidden files with external extension', () => {
        const fn = getShouldOpenExternally();
        expect(fn('.hidden.pdf')).toBe(true);
      });
    });
  });

  describe('flattenTree', () => {
    const getFlattenTree = () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));
      return result.current.flattenTree;
    };

    it('should return empty array for empty tree', () => {
      const flattenTree = getFlattenTree();
      expect(flattenTree([], new Set())).toEqual([]);
    });

    it('should flatten single file', () => {
      const flattenTree = getFlattenTree();
      const tree = [{ name: 'file.ts', type: 'file' }];
      const result = flattenTree(tree, new Set());
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('file.ts');
      expect(result[0].fullPath).toBe('file.ts');
      expect(result[0].isFolder).toBe(false);
    });

    it('should flatten single folder (collapsed)', () => {
      const flattenTree = getFlattenTree();
      const tree = [{
        name: 'src',
        type: 'folder',
        children: [{ name: 'index.ts', type: 'file' }]
      }];
      const result = flattenTree(tree, new Set()); // Not expanded
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('src');
      expect(result[0].isFolder).toBe(true);
    });

    it('should flatten folder with expanded children', () => {
      const flattenTree = getFlattenTree();
      const tree = [{
        name: 'src',
        type: 'folder',
        children: [
          { name: 'index.ts', type: 'file' },
          { name: 'utils.ts', type: 'file' }
        ]
      }];
      const expandedSet = new Set(['src']);
      const result = flattenTree(tree, expandedSet);
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('src');
      expect(result[1].name).toBe('index.ts');
      expect(result[1].fullPath).toBe('src/index.ts');
      expect(result[2].name).toBe('utils.ts');
    });

    it('should not include children of collapsed folders', () => {
      const flattenTree = getFlattenTree();
      const tree = [{
        name: 'src',
        type: 'folder',
        children: [
          { name: 'index.ts', type: 'file' },
          {
            name: 'utils',
            type: 'folder',
            children: [{ name: 'helper.ts', type: 'file' }]
          }
        ]
      }];
      const expandedSet = new Set(['src']); // Only src is expanded, not src/utils
      const result = flattenTree(tree, expandedSet);
      expect(result).toHaveLength(3);
      expect(result.find(n => n.name === 'helper.ts')).toBeUndefined();
    });

    it('should handle deeply nested expanded folders', () => {
      const flattenTree = getFlattenTree();
      const tree = [{
        name: 'a',
        type: 'folder',
        children: [{
          name: 'b',
          type: 'folder',
          children: [{
            name: 'c',
            type: 'folder',
            children: [{ name: 'deep.ts', type: 'file' }]
          }]
        }]
      }];
      const expandedSet = new Set(['a', 'a/b', 'a/b/c']);
      const result = flattenTree(tree, expandedSet);
      expect(result).toHaveLength(4);
      expect(result[3].name).toBe('deep.ts');
      expect(result[3].fullPath).toBe('a/b/c/deep.ts');
    });

    it('should set fullPath correctly for root items', () => {
      const flattenTree = getFlattenTree();
      const tree = [
        { name: 'package.json', type: 'file' },
        { name: 'src', type: 'folder', children: [] }
      ];
      const result = flattenTree(tree, new Set());
      expect(result[0].fullPath).toBe('package.json');
      expect(result[1].fullPath).toBe('src');
    });

    it('should set fullPath correctly for nested items', () => {
      const flattenTree = getFlattenTree();
      const tree = [{
        name: 'src',
        type: 'folder',
        children: [{
          name: 'components',
          type: 'folder',
          children: [{ name: 'Button.tsx', type: 'file' }]
        }]
      }];
      const expandedSet = new Set(['src', 'src/components']);
      const result = flattenTree(tree, expandedSet);
      expect(result[2].fullPath).toBe('src/components/Button.tsx');
    });

    it('should set isFolder true for folders', () => {
      const flattenTree = getFlattenTree();
      const tree = [{ name: 'src', type: 'folder', children: [] }];
      const result = flattenTree(tree, new Set());
      expect(result[0].isFolder).toBe(true);
    });

    it('should set isFolder false for files', () => {
      const flattenTree = getFlattenTree();
      const tree = [{ name: 'index.ts', type: 'file' }];
      const result = flattenTree(tree, new Set());
      expect(result[0].isFolder).toBe(false);
    });

    it('should preserve node properties', () => {
      const flattenTree = getFlattenTree();
      const tree = [{
        name: 'custom.ts',
        type: 'file',
        customProp: 'value'
      }];
      const result = flattenTree(tree, new Set());
      expect(result[0].customProp).toBe('value');
    });

    it('should handle mixed files and folders', () => {
      const flattenTree = getFlattenTree();
      const tree = [
        { name: 'README.md', type: 'file' },
        { name: 'src', type: 'folder', children: [{ name: 'index.ts', type: 'file' }] },
        { name: 'package.json', type: 'file' }
      ];
      const expandedSet = new Set(['src']);
      const result = flattenTree(tree, expandedSet);
      expect(result).toHaveLength(4);
      expect(result[0].name).toBe('README.md');
      expect(result[1].name).toBe('src');
      expect(result[2].name).toBe('index.ts');
      expect(result[3].name).toBe('package.json');
    });

    it('should maintain order from input tree', () => {
      const flattenTree = getFlattenTree();
      const tree = [
        { name: 'z-last.ts', type: 'file' },
        { name: 'a-first.ts', type: 'file' },
        { name: 'm-middle.ts', type: 'file' }
      ];
      const result = flattenTree(tree, new Set());
      expect(result[0].name).toBe('z-last.ts');
      expect(result[1].name).toBe('a-first.ts');
      expect(result[2].name).toBe('m-middle.ts');
    });

    it('should handle multiple expanded folders', () => {
      const flattenTree = getFlattenTree();
      const tree = [
        {
          name: 'src',
          type: 'folder',
          children: [{ name: 'index.ts', type: 'file' }]
        },
        {
          name: 'tests',
          type: 'folder',
          children: [{ name: 'test.ts', type: 'file' }]
        }
      ];
      const expandedSet = new Set(['src', 'tests']);
      const result = flattenTree(tree, expandedSet);
      expect(result).toHaveLength(4);
      expect(result.map(n => n.name)).toEqual(['src', 'index.ts', 'tests', 'test.ts']);
    });

    it('should handle partially expanded tree', () => {
      const flattenTree = getFlattenTree();
      const tree = [
        {
          name: 'expanded',
          type: 'folder',
          children: [{ name: 'visible.ts', type: 'file' }]
        },
        {
          name: 'collapsed',
          type: 'folder',
          children: [{ name: 'hidden.ts', type: 'file' }]
        }
      ];
      const expandedSet = new Set(['expanded']);
      const result = flattenTree(tree, expandedSet);
      expect(result).toHaveLength(3);
      expect(result.map(n => n.name)).toEqual(['expanded', 'visible.ts', 'collapsed']);
    });
  });

  describe('handleFileClick', () => {
    it('should read file content and set preview for text file', async () => {
      const mockReadFile = vi.fn().mockResolvedValue('file content');
      (window.maestro.fs.readFile as ReturnType<typeof vi.fn>).mockImplementation(mockReadFile);

      const session = createMockSession({ fullPath: '/project' });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const node = { name: 'index.ts', type: 'file' };
      await act(async () => {
        await result.current.handleFileClick(node, 'src/index.ts', session);
      });

      expect(mockReadFile).toHaveBeenCalledWith('/project/src/index.ts');
      expect(result.current.previewFile).toEqual({
        name: 'index.ts',
        content: 'file content',
        path: '/project/src/index.ts'
      });
    });

    it('should call setActiveFocus with main after preview', async () => {
      const mockReadFile = vi.fn().mockResolvedValue('content');
      (window.maestro.fs.readFile as ReturnType<typeof vi.fn>).mockImplementation(mockReadFile);

      const session = createMockSession({ fullPath: '/project' });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const node = { name: 'test.ts', type: 'file' };
      await act(async () => {
        await result.current.handleFileClick(node, 'test.ts', session);
      });

      expect(setActiveFocusMock).toHaveBeenCalledWith('main');
    });

    it('should open externally for image file', async () => {
      const mockOpenExternal = vi.fn().mockResolvedValue(undefined);
      (window.maestro.shell.openExternal as ReturnType<typeof vi.fn>).mockImplementation(mockOpenExternal);

      const session = createMockSession({ fullPath: '/project' });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const node = { name: 'photo.png', type: 'file' };
      await act(async () => {
        await result.current.handleFileClick(node, 'images/photo.png', session);
      });

      expect(mockOpenExternal).toHaveBeenCalledWith('file:///project/images/photo.png');
      expect(result.current.previewFile).toBeNull();
    });

    it('should open externally for pdf file', async () => {
      const mockOpenExternal = vi.fn().mockResolvedValue(undefined);
      (window.maestro.shell.openExternal as ReturnType<typeof vi.fn>).mockImplementation(mockOpenExternal);

      const session = createMockSession({ fullPath: '/project' });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const node = { name: 'document.pdf', type: 'file' };
      await act(async () => {
        await result.current.handleFileClick(node, 'docs/document.pdf', session);
      });

      expect(mockOpenExternal).toHaveBeenCalledWith('file:///project/docs/document.pdf');
    });

    it('should do nothing for folder node', async () => {
      const mockReadFile = vi.fn();
      const mockOpenExternal = vi.fn();
      (window.maestro.fs.readFile as ReturnType<typeof vi.fn>).mockImplementation(mockReadFile);
      (window.maestro.shell.openExternal as ReturnType<typeof vi.fn>).mockImplementation(mockOpenExternal);

      const session = createMockSession({ fullPath: '/project' });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const node = { name: 'src', type: 'folder', children: [] };
      await act(async () => {
        await result.current.handleFileClick(node, 'src', session);
      });

      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });

    it('should construct correct full path', async () => {
      const mockReadFile = vi.fn().mockResolvedValue('content');
      (window.maestro.fs.readFile as ReturnType<typeof vi.fn>).mockImplementation(mockReadFile);

      const session = createMockSession({ fullPath: '/Users/dev/myproject' });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const node = { name: 'utils.ts', type: 'file' };
      await act(async () => {
        await result.current.handleFileClick(node, 'src/lib/utils.ts', session);
      });

      expect(mockReadFile).toHaveBeenCalledWith('/Users/dev/myproject/src/lib/utils.ts');
    });

    it('should handle file read error gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockReadFile = vi.fn().mockRejectedValue(new Error('Read failed'));
      (window.maestro.fs.readFile as ReturnType<typeof vi.fn>).mockImplementation(mockReadFile);

      const session = createMockSession({ fullPath: '/project' });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const node = { name: 'missing.ts', type: 'file' };
      await act(async () => {
        await result.current.handleFileClick(node, 'missing.ts', session);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to read file:', expect.any(Error));
      expect(result.current.previewFile).toBeNull();

      consoleErrorSpy.mockRestore();
    });

    it('should use activeSession.fullPath for path construction', async () => {
      const mockOpenExternal = vi.fn().mockResolvedValue(undefined);
      (window.maestro.shell.openExternal as ReturnType<typeof vi.fn>).mockImplementation(mockOpenExternal);

      const session = createMockSession({
        fullPath: '/different/path',
        cwd: '/some/other/path'
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const node = { name: 'image.png', type: 'file' };
      await act(async () => {
        await result.current.handleFileClick(node, 'image.png', session);
      });

      // Should use fullPath, not cwd
      expect(mockOpenExternal).toHaveBeenCalledWith('file:///different/path/image.png');
    });
  });

  describe('loadFileTree', () => {
    it('should return empty array at max depth', async () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path', 2, 2); // currentDepth >= maxDepth
      expect(tree).toEqual([]);
    });

    it('should load entries from directory', async () => {
      const mockReadDir = vi.fn().mockResolvedValue([
        { name: 'file1.ts', isFile: true, isDirectory: false },
        { name: 'file2.ts', isFile: true, isDirectory: false }
      ]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(mockReadDir).toHaveBeenCalledWith('/path');
      expect(tree).toHaveLength(2);
    });

    it('should skip hidden files (starting with .)', async () => {
      const mockReadDir = vi.fn().mockResolvedValue([
        { name: '.gitignore', isFile: true, isDirectory: false },
        { name: '.env', isFile: true, isDirectory: false },
        { name: 'visible.ts', isFile: true, isDirectory: false }
      ]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('visible.ts');
    });

    it('should skip node_modules', async () => {
      const mockReadDir = vi.fn().mockResolvedValue([
        { name: 'node_modules', isFile: false, isDirectory: true },
        { name: 'src', isFile: false, isDirectory: true }
      ]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('src');
    });

    it('should skip __pycache__', async () => {
      const mockReadDir = vi.fn().mockResolvedValue([
        { name: '__pycache__', isFile: false, isDirectory: true },
        { name: 'main.py', isFile: true, isDirectory: false }
      ]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('main.py');
    });

    it('should recursively load subdirectories', async () => {
      const mockReadDir = vi.fn()
        .mockResolvedValueOnce([
          { name: 'src', isFile: false, isDirectory: true }
        ])
        .mockResolvedValueOnce([
          { name: 'index.ts', isFile: true, isDirectory: false }
        ]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(mockReadDir).toHaveBeenCalledTimes(2);
      expect(mockReadDir).toHaveBeenCalledWith('/path');
      expect(mockReadDir).toHaveBeenCalledWith('/path/src');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].name).toBe('index.ts');
    });

    it('should sort folders before files', async () => {
      const mockReadDir = vi.fn().mockResolvedValue([
        { name: 'zebra.ts', isFile: true, isDirectory: false },
        { name: 'apple', isFile: false, isDirectory: true },
        { name: 'banana.ts', isFile: true, isDirectory: false }
      ]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(tree[0].name).toBe('apple'); // Folder first
      expect(tree[0].type).toBe('folder');
      expect(tree[1].type).toBe('file');
      expect(tree[2].type).toBe('file');
    });

    it('should sort alphabetically within type', async () => {
      const mockReadDir = vi.fn().mockResolvedValue([
        { name: 'zebra.ts', isFile: true, isDirectory: false },
        { name: 'alpha.ts', isFile: true, isDirectory: false },
        { name: 'beta.ts', isFile: true, isDirectory: false }
      ]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(tree.map((n: FileNode) => n.name)).toEqual(['alpha.ts', 'beta.ts', 'zebra.ts']);
    });

    it('should set type folder for directories', async () => {
      const mockReadDir = vi.fn().mockResolvedValue([
        { name: 'folder', isFile: false, isDirectory: true }
      ]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(tree[0].type).toBe('folder');
    });

    it('should set type file for files', async () => {
      const mockReadDir = vi.fn().mockResolvedValue([
        { name: 'file.ts', isFile: true, isDirectory: false }
      ]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(tree[0].type).toBe('file');
    });

    it('should propagate errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockReadDir = vi.fn().mockRejectedValue(new Error('Permission denied'));
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      await expect(result.current.loadFileTree('/path')).rejects.toThrow('Permission denied');
      consoleErrorSpy.mockRestore();
    });

    it('should handle empty directory', async () => {
      const mockReadDir = vi.fn().mockResolvedValue([]);
      (window.maestro.fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(mockReadDir);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const tree = await result.current.loadFileTree('/path');
      expect(tree).toEqual([]);
    });
  });

  describe('updateSessionWorkingDirectory', () => {
    it('should update session cwd when folder selected', async () => {
      const mockSelectFolder = vi.fn().mockResolvedValue('/new/path');
      (window.maestro.dialog.selectFolder as ReturnType<typeof vi.fn>).mockImplementation(mockSelectFolder);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      await act(async () => {
        await result.current.updateSessionWorkingDirectory('session-1', setSessions);
      });

      expect(setSessions).toHaveBeenCalled();
      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({ id: 'session-1', cwd: '/old/path' })];
      const updated = updateFn(sessions);
      expect(updated[0].cwd).toBe('/new/path');
      expect(updated[0].fullPath).toBe('/new/path');
    });

    it('should do nothing when dialog canceled', async () => {
      const mockSelectFolder = vi.fn().mockResolvedValue(null);
      (window.maestro.dialog.selectFolder as ReturnType<typeof vi.fn>).mockImplementation(mockSelectFolder);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      await act(async () => {
        await result.current.updateSessionWorkingDirectory('session-1', setSessions);
      });

      expect(setSessions).not.toHaveBeenCalled();
    });

    it('should only update matching session', async () => {
      const mockSelectFolder = vi.fn().mockResolvedValue('/new/path');
      (window.maestro.dialog.selectFolder as ReturnType<typeof vi.fn>).mockImplementation(mockSelectFolder);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      await act(async () => {
        await result.current.updateSessionWorkingDirectory('session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [
        createMockSession({ id: 'session-1', cwd: '/old/path' }),
        createMockSession({ id: 'session-2', cwd: '/other/path' })
      ];
      const updated = updateFn(sessions);
      expect(updated[0].cwd).toBe('/new/path');
      expect(updated[1].cwd).toBe('/other/path'); // Unchanged
    });

    it('should reset fileTree to empty array', async () => {
      const mockSelectFolder = vi.fn().mockResolvedValue('/new/path');
      (window.maestro.dialog.selectFolder as ReturnType<typeof vi.fn>).mockImplementation(mockSelectFolder);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      await act(async () => {
        await result.current.updateSessionWorkingDirectory('session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({ id: 'session-1', fileTree: [{ name: 'old' }] })];
      const updated = updateFn(sessions);
      expect(updated[0].fileTree).toEqual([]);
    });

    it('should clear fileTreeError', async () => {
      const mockSelectFolder = vi.fn().mockResolvedValue('/new/path');
      (window.maestro.dialog.selectFolder as ReturnType<typeof vi.fn>).mockImplementation(mockSelectFolder);

      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      await act(async () => {
        await result.current.updateSessionWorkingDirectory('session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({ id: 'session-1', fileTreeError: 'Some error' })];
      const updated = updateFn(sessions);
      expect(updated[0].fileTreeError).toBeUndefined();
    });
  });

  describe('toggleFolder', () => {
    it('should expand collapsed folder', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.toggleFolder('src', 'session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({
        id: 'session-1',
        fileExplorerExpanded: []
      })];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toContain('src');
    });

    it('should collapse expanded folder', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.toggleFolder('src', 'session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({
        id: 'session-1',
        fileExplorerExpanded: ['src', 'tests']
      })];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).not.toContain('src');
      expect(updated[0].fileExplorerExpanded).toContain('tests');
    });

    it('should not modify non-matching sessions', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.toggleFolder('src', 'session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [
        createMockSession({ id: 'session-1', fileExplorerExpanded: [] }),
        createMockSession({ id: 'session-2', fileExplorerExpanded: ['other'] })
      ];
      const updated = updateFn(sessions);
      expect(updated[1].fileExplorerExpanded).toEqual(['other']); // Unchanged
    });

    it('should return unchanged session if fileExplorerExpanded missing', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.toggleFolder('src', 'session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      // Create session without fileExplorerExpanded by explicitly setting to undefined
      const sessionData = createMockSession({ id: 'session-1' });
      (sessionData as any).fileExplorerExpanded = undefined;
      const sessions = [sessionData];
      const updated = updateFn(sessions);
      expect(updated[0]).toBe(sessions[0]); // Same reference, unchanged
    });

    it('should preserve other expanded folders', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.toggleFolder('newFolder', 'session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({
        id: 'session-1',
        fileExplorerExpanded: ['a', 'b', 'c']
      })];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toContain('a');
      expect(updated[0].fileExplorerExpanded).toContain('b');
      expect(updated[0].fileExplorerExpanded).toContain('c');
      expect(updated[0].fileExplorerExpanded).toContain('newFolder');
    });

    it('should handle path not in expanded set', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.toggleFolder('notExpanded', 'session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({
        id: 'session-1',
        fileExplorerExpanded: ['other']
      })];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toContain('notExpanded');
    });
  });

  describe('expandAllFolders', () => {
    it('should expand all folders in tree', () => {
      const session = createMockSession({
        id: 'session-1',
        fileTree: [
          { name: 'src', type: 'folder', children: [] },
          { name: 'tests', type: 'folder', children: [] }
        ],
        fileExplorerExpanded: []
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.expandAllFolders('session-1', session, setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [session];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toContain('src');
      expect(updated[0].fileExplorerExpanded).toContain('tests');
    });

    it('should handle nested folders', () => {
      const session = createMockSession({
        id: 'session-1',
        fileTree: [
          {
            name: 'src',
            type: 'folder',
            children: [
              {
                name: 'components',
                type: 'folder',
                children: [
                  { name: 'ui', type: 'folder', children: [] }
                ]
              }
            ]
          }
        ],
        fileExplorerExpanded: []
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.expandAllFolders('session-1', session, setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [session];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toContain('src');
      expect(updated[0].fileExplorerExpanded).toContain('src/components');
      expect(updated[0].fileExplorerExpanded).toContain('src/components/ui');
    });

    it('should not modify non-matching sessions', () => {
      const session = createMockSession({
        id: 'session-1',
        fileTree: [{ name: 'src', type: 'folder', children: [] }],
        fileExplorerExpanded: []
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.expandAllFolders('session-1', session, setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [
        session,
        createMockSession({ id: 'session-2', fileExplorerExpanded: ['other'] })
      ];
      const updated = updateFn(sessions);
      expect(updated[1].fileExplorerExpanded).toEqual(['other']); // Unchanged
    });

    it('should return unchanged session if fileTree missing', () => {
      const session = createMockSession({
        id: 'session-1',
        fileExplorerExpanded: []
      });
      (session as any).fileTree = undefined;

      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.expandAllFolders('session-1', session, setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [session];
      const updated = updateFn(sessions);
      expect(updated[0]).toBe(sessions[0]); // Same reference
    });

    it('should generate correct paths for nested folders', () => {
      const session = createMockSession({
        id: 'session-1',
        fileTree: [
          {
            name: 'a',
            type: 'folder',
            children: [
              {
                name: 'b',
                type: 'folder',
                children: []
              }
            ]
          }
        ],
        fileExplorerExpanded: []
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.expandAllFolders('session-1', session, setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [session];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toEqual(['a', 'a/b']);
    });
  });

  describe('collapseAllFolders', () => {
    it('should set fileExplorerExpanded to empty array', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.collapseAllFolders('session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({
        id: 'session-1',
        fileExplorerExpanded: ['src', 'tests', 'docs']
      })];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toEqual([]);
    });

    it('should not modify non-matching sessions', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.collapseAllFolders('session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [
        createMockSession({ id: 'session-1', fileExplorerExpanded: ['src'] }),
        createMockSession({ id: 'session-2', fileExplorerExpanded: ['tests'] })
      ];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toEqual([]);
      expect(updated[1].fileExplorerExpanded).toEqual(['tests']); // Unchanged
    });

    it('should clear all expanded paths', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.collapseAllFolders('session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({
        id: 'session-1',
        fileExplorerExpanded: ['a', 'a/b', 'a/b/c', 'x', 'y']
      })];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toHaveLength(0);
    });

    it('should handle already collapsed state', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      const setSessions = vi.fn();
      act(() => {
        result.current.collapseAllFolders('session-1', setSessions);
      });

      const updateFn = setSessions.mock.calls[0][0];
      const sessions = [createMockSession({
        id: 'session-1',
        fileExplorerExpanded: []
      })];
      const updated = updateFn(sessions);
      expect(updated[0].fileExplorerExpanded).toEqual([]);
    });
  });

  describe('filteredFileTree', () => {
    it('should return original tree when no filter', () => {
      const fileTree = [
        { name: 'src', type: 'folder', children: [] },
        { name: 'README.md', type: 'file' }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      expect(result.current.filteredFileTree).toEqual(fileTree);
    });

    it('should return original tree when empty filter', () => {
      const fileTree = [
        { name: 'src', type: 'folder', children: [] }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilter('');
      });

      expect(result.current.filteredFileTree).toEqual(fileTree);
    });

    it('should filter files by name', () => {
      const fileTree = [
        { name: 'index.ts', type: 'file' },
        { name: 'App.tsx', type: 'file' },
        { name: 'utils.ts', type: 'file' }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilter('App');
      });

      expect(result.current.filteredFileTree).toHaveLength(1);
      expect(result.current.filteredFileTree[0].name).toBe('App.tsx');
    });

    it('should include matching folders', () => {
      const fileTree = [
        { name: 'src', type: 'folder', children: [] },
        { name: 'components', type: 'folder', children: [] },
        { name: 'utils', type: 'folder', children: [] }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilter('comp');
      });

      expect(result.current.filteredFileTree).toHaveLength(1);
      expect(result.current.filteredFileTree[0].name).toBe('components');
    });

    it('should include folder if children match', () => {
      const fileTree = [
        {
          name: 'src',
          type: 'folder',
          children: [
            { name: 'matching.ts', type: 'file' }
          ]
        }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilter('matching');
      });

      expect(result.current.filteredFileTree).toHaveLength(1);
      expect(result.current.filteredFileTree[0].name).toBe('src');
      expect(result.current.filteredFileTree[0].children).toHaveLength(1);
    });

    it('should exclude non-matching files', () => {
      const fileTree = [
        { name: 'visible.ts', type: 'file' },
        { name: 'hidden.ts', type: 'file' }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilter('visible');
      });

      expect(result.current.filteredFileTree).toHaveLength(1);
      expect(result.current.filteredFileTree[0].name).toBe('visible.ts');
    });

    it('should handle nested filtering', () => {
      const fileTree = [
        {
          name: 'src',
          type: 'folder',
          children: [
            {
              name: 'components',
              type: 'folder',
              children: [
                { name: 'Button.tsx', type: 'file' },
                { name: 'Input.tsx', type: 'file' }
              ]
            }
          ]
        }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilter('Button');
      });

      expect(result.current.filteredFileTree).toHaveLength(1);
      expect(result.current.filteredFileTree[0].name).toBe('src');
      expect(result.current.filteredFileTree[0].children[0].name).toBe('components');
      expect(result.current.filteredFileTree[0].children[0].children).toHaveLength(1);
      expect(result.current.filteredFileTree[0].children[0].children[0].name).toBe('Button.tsx');
    });

    it('should return empty array when no matches', () => {
      const fileTree = [
        { name: 'index.ts', type: 'file' },
        { name: 'App.tsx', type: 'file' }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilter('nonexistent');
      });

      expect(result.current.filteredFileTree).toEqual([]);
    });

    it('should return empty array when no activeSession', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilter('test');
      });

      expect(result.current.filteredFileTree).toEqual([]);
    });

    it('should use fuzzy matching', () => {
      const fileTree = [
        { name: 'ApplicationController.tsx', type: 'file' },
        { name: 'Button.tsx', type: 'file' }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree
      });
      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      // Fuzzy match: 'appcont' should match 'ApplicationController'
      act(() => {
        result.current.setFileTreeFilter('appcont');
      });

      expect(result.current.filteredFileTree).toHaveLength(1);
      expect(result.current.filteredFileTree[0].name).toBe('ApplicationController.tsx');
    });
  });

  describe('hook state management', () => {
    it('should initialize previewFile as null', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));
      expect(result.current.previewFile).toBeNull();
    });

    it('should initialize selectedFileIndex as 0', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));
      expect(result.current.selectedFileIndex).toBe(0);
    });

    it('should initialize flatFileList as empty array', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));
      expect(result.current.flatFileList).toEqual([]);
    });

    it('should initialize fileTreeFilter as empty string', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));
      expect(result.current.fileTreeFilter).toBe('');
    });

    it('should initialize fileTreeFilterOpen as false', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));
      expect(result.current.fileTreeFilterOpen).toBe(false);
    });

    it('should update previewFile via setPreviewFile', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      act(() => {
        result.current.setPreviewFile({
          name: 'test.ts',
          content: 'content',
          path: '/path/test.ts'
        });
      });

      expect(result.current.previewFile).toEqual({
        name: 'test.ts',
        content: 'content',
        path: '/path/test.ts'
      });
    });

    it('should update selectedFileIndex via setSelectedFileIndex', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      act(() => {
        result.current.setSelectedFileIndex(5);
      });

      expect(result.current.selectedFileIndex).toBe(5);
    });

    it('should update fileTreeFilter via setFileTreeFilter', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilter('search query');
      });

      expect(result.current.fileTreeFilter).toBe('search query');
    });

    it('should update fileTreeFilterOpen via setFileTreeFilterOpen', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));

      act(() => {
        result.current.setFileTreeFilterOpen(true);
      });

      expect(result.current.fileTreeFilterOpen).toBe(true);
    });

    it('should update flatFileList when activeSession changes', async () => {
      const fileTree = [
        { name: 'file1.ts', type: 'file' },
        { name: 'src', type: 'folder', children: [{ name: 'file2.ts', type: 'file' }] }
      ];
      const session = createMockSession({
        id: 'session-1',
        fileTree,
        fileExplorerExpanded: ['src']
      });

      const { result, rerender } = renderHook(
        ({ session }) => useFileExplorer(session, setActiveFocusMock),
        { initialProps: { session: null as Session | null } }
      );

      expect(result.current.flatFileList).toEqual([]);

      // Update with session that has file tree
      rerender({ session });

      await waitFor(() => {
        expect(result.current.flatFileList).toHaveLength(3);
        expect(result.current.flatFileList[0].name).toBe('file1.ts');
        expect(result.current.flatFileList[1].name).toBe('src');
        expect(result.current.flatFileList[2].name).toBe('file2.ts');
      });
    });

    it('should provide fileTreeContainerRef', () => {
      const { result } = renderHook(() => useFileExplorer(null, setActiveFocusMock));
      expect(result.current.fileTreeContainerRef).toBeDefined();
      expect(result.current.fileTreeContainerRef.current).toBeNull();
    });

    it('should clear flatFileList when activeSession becomes null', async () => {
      const session = createMockSession({
        id: 'session-1',
        fileTree: [{ name: 'file.ts', type: 'file' }],
        fileExplorerExpanded: []
      });

      const { result, rerender } = renderHook(
        ({ session }) => useFileExplorer(session, setActiveFocusMock),
        { initialProps: { session } }
      );

      await waitFor(() => {
        expect(result.current.flatFileList).toHaveLength(1);
      });

      rerender({ session: null });

      await waitFor(() => {
        expect(result.current.flatFileList).toEqual([]);
      });
    });

    it('should clear flatFileList when session has no fileExplorerExpanded', async () => {
      const session = createMockSession({
        id: 'session-1',
        fileTree: [{ name: 'file.ts', type: 'file' }]
      });
      (session as any).fileExplorerExpanded = undefined;

      const { result } = renderHook(() => useFileExplorer(session, setActiveFocusMock));

      await waitFor(() => {
        expect(result.current.flatFileList).toEqual([]);
      });
    });
  });
});
