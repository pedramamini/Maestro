/**
 * Symphony IPC Handlers
 *
 * Provides handlers for fetching Symphony registry, GitHub issues with
 * runmaestro.ai label, managing contributions, and coordinating contribution runs.
 *
 * Cache Strategy:
 * - Registry cached with 2-hour TTL
 * - Issues cached with 5-minute TTL (change frequently)
 * - Force refresh bypasses cache
 */

import { ipcMain, App, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import { createIpcHandler, CreateHandlerOptions } from '../../utils/ipcHandler';
import { execFileNoThrow } from '../../utils/execFile';
import {
  SYMPHONY_REGISTRY_URL,
  REGISTRY_CACHE_TTL_MS,
  ISSUES_CACHE_TTL_MS,
  SYMPHONY_STATE_PATH,
  SYMPHONY_CACHE_PATH,
  SYMPHONY_REPOS_DIR,
  BRANCH_TEMPLATE,
  GITHUB_API_BASE,
  SYMPHONY_ISSUE_LABEL,
  DOCUMENT_PATH_PATTERNS,
  DEFAULT_CONTRIBUTOR_STATS,
} from '../../../shared/symphony-constants';
import type {
  SymphonyRegistry,
  SymphonyCache,
  SymphonyState,
  SymphonyIssue,
  ActiveContribution,
  CompletedContribution,
  ContributorStats,
  ContributionStatus,
  GetRegistryResponse,
  GetIssuesResponse,
  StartContributionResponse,
  CompleteContributionResponse,
  IssueStatus,
} from '../../../shared/symphony-types';
import { SymphonyError } from '../../../shared/symphony-types';

// ============================================================================
// Constants
// ============================================================================

const LOG_CONTEXT = '[Symphony]';

// ============================================================================
// Dependencies Interface
// ============================================================================

export interface SymphonyHandlerDependencies {
  app: App;
  getMainWindow: () => BrowserWindow | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the symphony directory path.
 */
function getSymphonyDir(app: App): string {
  return path.join(app.getPath('userData'), 'symphony');
}

/**
 * Get cache file path.
 */
function getCachePath(app: App): string {
  return path.join(getSymphonyDir(app), SYMPHONY_CACHE_PATH);
}

/**
 * Get state file path.
 */
function getStatePath(app: App): string {
  return path.join(getSymphonyDir(app), SYMPHONY_STATE_PATH);
}

/**
 * Get repos directory path.
 */
function getReposDir(app: App): string {
  return path.join(getSymphonyDir(app), SYMPHONY_REPOS_DIR);
}

/**
 * Ensure symphony directory exists.
 */
async function ensureSymphonyDir(app: App): Promise<void> {
  const dir = getSymphonyDir(app);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Read cache from disk.
 */
async function readCache(app: App): Promise<SymphonyCache | null> {
  try {
    const content = await fs.readFile(getCachePath(app), 'utf-8');
    return JSON.parse(content) as SymphonyCache;
  } catch {
    return null;
  }
}

/**
 * Write cache to disk.
 */
async function writeCache(app: App, cache: SymphonyCache): Promise<void> {
  await ensureSymphonyDir(app);
  await fs.writeFile(getCachePath(app), JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Read symphony state from disk.
 */
async function readState(app: App): Promise<SymphonyState> {
  try {
    const content = await fs.readFile(getStatePath(app), 'utf-8');
    return JSON.parse(content) as SymphonyState;
  } catch {
    // Return default state
    return {
      active: [],
      history: [],
      stats: { ...DEFAULT_CONTRIBUTOR_STATS },
    };
  }
}

/**
 * Write symphony state to disk.
 */
async function writeState(app: App, state: SymphonyState): Promise<void> {
  await ensureSymphonyDir(app);
  await fs.writeFile(getStatePath(app), JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Check if cached data is still valid.
 */
function isCacheValid(fetchedAt: number, ttlMs: number): boolean {
  return Date.now() - fetchedAt < ttlMs;
}

/**
 * Generate a unique contribution ID.
 */
function generateContributionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `contrib_${timestamp}_${random}`;
}

/**
 * Generate branch name from template.
 */
function generateBranchName(issueNumber: number): string {
  const timestamp = Date.now().toString(36);
  return BRANCH_TEMPLATE
    .replace('{issue}', String(issueNumber))
    .replace('{timestamp}', timestamp);
}

/**
 * Parse document paths from issue body.
 */
function parseDocumentPaths(body: string): string[] {
  const paths: Set<string> = new Set();

  for (const pattern of DOCUMENT_PATH_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(body)) !== null) {
      const docPath = match[1];
      if (docPath && !docPath.startsWith('http')) {
        paths.add(docPath);
      }
    }
  }

  return Array.from(paths);
}

// ============================================================================
// Registry Fetching
// ============================================================================

/**
 * Fetch the symphony registry from GitHub.
 */
async function fetchRegistry(): Promise<SymphonyRegistry> {
  logger.info('Fetching Symphony registry', LOG_CONTEXT);

  try {
    const response = await fetch(SYMPHONY_REGISTRY_URL);

    if (!response.ok) {
      throw new SymphonyError(
        `Failed to fetch registry: ${response.status} ${response.statusText}`,
        'network'
      );
    }

    const data = await response.json() as SymphonyRegistry;

    if (!data.repositories || !Array.isArray(data.repositories)) {
      throw new SymphonyError('Invalid registry structure', 'parse');
    }

    logger.info(`Fetched registry with ${data.repositories.length} repos`, LOG_CONTEXT);
    return data;
  } catch (error) {
    if (error instanceof SymphonyError) throw error;
    throw new SymphonyError(
      `Network error: ${error instanceof Error ? error.message : String(error)}`,
      'network',
      error
    );
  }
}

/**
 * Fetch GitHub issues with runmaestro.ai label for a repository.
 */
async function fetchIssues(repoSlug: string): Promise<SymphonyIssue[]> {
  logger.info(`Fetching issues for ${repoSlug}`, LOG_CONTEXT);

  try {
    const url = `${GITHUB_API_BASE}/repos/${repoSlug}/issues?labels=${encodeURIComponent(SYMPHONY_ISSUE_LABEL)}&state=open`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Maestro-Symphony',
      },
    });

    if (!response.ok) {
      throw new SymphonyError(
        `Failed to fetch issues: ${response.status}`,
        'github_api'
      );
    }

    const rawIssues = await response.json() as Array<{
      number: number;
      title: string;
      body: string | null;
      url: string;
      html_url: string;
      user: { login: string };
      created_at: string;
      updated_at: string;
    }>;

    // Transform to SymphonyIssue format
    const issues: SymphonyIssue[] = rawIssues.map(issue => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      url: issue.url,
      htmlUrl: issue.html_url,
      author: issue.user.login,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      documentPaths: parseDocumentPaths(issue.body || ''),
      status: 'available' as IssueStatus, // Will be updated with PR status
    }));

    // TODO: In a future enhancement, fetch linked PRs for each issue to determine
    // the actual status. For now, mark all as available.

    logger.info(`Fetched ${issues.length} issues for ${repoSlug}`, LOG_CONTEXT);
    return issues;
  } catch (error) {
    if (error instanceof SymphonyError) throw error;
    throw new SymphonyError(
      `Failed to fetch issues: ${error instanceof Error ? error.message : String(error)}`,
      'github_api',
      error
    );
  }
}

// ============================================================================
// Git Operations (using safe execFileNoThrow utility)
// ============================================================================

/**
 * Clone a repository to a local path.
 */
async function cloneRepository(
  repoUrl: string,
  targetPath: string
): Promise<{ success: boolean; error?: string }> {
  logger.info('Cloning repository', LOG_CONTEXT, { repoUrl, targetPath });

  const result = await execFileNoThrow('git', ['clone', '--depth=1', repoUrl, targetPath]);

  if (result.exitCode !== 0) {
    return { success: false, error: result.stderr };
  }

  return { success: true };
}

/**
 * Create a new branch for contribution work.
 */
async function createBranch(
  repoPath: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  const result = await execFileNoThrow('git', ['checkout', '-b', branchName], repoPath);

  if (result.exitCode !== 0) {
    return { success: false, error: result.stderr };
  }

  return { success: true };
}

/**
 * Push branch and create draft PR using gh CLI.
 */
async function createDraftPR(
  repoPath: string,
  baseBranch: string,
  title: string,
  body: string
): Promise<{ success: boolean; prUrl?: string; prNumber?: number; error?: string }> {
  // First push the branch
  const pushResult = await execFileNoThrow('git', ['push', '-u', 'origin', 'HEAD'], repoPath);

  if (pushResult.exitCode !== 0) {
    return { success: false, error: `Failed to push: ${pushResult.stderr}` };
  }

  // Create draft PR using gh CLI
  const prResult = await execFileNoThrow(
    'gh',
    ['pr', 'create', '--draft', '--base', baseBranch, '--title', title, '--body', body],
    repoPath
  );

  if (prResult.exitCode !== 0) {
    return { success: false, error: `Failed to create PR: ${prResult.stderr}` };
  }

  // Parse PR URL from output
  const prUrl = prResult.stdout.trim();
  const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
  const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

  return { success: true, prUrl, prNumber };
}

/**
 * Mark PR as ready for review.
 */
async function markPRReady(
  repoPath: string,
  prNumber: number
): Promise<{ success: boolean; error?: string }> {
  const result = await execFileNoThrow(
    'gh',
    ['pr', 'ready', String(prNumber)],
    repoPath
  );

  if (result.exitCode !== 0) {
    return { success: false, error: result.stderr };
  }

  return { success: true };
}

// ============================================================================
// Real-time Updates
// ============================================================================

/**
 * Broadcast symphony state updates to renderer.
 */
function broadcastSymphonyUpdate(getMainWindow: () => BrowserWindow | null): void {
  const mainWindow = getMainWindow?.();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('symphony:updated');
  }
}

// ============================================================================
// Handler Options Helper
// ============================================================================

const handlerOpts = (operation: string, logSuccess = true): CreateHandlerOptions => ({
  context: LOG_CONTEXT,
  operation,
  logSuccess,
});

// ============================================================================
// IPC Handler Registration
// ============================================================================

export function registerSymphonyHandlers({ app, getMainWindow }: SymphonyHandlerDependencies): void {
  // ─────────────────────────────────────────────────────────────────────────
  // Registry Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the symphony registry (with caching).
   */
  ipcMain.handle(
    'symphony:getRegistry',
    createIpcHandler(
      handlerOpts('getRegistry'),
      async (forceRefresh?: boolean): Promise<Omit<GetRegistryResponse, 'success'>> => {
        const cache = await readCache(app);

        // Check cache validity
        if (!forceRefresh && cache?.registry && isCacheValid(cache.registry.fetchedAt, REGISTRY_CACHE_TTL_MS)) {
          return {
            registry: cache.registry.data,
            fromCache: true,
            cacheAge: Date.now() - cache.registry.fetchedAt,
          };
        }

        // Fetch fresh data
        const registry = await fetchRegistry();

        // Update cache
        const newCache: SymphonyCache = {
          ...cache,
          registry: {
            data: registry,
            fetchedAt: Date.now(),
          },
          issues: cache?.issues ?? {},
        };
        await writeCache(app, newCache);

        return {
          registry,
          fromCache: false,
        };
      }
    )
  );

  /**
   * Get issues for a repository (with caching).
   */
  ipcMain.handle(
    'symphony:getIssues',
    createIpcHandler(
      handlerOpts('getIssues'),
      async (repoSlug: string, forceRefresh?: boolean): Promise<Omit<GetIssuesResponse, 'success'>> => {
        const cache = await readCache(app);

        // Check cache
        const cached = cache?.issues?.[repoSlug];
        if (!forceRefresh && cached && isCacheValid(cached.fetchedAt, ISSUES_CACHE_TTL_MS)) {
          return {
            issues: cached.data,
            fromCache: true,
            cacheAge: Date.now() - cached.fetchedAt,
          };
        }

        // Fetch fresh
        const issues = await fetchIssues(repoSlug);

        // Update cache
        const newCache: SymphonyCache = {
          ...cache,
          registry: cache?.registry,
          issues: {
            ...cache?.issues,
            [repoSlug]: {
              data: issues,
              fetchedAt: Date.now(),
            },
          },
        };
        await writeCache(app, newCache);

        return {
          issues,
          fromCache: false,
        };
      }
    )
  );

  // ─────────────────────────────────────────────────────────────────────────
  // State Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get current symphony state.
   */
  ipcMain.handle(
    'symphony:getState',
    createIpcHandler(
      handlerOpts('getState', false),
      async (): Promise<{ state: SymphonyState }> => {
        const state = await readState(app);
        return { state };
      }
    )
  );

  /**
   * Get active contributions.
   */
  ipcMain.handle(
    'symphony:getActive',
    createIpcHandler(
      handlerOpts('getActive', false),
      async (): Promise<{ contributions: ActiveContribution[] }> => {
        const state = await readState(app);
        return { contributions: state.active };
      }
    )
  );

  /**
   * Get completed contributions.
   */
  ipcMain.handle(
    'symphony:getCompleted',
    createIpcHandler(
      handlerOpts('getCompleted', false),
      async (limit?: number): Promise<{ contributions: CompletedContribution[] }> => {
        const state = await readState(app);
        const sorted = [...state.history].sort(
          (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
        );
        return {
          contributions: limit ? sorted.slice(0, limit) : sorted,
        };
      }
    )
  );

  /**
   * Get contributor statistics.
   */
  ipcMain.handle(
    'symphony:getStats',
    createIpcHandler(
      handlerOpts('getStats', false),
      async (): Promise<{ stats: ContributorStats }> => {
        const state = await readState(app);
        return { stats: state.stats };
      }
    )
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Contribution Lifecycle Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start a new contribution.
   */
  ipcMain.handle(
    'symphony:start',
    createIpcHandler(
      handlerOpts('start'),
      async (params: {
        repoSlug: string;
        repoUrl: string;
        repoName: string;
        issueNumber: number;
        issueTitle: string;
        documentPaths: string[];
        agentType: string;
        sessionId: string;
        baseBranch?: string;
      }): Promise<Omit<StartContributionResponse, 'success'>> => {
        const {
          repoSlug,
          repoUrl,
          repoName,
          issueNumber,
          issueTitle,
          documentPaths,
          agentType,
          sessionId,
          baseBranch = 'main',
        } = params;

        const contributionId = generateContributionId();
        const state = await readState(app);

        // Check if already working on this issue
        const existing = state.active.find(
          c => c.repoSlug === repoSlug && c.issueNumber === issueNumber
        );
        if (existing) {
          return {
            error: `Already working on this issue (contribution: ${existing.id})`,
          };
        }

        // Determine local path
        const reposDir = getReposDir(app);
        await fs.mkdir(reposDir, { recursive: true });
        const localPath = path.join(reposDir, `${repoName}-${contributionId}`);

        // Generate branch name
        const branchName = generateBranchName(issueNumber);

        // Clone repository
        const cloneResult = await cloneRepository(repoUrl, localPath);
        if (!cloneResult.success) {
          return { error: `Clone failed: ${cloneResult.error}` };
        }

        // Create branch
        const branchResult = await createBranch(localPath, branchName);
        if (!branchResult.success) {
          // Cleanup
          await fs.rm(localPath, { recursive: true, force: true }).catch(() => {});
          return { error: `Branch creation failed: ${branchResult.error}` };
        }

        // Create draft PR to claim the issue
        const prTitle = `[WIP] Symphony: ${issueTitle} (#${issueNumber})`;
        const prBody = `## Maestro Symphony Contribution

Working on #${issueNumber} via [Maestro Symphony](https://runmaestro.ai).

**Status:** In Progress
**Started:** ${new Date().toISOString()}

---

This PR will be updated automatically when the Auto Run completes.`;

        const prResult = await createDraftPR(localPath, baseBranch, prTitle, prBody);
        if (!prResult.success) {
          // Cleanup
          await fs.rm(localPath, { recursive: true, force: true }).catch(() => {});
          return { error: `PR creation failed: ${prResult.error}` };
        }

        // Create active contribution entry
        const contribution: ActiveContribution = {
          id: contributionId,
          repoSlug,
          repoName,
          issueNumber,
          issueTitle,
          localPath,
          branchName,
          draftPrNumber: prResult.prNumber!,
          draftPrUrl: prResult.prUrl!,
          startedAt: new Date().toISOString(),
          status: 'running',
          progress: {
            totalDocuments: documentPaths.length,
            completedDocuments: 0,
            totalTasks: 0,
            completedTasks: 0,
          },
          tokenUsage: {
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: 0,
          },
          timeSpent: 0,
          sessionId,
          agentType,
        };

        // Save state
        state.active.push(contribution);
        await writeState(app, state);

        logger.info('Contribution started', LOG_CONTEXT, {
          contributionId,
          repoSlug,
          issueNumber,
          prNumber: prResult.prNumber,
        });

        broadcastSymphonyUpdate(getMainWindow);

        return {
          contributionId,
          draftPrUrl: prResult.prUrl,
          draftPrNumber: prResult.prNumber,
        };
      }
    )
  );

  /**
   * Update contribution status.
   */
  ipcMain.handle(
    'symphony:updateStatus',
    createIpcHandler(
      handlerOpts('updateStatus', false),
      async (params: {
        contributionId: string;
        status?: ContributionStatus;
        progress?: Partial<ActiveContribution['progress']>;
        tokenUsage?: Partial<ActiveContribution['tokenUsage']>;
        timeSpent?: number;
        error?: string;
      }): Promise<{ updated: boolean }> => {
        const { contributionId, status, progress, tokenUsage, timeSpent, error } = params;
        const state = await readState(app);
        const contribution = state.active.find(c => c.id === contributionId);

        if (!contribution) {
          return { updated: false };
        }

        if (status) contribution.status = status;
        if (progress) contribution.progress = { ...contribution.progress, ...progress };
        if (tokenUsage) contribution.tokenUsage = { ...contribution.tokenUsage, ...tokenUsage };
        if (timeSpent !== undefined) contribution.timeSpent = timeSpent;
        if (error) contribution.error = error;

        await writeState(app, state);
        broadcastSymphonyUpdate(getMainWindow);
        return { updated: true };
      }
    )
  );

  /**
   * Complete a contribution (mark PR as ready).
   */
  ipcMain.handle(
    'symphony:complete',
    createIpcHandler(
      handlerOpts('complete'),
      async (params: {
        contributionId: string;
        prBody?: string;
      }): Promise<Omit<CompleteContributionResponse, 'success'>> => {
        const { contributionId } = params;
        const state = await readState(app);
        const contributionIndex = state.active.findIndex(c => c.id === contributionId);

        if (contributionIndex === -1) {
          return { error: 'Contribution not found' };
        }

        const contribution = state.active[contributionIndex];
        contribution.status = 'completing';
        await writeState(app, state);

        // Mark PR as ready
        const readyResult = await markPRReady(contribution.localPath, contribution.draftPrNumber);
        if (!readyResult.success) {
          contribution.status = 'failed';
          contribution.error = readyResult.error;
          await writeState(app, state);
          return { error: readyResult.error };
        }

        // Move to completed
        const completed: CompletedContribution = {
          id: contribution.id,
          repoSlug: contribution.repoSlug,
          repoName: contribution.repoName,
          issueNumber: contribution.issueNumber,
          issueTitle: contribution.issueTitle,
          startedAt: contribution.startedAt,
          completedAt: new Date().toISOString(),
          prUrl: contribution.draftPrUrl,
          prNumber: contribution.draftPrNumber,
          tokenUsage: {
            inputTokens: contribution.tokenUsage.inputTokens,
            outputTokens: contribution.tokenUsage.outputTokens,
            totalCost: contribution.tokenUsage.estimatedCost,
          },
          timeSpent: contribution.timeSpent,
          documentsProcessed: contribution.progress.completedDocuments,
          tasksCompleted: contribution.progress.completedTasks,
        };

        // Update state
        state.active.splice(contributionIndex, 1);
        state.history.push(completed);

        // Update stats
        state.stats.totalContributions += 1;
        state.stats.totalDocumentsProcessed += completed.documentsProcessed;
        state.stats.totalTasksCompleted += completed.tasksCompleted;
        state.stats.totalTokensUsed += completed.tokenUsage.inputTokens + completed.tokenUsage.outputTokens;
        state.stats.totalTimeSpent += completed.timeSpent;
        state.stats.estimatedCostDonated += completed.tokenUsage.totalCost;

        if (!state.stats.repositoriesContributed.includes(contribution.repoSlug)) {
          state.stats.repositoriesContributed.push(contribution.repoSlug);
        }

        state.stats.lastContributionAt = completed.completedAt;
        if (!state.stats.firstContributionAt) {
          state.stats.firstContributionAt = completed.completedAt;
        }

        // Update streak (simplified - just check if last contribution was yesterday or today)
        const today = new Date().toDateString();
        const lastDate = state.stats.lastContributionDate;
        if (lastDate) {
          const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
          if (lastDate === yesterday || lastDate === today) {
            state.stats.currentStreak += 1;
          } else {
            state.stats.currentStreak = 1;
          }
        } else {
          state.stats.currentStreak = 1;
        }
        state.stats.lastContributionDate = today;
        if (state.stats.currentStreak > state.stats.longestStreak) {
          state.stats.longestStreak = state.stats.currentStreak;
        }

        await writeState(app, state);

        logger.info('Contribution completed', LOG_CONTEXT, {
          contributionId,
          prUrl: completed.prUrl,
        });

        broadcastSymphonyUpdate(getMainWindow);

        return {
          prUrl: completed.prUrl,
          prNumber: completed.prNumber,
        };
      }
    )
  );

  /**
   * Cancel an active contribution.
   */
  ipcMain.handle(
    'symphony:cancel',
    createIpcHandler(
      handlerOpts('cancel'),
      async (contributionId: string, cleanup?: boolean): Promise<{ cancelled: boolean }> => {
        const state = await readState(app);
        const index = state.active.findIndex(c => c.id === contributionId);

        if (index === -1) {
          return { cancelled: false };
        }

        const contribution = state.active[index];

        // Optionally cleanup local files
        if (cleanup && contribution.localPath) {
          try {
            await fs.rm(contribution.localPath, { recursive: true, force: true });
          } catch (e) {
            logger.warn('Failed to cleanup contribution directory', LOG_CONTEXT, { error: e });
          }
        }

        // Remove from active
        state.active.splice(index, 1);
        await writeState(app, state);

        logger.info('Contribution cancelled', LOG_CONTEXT, { contributionId });

        broadcastSymphonyUpdate(getMainWindow);

        return { cancelled: true };
      }
    )
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Cache Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Clear cache.
   */
  ipcMain.handle(
    'symphony:clearCache',
    createIpcHandler(
      handlerOpts('clearCache'),
      async (): Promise<{ cleared: boolean }> => {
        await writeCache(app, { issues: {} });
        return { cleared: true };
      }
    )
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Session Creation Workflow (App.tsx integration)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Clone a repository for a new Symphony session.
   * This is a simpler version of the start handler for the session creation flow.
   */
  ipcMain.handle(
    'symphony:cloneRepo',
    createIpcHandler(
      handlerOpts('cloneRepo'),
      async (params: { repoUrl: string; localPath: string }): Promise<{ success: boolean; error?: string }> => {
        const { repoUrl, localPath } = params;

        // Ensure parent directory exists
        const parentDir = path.dirname(localPath);
        await fs.mkdir(parentDir, { recursive: true });

        // Clone with depth=1 for speed
        const result = await cloneRepository(repoUrl, localPath);
        if (!result.success) {
          return { success: false, error: `Clone failed: ${result.error}` };
        }

        logger.info('Repository cloned for Symphony session', LOG_CONTEXT, { localPath });
        return { success: true };
      }
    )
  );

  /**
   * Start the contribution workflow after session is created.
   * Creates branch, empty commit, pushes, and creates draft PR.
   */
  ipcMain.handle(
    'symphony:startContribution',
    createIpcHandler(
      handlerOpts('startContribution'),
      async (params: {
        contributionId: string;
        sessionId: string;
        repoSlug: string;
        issueNumber: number;
        issueTitle: string;
        localPath: string;
        documentPaths: string[];
      }): Promise<{
        success: boolean;
        branchName?: string;
        draftPrNumber?: number;
        draftPrUrl?: string;
        autoRunPath?: string;
        error?: string;
      }> => {
        const { contributionId, sessionId, repoSlug: _repoSlug, issueNumber, issueTitle, localPath, documentPaths } = params;

        try {
          // 1. Create branch
          const branchName = generateBranchName(issueNumber);
          const branchResult = await createBranch(localPath, branchName);
          if (!branchResult.success) {
            return { success: false, error: 'Failed to create branch' };
          }

          // 2. Empty commit to enable push
          const commitMessage = `[Symphony] Start contribution for #${issueNumber}`;
          await execFileNoThrow('git', ['commit', '--allow-empty', '-m', commitMessage], localPath);

          // 3. Push branch
          const pushResult = await execFileNoThrow('git', ['push', '-u', 'origin', branchName], localPath);
          if (pushResult.exitCode !== 0) {
            return { success: false, error: 'Failed to push branch' };
          }

          // 4. Create draft PR
          const prTitle = `[WIP] Symphony: ${issueTitle}`;
          const prBody = `## Symphony Contribution\n\nCloses #${issueNumber}\n\n*Work in progress via Maestro Symphony*`;
          const prResult = await execFileNoThrow(
            'gh',
            ['pr', 'create', '--draft', '--title', prTitle, '--body', prBody],
            localPath
          );
          if (prResult.exitCode !== 0) {
            return { success: false, error: 'Failed to create draft PR' };
          }

          const prUrl = prResult.stdout.trim();
          const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
          const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : 0;

          // 5. Copy Auto Run documents to local folder
          const autoRunDir = path.join(localPath, 'Auto Run Docs');
          await fs.mkdir(autoRunDir, { recursive: true });

          for (const docPath of documentPaths) {
            const sourcePath = path.join(localPath, docPath);
            const destPath = path.join(autoRunDir, path.basename(docPath));
            try {
              await fs.copyFile(sourcePath, destPath);
            } catch (e) {
              logger.warn('Failed to copy document', LOG_CONTEXT, { docPath, error: e });
            }
          }

          // 6. Broadcast status update
          const mainWindow = getMainWindow?.();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('symphony:contributionStarted', {
              contributionId,
              sessionId,
              branchName,
              draftPrNumber: prNumber,
              draftPrUrl: prUrl,
              autoRunPath: autoRunDir,
            });
          }

          logger.info('Symphony contribution started', LOG_CONTEXT, {
            contributionId,
            sessionId,
            prNumber,
            documentCount: documentPaths.length,
          });

          return {
            success: true,
            branchName,
            draftPrNumber: prNumber,
            draftPrUrl: prUrl,
            autoRunPath: autoRunDir,
          };
        } catch (error) {
          logger.error('Symphony contribution failed', LOG_CONTEXT, { error });
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }
    )
  );

  logger.info('Symphony handlers registered', LOG_CONTEXT);
}
