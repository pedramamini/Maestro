/**
 * Symphony Runner Service
 *
 * Orchestrates contributions using Auto Run with draft PR claiming.
 */

import path from 'path';
import { logger } from '../utils/logger';
import { execFileNoThrow } from '../utils/execFile';
// Types imported for documentation and future use
// import type { ActiveContribution, SymphonyIssue } from '../../shared/symphony-types';

const LOG_CONTEXT = '[SymphonyRunner]';

export interface SymphonyRunnerOptions {
  contributionId: string;
  repoSlug: string;
  repoUrl: string;
  issueNumber: number;
  issueTitle: string;
  documentPaths: string[];
  localPath: string;
  branchName: string;
  onProgress?: (progress: { completedDocuments: number; totalDocuments: number }) => void;
  onStatusChange?: (status: string) => void;
}

/**
 * Clone repository to local path (shallow clone for speed).
 */
async function cloneRepo(repoUrl: string, localPath: string): Promise<boolean> {
  logger.info('Cloning repository', LOG_CONTEXT, { repoUrl, localPath });
  const result = await execFileNoThrow('git', ['clone', '--depth=1', repoUrl, localPath]);
  return result.exitCode === 0;
}

/**
 * Create and checkout a new branch.
 */
async function createBranch(localPath: string, branchName: string): Promise<boolean> {
  const result = await execFileNoThrow('git', ['checkout', '-b', branchName], localPath);
  return result.exitCode === 0;
}

/**
 * Create an empty commit to enable pushing without changes.
 */
async function createEmptyCommit(localPath: string, message: string): Promise<boolean> {
  const result = await execFileNoThrow('git', ['commit', '--allow-empty', '-m', message], localPath);
  return result.exitCode === 0;
}

/**
 * Push branch to origin.
 */
async function pushBranch(localPath: string, branchName: string): Promise<boolean> {
  const result = await execFileNoThrow('git', ['push', '-u', 'origin', branchName], localPath);
  return result.exitCode === 0;
}

/**
 * Create a draft PR using GitHub CLI.
 */
async function createDraftPR(
  localPath: string,
  issueNumber: number,
  issueTitle: string
): Promise<{ success: boolean; prUrl?: string; prNumber?: number; error?: string }> {
  const title = `[WIP] Symphony: ${issueTitle}`;
  const body = `## Symphony Contribution

This draft PR was created via Maestro Symphony.

Closes #${issueNumber}

---

*Work in progress - will be updated when Auto Run completes*`;

  const result = await execFileNoThrow(
    'gh',
    ['pr', 'create', '--draft', '--title', title, '--body', body],
    localPath
  );

  if (result.exitCode !== 0) {
    return { success: false, error: `PR creation failed: ${result.stderr}` };
  }

  const prUrl = result.stdout.trim();
  const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);

  return {
    success: true,
    prUrl,
    prNumber: prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined,
  };
}

/**
 * Copy Auto Run documents from repo to local Auto Run Docs folder.
 */
async function setupAutoRunDocs(
  localPath: string,
  documentPaths: string[]
): Promise<string> {
  const autoRunPath = path.join(localPath, 'Auto Run Docs');
  await execFileNoThrow('mkdir', ['-p', autoRunPath]);

  for (const docPath of documentPaths) {
    const sourcePath = path.join(localPath, docPath);
    const destPath = path.join(autoRunPath, path.basename(docPath));
    await execFileNoThrow('cp', [sourcePath, destPath]);
  }

  return autoRunPath;
}

/**
 * Start a Symphony contribution.
 *
 * Flow:
 * 1. Clone the repository (shallow)
 * 2. Create a new branch
 * 3. Create an empty commit
 * 4. Push the branch
 * 5. Create a draft PR (claims the issue via "Closes #N")
 * 6. Set up Auto Run documents
 */
export async function startContribution(options: SymphonyRunnerOptions): Promise<{
  success: boolean;
  draftPrUrl?: string;
  draftPrNumber?: number;
  autoRunPath?: string;
  error?: string;
}> {
  const {
    repoUrl,
    localPath,
    branchName,
    issueNumber,
    issueTitle,
    documentPaths,
    onStatusChange,
  } = options;

  try {
    // 1. Clone
    onStatusChange?.('cloning');
    if (!await cloneRepo(repoUrl, localPath)) {
      return { success: false, error: 'Clone failed' };
    }

    // 2. Create branch
    onStatusChange?.('setting_up');
    if (!await createBranch(localPath, branchName)) {
      return { success: false, error: 'Branch creation failed' };
    }

    // 3. Empty commit
    const commitMessage = `[Symphony] Start contribution for #${issueNumber}`;
    if (!await createEmptyCommit(localPath, commitMessage)) {
      return { success: false, error: 'Empty commit failed' };
    }

    // 4. Push branch
    if (!await pushBranch(localPath, branchName)) {
      return { success: false, error: 'Push failed' };
    }

    // 5. Create draft PR
    const prResult = await createDraftPR(localPath, issueNumber, issueTitle);
    if (!prResult.success) {
      return { success: false, error: prResult.error };
    }

    // 6. Setup Auto Run docs
    const autoRunPath = await setupAutoRunDocs(localPath, documentPaths);

    // Ready - actual Auto Run processing happens via session
    onStatusChange?.('running');

    return {
      success: true,
      draftPrUrl: prResult.prUrl,
      draftPrNumber: prResult.prNumber,
      autoRunPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Finalize a contribution by converting draft PR to ready for review.
 */
export async function finalizeContribution(
  localPath: string,
  prNumber: number,
  issueNumber: number,
  issueTitle: string
): Promise<{ success: boolean; prUrl?: string; error?: string }> {
  // Commit all changes
  await execFileNoThrow('git', ['add', '-A'], localPath);

  const commitMessage = `[Symphony] Complete contribution for #${issueNumber}

Processed all Auto Run documents for: ${issueTitle}`;

  const commitResult = await execFileNoThrow('git', ['commit', '-m', commitMessage], localPath);
  if (commitResult.exitCode !== 0 && !commitResult.stderr.includes('nothing to commit')) {
    return { success: false, error: `Commit failed: ${commitResult.stderr}` };
  }

  // Push changes
  const pushResult = await execFileNoThrow('git', ['push'], localPath);
  if (pushResult.exitCode !== 0) {
    return { success: false, error: `Push failed: ${pushResult.stderr}` };
  }

  // Convert draft to ready for review
  const readyResult = await execFileNoThrow(
    'gh',
    ['pr', 'ready', prNumber.toString()],
    localPath
  );
  if (readyResult.exitCode !== 0) {
    return { success: false, error: `Failed to mark PR ready: ${readyResult.stderr}` };
  }

  // Update PR body with completion summary
  const body = `## Symphony Contribution

This PR was created via Maestro Symphony.

Closes #${issueNumber}

---

**Task:** ${issueTitle}

*Contributed by the Maestro Symphony community* 🎵`;

  await execFileNoThrow(
    'gh',
    ['pr', 'edit', prNumber.toString(), '--body', body],
    localPath
  );

  // Get final PR URL
  const prInfoResult = await execFileNoThrow(
    'gh',
    ['pr', 'view', prNumber.toString(), '--json', 'url', '-q', '.url'],
    localPath
  );

  return {
    success: true,
    prUrl: prInfoResult.stdout.trim(),
  };
}

/**
 * Cancel a contribution by closing the draft PR and cleaning up.
 */
export async function cancelContribution(
  localPath: string,
  prNumber: number,
  cleanup: boolean = true
): Promise<{ success: boolean; error?: string }> {
  // Close the draft PR
  const closeResult = await execFileNoThrow(
    'gh',
    ['pr', 'close', prNumber.toString(), '--delete-branch'],
    localPath
  );
  if (closeResult.exitCode !== 0) {
    logger.warn('Failed to close PR', LOG_CONTEXT, { prNumber, error: closeResult.stderr });
  }

  // Clean up local directory
  if (cleanup) {
    await execFileNoThrow('rm', ['-rf', localPath]);
  }

  return { success: true };
}
