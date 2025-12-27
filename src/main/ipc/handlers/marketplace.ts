/**
 * Marketplace IPC Handlers
 *
 * Provides handlers for fetching, caching, and importing playbooks from
 * the Maestro Playbooks marketplace (GitHub repository).
 *
 * Cache Strategy:
 * - Manifest is cached locally with 6-hour TTL
 * - Individual documents are fetched on-demand (not cached)
 * - Force refresh bypasses cache and fetches fresh data
 */

import { ipcMain, App } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { createIpcHandler, CreateHandlerOptions } from '../../utils/ipcHandler';
import type {
  MarketplaceManifest,
  MarketplaceCache,
} from '../../../shared/marketplace-types';
import {
  MarketplaceFetchError,
  MarketplaceImportError,
} from '../../../shared/marketplace-types';

// ============================================================================
// Constants
// ============================================================================

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/pedramamini/Maestro-Playbooks/main';
const MANIFEST_URL = `${GITHUB_RAW_BASE}/manifest.json`;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const LOG_CONTEXT = '[Marketplace]';

// ============================================================================
// Dependencies Interface
// ============================================================================

export interface MarketplaceHandlerDependencies {
  app: App;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the path to the marketplace cache file.
 */
function getCacheFilePath(app: App): string {
  return path.join(app.getPath('userData'), 'marketplace-cache.json');
}

/**
 * Read the marketplace cache from disk.
 * Returns null if cache doesn't exist or is invalid.
 */
async function readCache(app: App): Promise<MarketplaceCache | null> {
  const cachePath = getCacheFilePath(app);

  try {
    const content = await fs.readFile(cachePath, 'utf-8');
    const data = JSON.parse(content);

    // Validate cache structure
    if (
      typeof data.fetchedAt !== 'number' ||
      !data.manifest ||
      !Array.isArray(data.manifest.playbooks)
    ) {
      logger.warn('Invalid cache structure, ignoring', LOG_CONTEXT);
      return null;
    }

    return data as MarketplaceCache;
  } catch (error) {
    // File doesn't exist or is invalid JSON
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.debug('Cache read error (non-ENOENT)', LOG_CONTEXT, { error });
    }
    return null;
  }
}

/**
 * Write the marketplace cache to disk.
 */
async function writeCache(app: App, manifest: MarketplaceManifest): Promise<void> {
  const cachePath = getCacheFilePath(app);

  try {
    const cache: MarketplaceCache = {
      fetchedAt: Date.now(),
      manifest,
    };

    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    logger.debug('Cache written successfully', LOG_CONTEXT);
  } catch (error) {
    logger.warn('Failed to write cache', LOG_CONTEXT, { error });
    // Don't throw - cache write failure shouldn't fail the operation
  }
}

/**
 * Check if the cache is still valid (within TTL).
 */
function isCacheValid(cache: MarketplaceCache): boolean {
  const age = Date.now() - cache.fetchedAt;
  return age < CACHE_TTL_MS;
}

/**
 * Fetch the manifest from GitHub.
 */
async function fetchManifest(): Promise<MarketplaceManifest> {
  logger.info('Fetching manifest from GitHub', LOG_CONTEXT);

  try {
    const response = await fetch(MANIFEST_URL);

    if (!response.ok) {
      throw new MarketplaceFetchError(
        `Failed to fetch manifest: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as { playbooks?: unknown[] };

    // Validate manifest structure
    if (!data.playbooks || !Array.isArray(data.playbooks)) {
      throw new MarketplaceFetchError('Invalid manifest structure: missing playbooks array');
    }

    logger.info(`Fetched manifest with ${data.playbooks.length} playbooks`, LOG_CONTEXT);
    return data as unknown as MarketplaceManifest;
  } catch (error) {
    if (error instanceof MarketplaceFetchError) {
      throw error;
    }
    throw new MarketplaceFetchError(
      `Network error fetching manifest: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Fetch a document from GitHub.
 */
async function fetchDocument(playbookPath: string, filename: string): Promise<string> {
  const url = `${GITHUB_RAW_BASE}/${playbookPath}/${filename}.md`;
  logger.debug(`Fetching document: ${url}`, LOG_CONTEXT);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new MarketplaceFetchError(`Document not found: ${filename}`, { status: 404 });
      }
      throw new MarketplaceFetchError(
        `Failed to fetch document: ${response.status} ${response.statusText}`
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof MarketplaceFetchError) {
      throw error;
    }
    throw new MarketplaceFetchError(
      `Network error fetching document: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Fetch README from GitHub.
 */
async function fetchReadme(playbookPath: string): Promise<string | null> {
  const url = `${GITHUB_RAW_BASE}/${playbookPath}/README.md`;
  logger.debug(`Fetching README: ${url}`, LOG_CONTEXT);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null; // README is optional
      }
      throw new MarketplaceFetchError(
        `Failed to fetch README: ${response.status} ${response.statusText}`
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof MarketplaceFetchError) {
      throw error;
    }
    // README fetch failures are non-fatal, return null
    logger.debug(`README fetch failed (non-fatal): ${error}`, LOG_CONTEXT);
    return null;
  }
}

/**
 * Helper to create handler options with consistent context.
 */
const handlerOpts = (operation: string, logSuccess = true): CreateHandlerOptions => ({
  context: LOG_CONTEXT,
  operation,
  logSuccess,
});

// ============================================================================
// Handler Registration
// ============================================================================

/**
 * Register all Marketplace-related IPC handlers.
 */
export function registerMarketplaceHandlers(deps: MarketplaceHandlerDependencies): void {
  const { app } = deps;

  // -------------------------------------------------------------------------
  // marketplace:getManifest - Get manifest (from cache if valid, else fetch)
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'marketplace:getManifest',
    createIpcHandler(handlerOpts('getManifest'), async () => {
      // Try to read from cache first
      const cache = await readCache(app);

      if (cache && isCacheValid(cache)) {
        const cacheAge = Date.now() - cache.fetchedAt;
        logger.debug(`Serving manifest from cache (age: ${Math.round(cacheAge / 1000)}s)`, LOG_CONTEXT);
        return {
          manifest: cache.manifest,
          fromCache: true,
          cacheAge,
        };
      }

      // Cache miss or expired - fetch fresh data
      const manifest = await fetchManifest();
      await writeCache(app, manifest);

      return {
        manifest,
        fromCache: false,
      };
    })
  );

  // -------------------------------------------------------------------------
  // marketplace:refreshManifest - Force refresh (bypass cache)
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'marketplace:refreshManifest',
    createIpcHandler(handlerOpts('refreshManifest'), async () => {
      logger.info('Force refreshing manifest (bypass cache)', LOG_CONTEXT);

      const manifest = await fetchManifest();
      await writeCache(app, manifest);

      return {
        manifest,
        fromCache: false,
      };
    })
  );

  // -------------------------------------------------------------------------
  // marketplace:getDocument - Fetch a single document
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'marketplace:getDocument',
    createIpcHandler(
      handlerOpts('getDocument'),
      async (playbookPath: string, filename: string) => {
        const content = await fetchDocument(playbookPath, filename);
        return { content };
      }
    )
  );

  // -------------------------------------------------------------------------
  // marketplace:getReadme - Fetch README for a playbook
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'marketplace:getReadme',
    createIpcHandler(
      handlerOpts('getReadme'),
      async (playbookPath: string) => {
        const content = await fetchReadme(playbookPath);
        return { content };
      }
    )
  );

  // -------------------------------------------------------------------------
  // marketplace:importPlaybook - Import a playbook to local Auto Run folder
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'marketplace:importPlaybook',
    createIpcHandler(
      handlerOpts('importPlaybook'),
      async (
        playbookId: string,
        targetFolderName: string,
        autoRunFolderPath: string,
        sessionId: string
      ) => {
        logger.info(`Importing playbook "${playbookId}" to "${targetFolderName}"`, LOG_CONTEXT);

        // Get the manifest to find the playbook
        const cache = await readCache(app);
        let manifest: MarketplaceManifest;

        if (cache && isCacheValid(cache)) {
          manifest = cache.manifest;
        } else {
          manifest = await fetchManifest();
          await writeCache(app, manifest);
        }

        // Find the playbook
        const marketplacePlaybook = manifest.playbooks.find((p) => p.id === playbookId);
        if (!marketplacePlaybook) {
          throw new MarketplaceImportError(`Playbook not found: ${playbookId}`);
        }

        // Create target folder
        const targetPath = path.join(autoRunFolderPath, targetFolderName);
        await fs.mkdir(targetPath, { recursive: true });

        // Fetch and write all documents
        const importedDocs: string[] = [];
        for (const doc of marketplacePlaybook.documents) {
          try {
            const content = await fetchDocument(marketplacePlaybook.path, doc.filename);
            const docPath = path.join(targetPath, `${doc.filename}.md`);
            await fs.writeFile(docPath, content, 'utf-8');
            importedDocs.push(doc.filename);
            logger.debug(`Imported document: ${doc.filename}`, LOG_CONTEXT);
          } catch (error) {
            logger.warn(`Failed to import document ${doc.filename}`, LOG_CONTEXT, { error });
            // Continue importing other documents
          }
        }

        // Create the playbook entry for local storage
        const now = Date.now();
        const newPlaybook = {
          id: crypto.randomUUID(),
          name: marketplacePlaybook.title,
          createdAt: now,
          updatedAt: now,
          documents: marketplacePlaybook.documents.map((d) => ({
            filename: d.filename,
            resetOnCompletion: d.resetOnCompletion,
          })),
          loopEnabled: marketplacePlaybook.loopEnabled,
          maxLoops: marketplacePlaybook.maxLoops,
          // Use empty string if prompt is null - BatchRunnerModal and batch processor
          // will fall back to DEFAULT_BATCH_PROMPT when prompt is empty
          prompt: marketplacePlaybook.prompt ?? '',
        };

        // Save the playbook to the session's playbooks storage
        const playbooksDir = path.join(app.getPath('userData'), 'playbooks');
        await fs.mkdir(playbooksDir, { recursive: true });

        const playbooksFilePath = path.join(playbooksDir, `${sessionId}.json`);
        let playbooks: any[] = [];

        try {
          const content = await fs.readFile(playbooksFilePath, 'utf-8');
          const data = JSON.parse(content);
          playbooks = Array.isArray(data.playbooks) ? data.playbooks : [];
        } catch {
          // File doesn't exist or is invalid, start fresh
        }

        playbooks.push(newPlaybook);
        await fs.writeFile(playbooksFilePath, JSON.stringify({ playbooks }, null, 2), 'utf-8');

        logger.info(
          `Successfully imported playbook "${marketplacePlaybook.title}" with ${importedDocs.length} documents`,
          LOG_CONTEXT
        );

        return {
          playbook: newPlaybook,
          importedDocs,
        };
      }
    )
  );

  logger.debug(`${LOG_CONTEXT} Marketplace IPC handlers registered`);
}
