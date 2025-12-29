/**
 * Tests for the DocumentNode React Flow custom node component
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { DocumentNode, type DocumentNodeProps } from '../../../../renderer/components/DocumentGraph/DocumentNode';
import type { Theme } from '../../../../renderer/types';

// Mock theme for testing
const mockTheme: Theme = {
  id: 'dracula',
  name: 'Dracula',
  mode: 'dark',
  colors: {
    bgMain: '#282a36',
    bgSidebar: '#21222c',
    bgActivity: '#343746',
    border: '#44475a',
    textMain: '#f8f8f2',
    textDim: '#6272a4',
    accent: '#bd93f9',
    accentDim: 'rgba(189, 147, 249, 0.2)',
    accentText: '#ff79c6',
    accentForeground: '#282a36',
    success: '#50fa7b',
    warning: '#ffb86c',
    error: '#ff5555',
  },
};

// Helper to create node props
function createNodeProps(overrides: Partial<DocumentNodeProps['data']> = {}): DocumentNodeProps {
  return {
    id: 'test-node-1',
    type: 'documentNode',
    data: {
      nodeType: 'document',
      title: 'Test Document',
      lineCount: 100,
      wordCount: 500,
      size: '1.5 KB',
      filePath: 'test/document.md',
      theme: mockTheme,
      ...overrides,
    },
    selected: false,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    dragging: false,
  } as DocumentNodeProps;
}

// Wrapper component for React Flow context
function renderWithProvider(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

describe('DocumentNode', () => {
  describe('Basic Rendering', () => {
    it('renders the document title', () => {
      const props = createNodeProps({ title: 'My Document' });
      renderWithProvider(<DocumentNode {...props} />);

      expect(screen.getByText('My Document')).toBeInTheDocument();
    });

    it('renders line count', () => {
      const props = createNodeProps({ lineCount: 42 });
      renderWithProvider(<DocumentNode {...props} />);

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders word count', () => {
      const props = createNodeProps({ wordCount: 1234 });
      renderWithProvider(<DocumentNode {...props} />);

      expect(screen.getByText('1234')).toBeInTheDocument();
    });

    it('renders file size', () => {
      const props = createNodeProps({ size: '2.3 MB' });
      renderWithProvider(<DocumentNode {...props} />);

      expect(screen.getByText('2.3 MB')).toBeInTheDocument();
    });

    it('renders description when provided', () => {
      const props = createNodeProps({
        description: 'A brief description of the document',
      });
      renderWithProvider(<DocumentNode {...props} />);

      expect(screen.getByText('A brief description of the document')).toBeInTheDocument();
    });

    it('does not render description section when not provided', () => {
      const props = createNodeProps({ description: undefined });
      renderWithProvider(<DocumentNode {...props} />);

      // Should only have stats row, no extra text
      expect(screen.queryByText(/description/i)).not.toBeInTheDocument();
    });
  });

  describe('Title Truncation', () => {
    it('displays full title when under 40 characters', () => {
      const shortTitle = 'Short Title Here';
      const props = createNodeProps({ title: shortTitle });
      renderWithProvider(<DocumentNode {...props} />);

      expect(screen.getByText(shortTitle)).toBeInTheDocument();
    });

    it('truncates title with ellipsis when exceeding 40 characters', () => {
      const longTitle = 'This Is A Very Long Document Title That Exceeds The Maximum Allowed Length';
      const props = createNodeProps({ title: longTitle });
      renderWithProvider(<DocumentNode {...props} />);

      // Should show truncated text with ellipsis
      const truncatedElement = screen.getByText(/\.\.\./);
      expect(truncatedElement).toBeInTheDocument();
      // The full title should not appear
      expect(screen.queryByText(longTitle)).not.toBeInTheDocument();
    });

    it('truncates title at exactly 40 characters', () => {
      // Create a title that's exactly 42 chars (40 + will be truncated)
      const longTitle = 'ABCDEFGHIJ'.repeat(5); // 50 chars
      const props = createNodeProps({ title: longTitle });
      renderWithProvider(<DocumentNode {...props} />);

      // First 40 characters should be visible (trimmed) with ellipsis
      const truncatedText = 'ABCDEFGHIJ'.repeat(4) + '...'; // 40 chars + ellipsis
      expect(screen.getByText(truncatedText)).toBeInTheDocument();
    });

    it('shows full title in tooltip when title is truncated', () => {
      const longTitle = 'This Is A Very Long Document Title That Exceeds The Maximum Allowed Length';
      const filePath = 'docs/my-document.md';
      const props = createNodeProps({ title: longTitle, filePath });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      const titleAttr = nodeElement?.getAttribute('title') || '';
      // Tooltip should contain the full title
      expect(titleAttr).toContain(longTitle);
      // And the file path
      expect(titleAttr).toContain(filePath);
    });

    it('shows only file path in tooltip when title is not truncated', () => {
      const shortTitle = 'Short Title';
      const filePath = 'docs/my-document.md';
      const props = createNodeProps({ title: shortTitle, filePath });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveAttribute('title', filePath);
    });

    it('handles title exactly at max length (40 chars)', () => {
      const exactTitle = 'A'.repeat(40); // Exactly 40 chars
      const props = createNodeProps({ title: exactTitle });
      renderWithProvider(<DocumentNode {...props} />);

      // Should show full title without ellipsis
      expect(screen.getByText(exactTitle)).toBeInTheDocument();
    });

    it('preserves CSS overflow ellipsis on title element', () => {
      const props = createNodeProps({ title: 'Test Title' });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      // Find the title div (contains the title text)
      const titleElement = screen.getByText('Test Title');
      expect(titleElement).toHaveStyle({
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });
    });
  });

  describe('Description Truncation', () => {
    it('truncates long descriptions with ellipsis', () => {
      const longDescription = 'This is a very long description that exceeds the maximum allowed length and should be truncated with an ellipsis at the end';
      const props = createNodeProps({ description: longDescription });
      renderWithProvider(<DocumentNode {...props} />);

      // Should show truncated text with ellipsis
      const truncatedElement = screen.getByText(/\.\.\./);
      expect(truncatedElement).toBeInTheDocument();
      // The full text should not appear
      expect(screen.queryByText(longDescription)).not.toBeInTheDocument();
    });

    it('does not truncate short descriptions', () => {
      const shortDescription = 'Brief desc';
      const props = createNodeProps({ description: shortDescription });
      renderWithProvider(<DocumentNode {...props} />);

      expect(screen.getByText(shortDescription)).toBeInTheDocument();
    });
  });

  describe('Selection State', () => {
    it('applies different border when selected', () => {
      const props = createNodeProps();
      const selectedProps = { ...props, selected: true };

      const { container } = renderWithProvider(<DocumentNode {...selectedProps} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toBeInTheDocument();
      // Selected border should be accent color
      expect(nodeElement).toHaveStyle({ borderColor: mockTheme.colors.accent });
    });

    it('applies default border when not selected', () => {
      const props = createNodeProps();

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toBeInTheDocument();
      // Default border should be border color
      expect(nodeElement).toHaveStyle({ borderColor: mockTheme.colors.border });
    });

    it('applies thicker border when selected', () => {
      const props = createNodeProps();
      const selectedProps = { ...props, selected: true };

      const { container } = renderWithProvider(<DocumentNode {...selectedProps} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveStyle({ borderWidth: '2px' });
    });
  });

  describe('Accessibility', () => {
    it('has file path as title attribute when title is not truncated', () => {
      const props = createNodeProps({
        title: 'Short Title', // Under 40 chars
        filePath: 'docs/guide/intro.md',
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveAttribute('title', 'docs/guide/intro.md');
    });

    it('includes full title and file path in tooltip when title is truncated', () => {
      const longTitle = 'This Is A Very Long Document Title That Exceeds Maximum';
      const filePath = 'docs/guide/intro.md';
      const props = createNodeProps({
        title: longTitle,
        filePath,
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      const titleAttr = nodeElement?.getAttribute('title') || '';
      expect(titleAttr).toContain(longTitle);
      expect(titleAttr).toContain(filePath);
    });

    it('has tooltips for stat items', () => {
      const props = createNodeProps({
        lineCount: 50,
        wordCount: 200,
        size: '512 B',
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      // Check for title attributes on stat items
      expect(container.querySelector('[title="50 lines"]')).toBeInTheDocument();
      expect(container.querySelector('[title="200 words"]')).toBeInTheDocument();
      expect(container.querySelector('[title="512 B"]')).toBeInTheDocument();
    });
  });

  describe('Theme Integration', () => {
    it('uses theme background color', () => {
      const props = createNodeProps();

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveStyle({
        backgroundColor: mockTheme.colors.bgActivity,
      });
    });

    it('uses theme accent color for document icon', () => {
      const props = createNodeProps();

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      // Find the FileText icon container (lucide renders with data-lucide or class)
      // Lucide icons are rendered as SVG elements
      const svgs = container.querySelectorAll('svg');
      // First SVG should be the FileText icon
      expect(svgs.length).toBeGreaterThan(0);
      // The icon's parent should have the accent color style
      const iconContainer = svgs[0]?.parentElement;
      expect(iconContainer).toBeInTheDocument();
    });

    it('works with light theme colors', () => {
      const lightTheme: Theme = {
        id: 'github-light',
        name: 'GitHub',
        mode: 'light',
        colors: {
          bgMain: '#ffffff',
          bgSidebar: '#f6f8fa',
          bgActivity: '#eff2f5',
          border: '#d0d7de',
          textMain: '#24292f',
          textDim: '#57606a',
          accent: '#0969da',
          accentDim: 'rgba(9, 105, 218, 0.1)',
          accentText: '#0969da',
          accentForeground: '#ffffff',
          success: '#1a7f37',
          warning: '#9a6700',
          error: '#cf222e',
        },
      };

      const props = createNodeProps({ theme: lightTheme });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveStyle({
        backgroundColor: lightTheme.colors.bgActivity,
      });
    });
  });

  describe('React Flow Integration', () => {
    it('renders input handle at top', () => {
      const props = createNodeProps();

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const handles = container.querySelectorAll('.react-flow__handle');
      expect(handles.length).toBe(2);

      // Find the target (input) handle
      const targetHandle = container.querySelector('.react-flow__handle-top');
      expect(targetHandle).toBeInTheDocument();
    });

    it('renders output handle at bottom', () => {
      const props = createNodeProps();

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      // Find the source (output) handle
      const sourceHandle = container.querySelector('.react-flow__handle-bottom');
      expect(sourceHandle).toBeInTheDocument();
    });
  });

  describe('Search/Filter Dimming', () => {
    it('renders with full opacity when search is not active', () => {
      const props = createNodeProps({
        searchActive: false,
        searchMatch: true,
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveStyle({
        opacity: '1',
        filter: 'none',
      });
    });

    it('renders with full opacity when search is active and node matches', () => {
      const props = createNodeProps({
        searchActive: true,
        searchMatch: true,
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveStyle({
        opacity: '1',
        filter: 'none',
      });
    });

    it('renders with reduced opacity when search is active and node does not match', () => {
      const props = createNodeProps({
        searchActive: true,
        searchMatch: false,
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveStyle({
        opacity: '0.35',
        filter: 'grayscale(50%)',
      });
    });

    it('renders with full opacity when searchActive/searchMatch are undefined', () => {
      const props = createNodeProps();
      // Don't set searchActive or searchMatch - should default to full opacity

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveStyle({
        opacity: '1',
        filter: 'none',
      });
    });
  });

  describe('Search Highlighting', () => {
    it('applies accent border color when search is active and node matches', () => {
      const props = createNodeProps({
        searchActive: true,
        searchMatch: true,
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveStyle({
        borderColor: mockTheme.colors.accent,
        borderWidth: '2px',
      });
    });

    it('applies highlight glow box-shadow when search is active and node matches', () => {
      const props = createNodeProps({
        searchActive: true,
        searchMatch: true,
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      const style = nodeElement?.getAttribute('style') || '';
      // Should have a box-shadow with the accent color for the glow effect
      expect(style).toContain('box-shadow');
      expect(style).toContain(mockTheme.colors.accent.replace('#', ''));
    });

    it('adds search-highlight class when search is active and node matches', () => {
      const props = createNodeProps({
        searchActive: true,
        searchMatch: true,
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).toHaveClass('search-highlight');
    });

    it('does not add search-highlight class when search is not active', () => {
      const props = createNodeProps({
        searchActive: false,
        searchMatch: true,
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).not.toHaveClass('search-highlight');
    });

    it('does not add search-highlight class when node does not match', () => {
      const props = createNodeProps({
        searchActive: true,
        searchMatch: false,
      });

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      expect(nodeElement).not.toHaveClass('search-highlight');
    });

    it('prioritizes highlight border over selection border when both apply', () => {
      const props = createNodeProps({
        searchActive: true,
        searchMatch: true,
      });
      const selectedProps = { ...props, selected: true };

      const { container } = renderWithProvider(<DocumentNode {...selectedProps} />);

      const nodeElement = container.querySelector('.document-node');
      // Both highlight and selection would have accent border - should still be accent
      expect(nodeElement).toHaveStyle({
        borderColor: mockTheme.colors.accent,
        borderWidth: '2px',
      });
      // Should still have the search-highlight class for animation
      expect(nodeElement).toHaveClass('search-highlight');
    });

    it('does not apply highlight styling when searchActive/searchMatch are undefined', () => {
      const props = createNodeProps();

      const { container } = renderWithProvider(<DocumentNode {...props} />);

      const nodeElement = container.querySelector('.document-node');
      // Should use default border color, not accent
      expect(nodeElement).toHaveStyle({
        borderColor: mockTheme.colors.border,
      });
      expect(nodeElement).not.toHaveClass('search-highlight');
    });
  });
});
