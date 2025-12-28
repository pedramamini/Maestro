/**
 * Tests for inlineWizardDocumentGeneration.ts
 *
 * These tests verify the document parsing and iterate mode functionality.
 */

import { describe, it, expect } from 'vitest';
import {
  parseGeneratedDocuments,
  splitIntoPhases,
  sanitizeFilename,
  countTasks,
} from '../../../renderer/services/inlineWizardDocumentGeneration';

describe('inlineWizardDocumentGeneration', () => {
  describe('parseGeneratedDocuments', () => {
    it('should parse documents with standard markers', () => {
      const output = `
---BEGIN DOCUMENT---
FILENAME: Phase-01-Setup.md
CONTENT:
# Phase 01: Setup

## Tasks

- [ ] Install dependencies
- [ ] Configure project
---END DOCUMENT---
`;

      const docs = parseGeneratedDocuments(output);

      expect(docs).toHaveLength(1);
      expect(docs[0].filename).toBe('Phase-01-Setup.md');
      expect(docs[0].phase).toBe(1);
      expect(docs[0].isUpdate).toBe(false);
      expect(docs[0].content).toContain('# Phase 01: Setup');
      expect(docs[0].content).toContain('- [ ] Install dependencies');
    });

    it('should parse multiple documents', () => {
      const output = `
---BEGIN DOCUMENT---
FILENAME: Phase-01-Setup.md
CONTENT:
# Phase 01: Setup

- [ ] Task 1
---END DOCUMENT---

---BEGIN DOCUMENT---
FILENAME: Phase-02-Build.md
CONTENT:
# Phase 02: Build

- [ ] Task 2
---END DOCUMENT---
`;

      const docs = parseGeneratedDocuments(output);

      expect(docs).toHaveLength(2);
      expect(docs[0].filename).toBe('Phase-01-Setup.md');
      expect(docs[0].phase).toBe(1);
      expect(docs[1].filename).toBe('Phase-02-Build.md');
      expect(docs[1].phase).toBe(2);
    });

    it('should detect UPDATE marker for iterate mode', () => {
      const output = `
---BEGIN DOCUMENT---
FILENAME: Phase-01-Setup.md
UPDATE: true
CONTENT:
# Phase 01: Setup (Updated)

## Tasks

- [ ] Updated task 1
- [ ] New task added
---END DOCUMENT---
`;

      const docs = parseGeneratedDocuments(output);

      expect(docs).toHaveLength(1);
      expect(docs[0].filename).toBe('Phase-01-Setup.md');
      expect(docs[0].isUpdate).toBe(true);
      expect(docs[0].content).toContain('(Updated)');
    });

    it('should handle UPDATE: false explicitly', () => {
      const output = `
---BEGIN DOCUMENT---
FILENAME: Phase-03-NewFeature.md
UPDATE: false
CONTENT:
# Phase 03: New Feature

- [ ] New task
---END DOCUMENT---
`;

      const docs = parseGeneratedDocuments(output);

      expect(docs).toHaveLength(1);
      expect(docs[0].isUpdate).toBe(false);
    });

    it('should handle mixed update and new documents', () => {
      const output = `
---BEGIN DOCUMENT---
FILENAME: Phase-01-Setup.md
UPDATE: true
CONTENT:
# Phase 01: Setup (Updated)

- [ ] Updated task
---END DOCUMENT---

---BEGIN DOCUMENT---
FILENAME: Phase-03-NewFeature.md
CONTENT:
# Phase 03: New Feature

- [ ] New feature task
---END DOCUMENT---
`;

      const docs = parseGeneratedDocuments(output);

      expect(docs).toHaveLength(2);
      expect(docs[0].filename).toBe('Phase-01-Setup.md');
      expect(docs[0].isUpdate).toBe(true);
      expect(docs[0].phase).toBe(1);
      expect(docs[1].filename).toBe('Phase-03-NewFeature.md');
      expect(docs[1].isUpdate).toBe(false);
      expect(docs[1].phase).toBe(3);
    });

    it('should sort documents by phase number', () => {
      const output = `
---BEGIN DOCUMENT---
FILENAME: Phase-03-Deploy.md
CONTENT:
# Phase 03

- [ ] Task
---END DOCUMENT---

---BEGIN DOCUMENT---
FILENAME: Phase-01-Setup.md
CONTENT:
# Phase 01

- [ ] Task
---END DOCUMENT---

---BEGIN DOCUMENT---
FILENAME: Phase-02-Build.md
CONTENT:
# Phase 02

- [ ] Task
---END DOCUMENT---
`;

      const docs = parseGeneratedDocuments(output);

      expect(docs).toHaveLength(3);
      expect(docs[0].phase).toBe(1);
      expect(docs[1].phase).toBe(2);
      expect(docs[2].phase).toBe(3);
    });

    it('should handle documents without phase numbers in filename', () => {
      const output = `
---BEGIN DOCUMENT---
FILENAME: README.md
CONTENT:
# Project README

Some content here.
---END DOCUMENT---
`;

      const docs = parseGeneratedDocuments(output);

      expect(docs).toHaveLength(1);
      expect(docs[0].filename).toBe('README.md');
      expect(docs[0].phase).toBe(0);
      expect(docs[0].isUpdate).toBe(false);
    });

    it('should handle empty output', () => {
      const docs = parseGeneratedDocuments('');
      expect(docs).toHaveLength(0);
    });

    it('should handle output without document markers', () => {
      const output = 'Just some random text without markers';
      const docs = parseGeneratedDocuments(output);
      expect(docs).toHaveLength(0);
    });

    it('should handle UPDATE marker case-insensitively', () => {
      const output = `
---BEGIN DOCUMENT---
FILENAME: Phase-01-Setup.md
UPDATE: TRUE
CONTENT:
# Phase 01

- [ ] Task
---END DOCUMENT---
`;

      const docs = parseGeneratedDocuments(output);

      expect(docs).toHaveLength(1);
      expect(docs[0].isUpdate).toBe(true);
    });
  });

  describe('splitIntoPhases', () => {
    it('should split content with phase headers', () => {
      const content = `
# Phase 1: Setup

- [ ] Task 1

# Phase 2: Build

- [ ] Task 2
`;

      const docs = splitIntoPhases(content);

      expect(docs).toHaveLength(2);
      expect(docs[0].phase).toBe(1);
      expect(docs[1].phase).toBe(2);
      expect(docs[0].isUpdate).toBe(false);
      expect(docs[1].isUpdate).toBe(false);
    });

    it('should treat content without phases as Phase 1', () => {
      const content = `
# Some Document

- [ ] Task 1
- [ ] Task 2
`;

      const docs = splitIntoPhases(content);

      expect(docs).toHaveLength(1);
      expect(docs[0].filename).toBe('Phase-01-Initial-Setup.md');
      expect(docs[0].phase).toBe(1);
      expect(docs[0].isUpdate).toBe(false);
    });

    it('should handle empty content', () => {
      const docs = splitIntoPhases('');
      expect(docs).toHaveLength(0);
    });

    it('should extract description from phase header', () => {
      const content = `
# Phase 1: Project Configuration

- [ ] Configure project

# Phase 2: Core Implementation

- [ ] Implement core
`;

      const docs = splitIntoPhases(content);

      expect(docs).toHaveLength(2);
      expect(docs[0].filename).toContain('Phase-01');
      expect(docs[0].filename).toContain('Project-Configuration');
      expect(docs[1].filename).toContain('Phase-02');
      expect(docs[1].filename).toContain('Core-Implementation');
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove path separators', () => {
      expect(sanitizeFilename('path/to/file.md')).toBe('path-to-file.md');
      expect(sanitizeFilename('path\\to\\file.md')).toBe('path-to-file.md');
    });

    it('should remove directory traversal sequences', () => {
      // Path separators become dashes, .. is removed, leading dots are stripped
      expect(sanitizeFilename('../../../etc/passwd')).toBe('---etc-passwd');
      expect(sanitizeFilename('..file.md')).toBe('file.md');
    });

    it('should remove leading dots', () => {
      expect(sanitizeFilename('.hidden')).toBe('hidden');
      expect(sanitizeFilename('...file')).toBe('file');
    });

    it('should return "document" for empty result', () => {
      expect(sanitizeFilename('')).toBe('document');
      expect(sanitizeFilename('...')).toBe('document');
      // Forward slash becomes dash
      expect(sanitizeFilename('/')).toBe('-');
    });

    it('should trim whitespace', () => {
      expect(sanitizeFilename('  file.md  ')).toBe('file.md');
    });
  });

  describe('countTasks', () => {
    it('should count unchecked tasks', () => {
      const content = `
# Tasks

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3
`;
      expect(countTasks(content)).toBe(3);
    });

    it('should count checked tasks', () => {
      const content = `
# Tasks

- [x] Done task 1
- [X] Done task 2
`;
      expect(countTasks(content)).toBe(2);
    });

    it('should count mixed tasks', () => {
      const content = `
# Tasks

- [ ] Todo 1
- [x] Done 1
- [ ] Todo 2
- [X] Done 2
`;
      expect(countTasks(content)).toBe(4);
    });

    it('should return 0 for content without tasks', () => {
      const content = '# Just a heading\n\nSome text.';
      expect(countTasks(content)).toBe(0);
    });

    it('should handle empty content', () => {
      expect(countTasks('')).toBe(0);
    });
  });
});
