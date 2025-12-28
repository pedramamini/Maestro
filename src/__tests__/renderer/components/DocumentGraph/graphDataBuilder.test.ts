/**
 * Tests for the Document Graph data builder
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  buildGraphData,
  isDocumentNode,
  isExternalLinkNode,
  type GraphNodeData,
  type DocumentNodeData,
  type ExternalLinkNodeData,
} from '../../../../renderer/components/DocumentGraph/graphDataBuilder';

// Type definitions for mock file system
interface MockFile {
  content: string;
  size: number;
}

interface MockDirectory {
  [key: string]: MockFile | MockDirectory | boolean;
  _isDirectory: boolean;
}

describe('graphDataBuilder', () => {
  // Store mock functions for easy reset
  let mockReadDir: Mock;
  let mockReadFile: Mock;
  let mockStat: Mock;

  // Mock file system data
  const mockFileSystem: MockDirectory = {
    _isDirectory: true,
    'readme.md': {
      content: '# Project\n\nSee [[getting-started]] for help.\n\nVisit [GitHub](https://github.com/test/repo).',
      size: 100,
    },
    'getting-started.md': {
      content: '# Getting Started\n\nCheck [[readme]] and [[advanced/config]] for more.',
      size: 150,
    },
    'standalone.md': {
      content: '# Standalone\n\nNo links here.',
      size: 50,
    },
    advanced: {
      _isDirectory: true,
      'config.md': {
        content: '---\ntitle: Configuration\ndescription: How to configure the app\n---\n\n# Config\n\nLink to [docs](https://docs.example.com).',
        size: 200,
      },
    },
    node_modules: {
      _isDirectory: true,
      'package.json': {
        content: '{}',
        size: 10,
      },
    },
  };

  function getEntry(path: string): MockFile | MockDirectory | undefined {
    const parts = path.split('/').filter(Boolean);
    let current: MockFile | MockDirectory = mockFileSystem;

    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return undefined;
      if ('content' in current) return undefined; // It's a file, can't go deeper
      current = current[part] as MockFile | MockDirectory;
      if (!current) return undefined;
    }

    return current;
  }

  function mockReadDirImpl(dirPath: string): Promise<Array<{ name: string; isDirectory: boolean; path: string }>> {
    const normalizedPath = dirPath.replace(/\/$/, '');
    const dir = normalizedPath === '/test' ? mockFileSystem : getEntry(normalizedPath.replace('/test/', ''));

    if (!dir || typeof dir !== 'object' || 'content' in dir) {
      return Promise.resolve([]);
    }

    const entries = Object.entries(dir)
      .filter(([key]) => key !== '_isDirectory')
      .map(([name, value]) => ({
        name,
        isDirectory: typeof value === 'object' && value !== null && '_isDirectory' in value && value._isDirectory === true,
        path: `${normalizedPath}/${name}`,
      }));

    return Promise.resolve(entries);
  }

  function mockReadFileImpl(filePath: string): Promise<string | null> {
    const relativePath = filePath.replace('/test/', '');
    const entry = getEntry(relativePath);

    if (entry && typeof entry === 'object' && 'content' in entry) {
      return Promise.resolve((entry as MockFile).content);
    }

    return Promise.resolve(null);
  }

  function mockStatImpl(filePath: string): Promise<{ size: number; createdAt: string; modifiedAt: string }> {
    const relativePath = filePath.replace('/test/', '');
    const entry = getEntry(relativePath);

    if (entry && typeof entry === 'object' && 'size' in entry) {
      return Promise.resolve({
        size: (entry as MockFile).size,
        createdAt: '2024-01-01T00:00:00.000Z',
        modifiedAt: '2024-01-15T12:30:00.000Z',
      });
    }

    return Promise.resolve({
      size: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-15T12:30:00.000Z',
    });
  }

  beforeEach(() => {
    // Reset mocks before each test
    mockReadDir = vi.fn().mockImplementation(mockReadDirImpl);
    mockReadFile = vi.fn().mockImplementation(mockReadFileImpl);
    mockStat = vi.fn().mockImplementation(mockStatImpl);

    // Apply mocks to window.maestro
    vi.mocked(window.maestro.fs.readDir).mockImplementation(mockReadDir);
    vi.mocked(window.maestro.fs.readFile).mockImplementation(mockReadFile);
    vi.mocked(window.maestro.fs.stat).mockImplementation(mockStat);
  });

  describe('buildGraphData', () => {
    it('should scan directory and find markdown files', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      // Should find 4 markdown files (readme, getting-started, standalone, advanced/config)
      const documentNodes = result.nodes.filter((n) => n.type === 'documentNode');
      expect(documentNodes).toHaveLength(4);
    });

    it('should skip node_modules directory', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      // Should not include any files from node_modules
      const nodeIds = result.nodes.map((n) => n.id);
      expect(nodeIds.every((id) => !id.includes('node_modules'))).toBe(true);
    });

    it('should create edges for internal wiki links', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      // readme.md links to getting-started.md
      const readmeToGettingStarted = result.edges.find(
        (e) => e.source === 'doc-readme.md' && e.target === 'doc-getting-started.md'
      );
      expect(readmeToGettingStarted).toBeDefined();
    });

    it('should create edges for nested internal links', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      // getting-started.md links to advanced/config.md
      const gettingStartedToConfig = result.edges.find(
        (e) => e.source === 'doc-getting-started.md' && e.target === 'doc-advanced/config.md'
      );
      expect(gettingStartedToConfig).toBeDefined();
    });

    it('should not create edges for non-existent files', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      // No edge should target a non-existent file
      const documentIds = new Set(
        result.nodes.filter((n) => n.type === 'documentNode').map((n) => n.id)
      );

      const brokenEdges = result.edges.filter(
        (e) => e.type !== 'external' && !documentIds.has(e.target)
      );
      expect(brokenEdges).toHaveLength(0);
    });

    it('should extract document stats for each node', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      const readmeNode = result.nodes.find((n) => n.id === 'doc-readme.md');
      expect(readmeNode).toBeDefined();

      const data = readmeNode!.data as DocumentNodeData;
      expect(data.nodeType).toBe('document');
      expect(data.title).toBe('Project');
      expect(data.lineCount).toBeGreaterThan(0);
      expect(data.wordCount).toBeGreaterThan(0);
      expect(data.size).toBe('100 B');
    });

    it('should extract front matter title and description', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      const configNode = result.nodes.find((n) => n.id === 'doc-advanced/config.md');
      expect(configNode).toBeDefined();

      const data = configNode!.data as DocumentNodeData;
      expect(data.title).toBe('Configuration');
      expect(data.description).toBe('How to configure the app');
    });
  });

  describe('external links', () => {
    it('should not include external links when disabled', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      const externalNodes = result.nodes.filter((n) => n.type === 'externalLinkNode');
      expect(externalNodes).toHaveLength(0);

      const externalEdges = result.edges.filter((e) => e.type === 'external');
      expect(externalEdges).toHaveLength(0);
    });

    it('should include external link nodes when enabled', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: true,
      });

      const externalNodes = result.nodes.filter((n) => n.type === 'externalLinkNode');
      // Should have nodes for github.com and docs.example.com
      expect(externalNodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should deduplicate external domains', async () => {
      // Add another file with the same github.com link
      const originalReadDirImpl = mockReadDirImpl;
      mockReadDir.mockImplementation((path: string) => {
        if (path === '/test') {
          return Promise.resolve([
            { name: 'readme.md', isDirectory: false, path: '/test/readme.md' },
            { name: 'another.md', isDirectory: false, path: '/test/another.md' },
          ]);
        }
        return originalReadDirImpl(path);
      });

      mockReadFile.mockImplementation((path: string) => {
        if (path === '/test/readme.md') {
          return Promise.resolve('# Readme\n\nVisit [GitHub](https://github.com/test/repo).');
        }
        if (path === '/test/another.md') {
          return Promise.resolve('# Another\n\nAlso see [GitHub](https://github.com/other/repo).');
        }
        return Promise.resolve(null);
      });

      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: true,
      });

      // Should only have one github.com node, with count of 2
      const githubNodes = result.nodes.filter(
        (n) => n.type === 'externalLinkNode' && n.id === 'ext-github.com'
      );
      expect(githubNodes).toHaveLength(1);

      const data = githubNodes[0].data as ExternalLinkNodeData;
      expect(data.linkCount).toBe(2);
      expect(data.urls).toHaveLength(2);
    });

    it('should create edges to external link nodes', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: true,
      });

      // readme.md links to github.com
      const readmeToGithub = result.edges.find(
        (e) => e.source === 'doc-readme.md' && e.target === 'ext-github.com'
      );
      expect(readmeToGithub).toBeDefined();
      expect(readmeToGithub!.type).toBe('external');
    });
  });

  describe('type guards', () => {
    it('isDocumentNode should identify document nodes', () => {
      const docData: GraphNodeData = {
        nodeType: 'document',
        title: 'Test',
        lineCount: 10,
        wordCount: 100,
        size: '1 KB',
        filePath: 'test.md',
      };

      expect(isDocumentNode(docData)).toBe(true);
      expect(isExternalLinkNode(docData)).toBe(false);
    });

    it('isExternalLinkNode should identify external link nodes', () => {
      const extData: GraphNodeData = {
        nodeType: 'external',
        domain: 'github.com',
        linkCount: 3,
        urls: ['https://github.com/test'],
      };

      expect(isExternalLinkNode(extData)).toBe(true);
      expect(isDocumentNode(extData)).toBe(false);
    });
  });

  describe('max nodes limit', () => {
    it('should limit nodes when maxNodes is set', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
        maxNodes: 2,
      });

      // Should only have 2 document nodes
      const documentNodes = result.nodes.filter((n) => n.type === 'documentNode');
      expect(documentNodes).toHaveLength(2);
    });

    it('should return correct pagination info with maxNodes', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
        maxNodes: 2,
      });

      // Total should be 4 (all markdown files), but only 2 loaded
      expect(result.totalDocuments).toBe(4);
      expect(result.loadedDocuments).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should return hasMore=false when all documents loaded', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
        maxNodes: 10, // More than total documents
      });

      expect(result.totalDocuments).toBe(4);
      expect(result.loadedDocuments).toBe(4);
      expect(result.hasMore).toBe(false);
    });

    it('should not create edges to unloaded documents', async () => {
      // Load only 1 document - readme.md links to getting-started.md
      // but getting-started.md won't be loaded, so no edge should be created
      mockReadDir.mockImplementation((path: string) => {
        if (path === '/test') {
          return Promise.resolve([
            { name: 'readme.md', isDirectory: false, path: '/test/readme.md' },
            { name: 'getting-started.md', isDirectory: false, path: '/test/getting-started.md' },
          ]);
        }
        return Promise.resolve([]);
      });

      mockReadFile.mockImplementation((path: string) => {
        if (path === '/test/readme.md') {
          return Promise.resolve('# Readme\n\nSee [[getting-started]].');
        }
        if (path === '/test/getting-started.md') {
          return Promise.resolve('# Getting Started\n\nHello.');
        }
        return Promise.resolve(null);
      });

      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
        maxNodes: 1,
      });

      // Only 1 document loaded
      expect(result.loadedDocuments).toBe(1);
      // Should have no edges (target not loaded)
      expect(result.edges).toHaveLength(0);
    });

    it('should work with offset for pagination', async () => {
      mockReadDir.mockImplementation((path: string) => {
        if (path === '/test') {
          return Promise.resolve([
            { name: 'a.md', isDirectory: false, path: '/test/a.md' },
            { name: 'b.md', isDirectory: false, path: '/test/b.md' },
            { name: 'c.md', isDirectory: false, path: '/test/c.md' },
            { name: 'd.md', isDirectory: false, path: '/test/d.md' },
          ]);
        }
        return Promise.resolve([]);
      });

      mockReadFile.mockImplementation((path: string) => {
        const name = path.split('/').pop()?.replace('.md', '').toUpperCase();
        return Promise.resolve(`# ${name}`);
      });

      mockStat.mockResolvedValue({ size: 10, createdAt: '', modifiedAt: '' });

      // Load 2 documents starting from offset 1
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
        maxNodes: 2,
        offset: 1,
      });

      expect(result.totalDocuments).toBe(4);
      expect(result.loadedDocuments).toBe(2);
      expect(result.hasMore).toBe(true);

      // Should have b.md and c.md loaded (skipped a.md)
      const nodeIds = result.nodes.map((n) => n.id);
      expect(nodeIds).toContain('doc-b.md');
      expect(nodeIds).toContain('doc-c.md');
      expect(nodeIds).not.toContain('doc-a.md');
      expect(nodeIds).not.toContain('doc-d.md');
    });

    it('should include all documents when maxNodes is not set', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      expect(result.totalDocuments).toBe(4);
      expect(result.loadedDocuments).toBe(4);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty directory', async () => {
      mockReadDir.mockResolvedValue([]);

      const result = await buildGraphData({
        rootPath: '/empty',
        includeExternalLinks: false,
      });

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
      expect(result.totalDocuments).toBe(0);
      expect(result.loadedDocuments).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle file read errors gracefully', async () => {
      mockReadDir.mockResolvedValue([
        { name: 'test.md', isDirectory: false, path: '/test/test.md' },
      ]);
      mockReadFile.mockRejectedValue(new Error('File read error'));

      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      // Should continue without crashing
      expect(result.nodes).toHaveLength(0);
    });

    it('should handle directory scan errors gracefully', async () => {
      // First call succeeds with a directory, second call (subdirectory) fails
      mockReadDir
        .mockResolvedValueOnce([
          { name: 'readme.md', isDirectory: false, path: '/test/readme.md' },
          { name: 'broken', isDirectory: true, path: '/test/broken' },
        ])
        .mockRejectedValueOnce(new Error('Permission denied'));

      mockReadFile.mockResolvedValue('# Test');
      mockStat.mockResolvedValue({ size: 50, createdAt: '', modifiedAt: '' });

      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      // Should still include the readable file
      expect(result.nodes).toHaveLength(1);
    });

    it('should handle null/undefined file content', async () => {
      mockReadDir.mockResolvedValue([
        { name: 'test.md', isDirectory: false, path: '/test/test.md' },
      ]);
      mockReadFile.mockResolvedValue(null);

      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      expect(result.nodes).toHaveLength(0);
    });

    it('should set initial node positions to 0,0 for layout algorithm', async () => {
      const result = await buildGraphData({
        rootPath: '/test',
        includeExternalLinks: false,
      });

      for (const node of result.nodes) {
        expect(node.position).toEqual({ x: 0, y: 0 });
      }
    });
  });
});
