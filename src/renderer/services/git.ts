/**
 * Git operations service
 * Wraps IPC calls to main process for git operations
 */

export interface GitStatus {
  files: Array<{
    path: string;
    status: string;
  }>;
  branch?: string;
}

export interface GitDiff {
  diff: string;
}

export interface GitNumstat {
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
}

/**
 * Convert a git remote URL to a browser-friendly URL
 * Supports GitHub, GitLab, Bitbucket, and other common hosts
 */
function remoteUrlToBrowserUrl(remoteUrl: string): string | null {
  if (!remoteUrl) return null;

  let url = remoteUrl.trim();

  // Handle SSH format: git@github.com:user/repo.git
  if (url.startsWith('git@')) {
    // git@github.com:user/repo.git -> https://github.com/user/repo
    url = url
      .replace(/^git@/, 'https://')
      .replace(/:([^/])/, '/$1') // Replace first : with / (but not :// from https)
      .replace(/\.git$/, '');
    return url;
  }

  // Handle HTTPS format: https://github.com/user/repo.git
  if (url.startsWith('https://') || url.startsWith('http://')) {
    url = url.replace(/\.git$/, '');
    return url;
  }

  // Handle SSH format without git@: ssh://git@github.com/user/repo.git
  if (url.startsWith('ssh://')) {
    url = url
      .replace(/^ssh:\/\/git@/, 'https://')
      .replace(/^ssh:\/\//, 'https://')
      .replace(/\.git$/, '');
    return url;
  }

  return null;
}

export const gitService = {
  /**
   * Check if a directory is a git repository
   */
  async isRepo(cwd: string): Promise<boolean> {
    try {
      const result = await window.maestro.git.isRepo(cwd);
      return result;
    } catch (error) {
      console.error('Git isRepo error:', error);
      return false;
    }
  },

  /**
   * Get git status (porcelain format) and current branch
   */
  async getStatus(cwd: string): Promise<GitStatus> {
    try {
      const [statusResult, branchResult] = await Promise.all([
        window.maestro.git.status(cwd),
        window.maestro.git.branch(cwd)
      ]);

      // Parse porcelain format output
      const files: Array<{ path: string; status: string }> = [];

      if (statusResult.stdout) {
        const lines = statusResult.stdout.trim().split('\n').filter(line => line.length > 0);

        for (const line of lines) {
          // Porcelain format: XY PATH or XY PATH -> NEWPATH (for renames)
          const status = line.substring(0, 2);
          const path = line.substring(3).split(' -> ')[0]; // Handle renames

          files.push({ path, status });
        }
      }

      // Extract branch name
      const branch = branchResult.stdout?.trim() || undefined;

      return { files, branch };
    } catch (error) {
      console.error('Git status error:', error);
      return { files: [] };
    }
  },

  /**
   * Get git diff for specific files or all changes
   */
  async getDiff(cwd: string, files?: string[]): Promise<GitDiff> {
    try {
      // If no files specified, get full diff
      if (!files || files.length === 0) {
        const result = await window.maestro.git.diff(cwd);
        return { diff: result.stdout };
      }

      // Otherwise get diff for specific files
      const result = await window.maestro.git.diff(cwd, files);
      return result;
    } catch (error) {
      console.error('Git diff error:', error);
      return { diff: '' };
    }
  },

  /**
   * Get line-level statistics for all changes
   */
  async getNumstat(cwd: string): Promise<GitNumstat> {
    try {
      const result = await window.maestro.git.numstat(cwd);

      // Parse numstat format: "additions deletions path"
      const files: Array<{ path: string; additions: number; deletions: number }> = [];

      if (result.stdout) {
        const lines = result.stdout.trim().split('\n').filter(line => line.length > 0);

        for (const line of lines) {
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
            const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10);
            const path = parts[2];

            files.push({ path, additions, deletions });
          }
        }
      }

      return { files };
    } catch (error) {
      console.error('Git numstat error:', error);
      return { files: [] };
    }
  },

  /**
   * Get the browser-friendly URL for the remote repository
   * Returns null if no remote or URL cannot be parsed
   */
  async getRemoteBrowserUrl(cwd: string): Promise<string | null> {
    try {
      const result = await window.maestro.git.remote(cwd);
      if (result.stdout) {
        return remoteUrlToBrowserUrl(result.stdout);
      }
      return null;
    } catch (error) {
      console.error('Git remote error:', error);
      return null;
    }
  },

  /**
   * Get all branches (local and remote, deduplicated)
   */
  async getBranches(cwd: string): Promise<string[]> {
    try {
      const result = await window.maestro.git.branches(cwd);
      return result.branches || [];
    } catch (error) {
      console.error('Git branches error:', error);
      return [];
    }
  },

  /**
   * Get all tags
   */
  async getTags(cwd: string): Promise<string[]> {
    try {
      const result = await window.maestro.git.tags(cwd);
      return result.tags || [];
    } catch (error) {
      console.error('Git tags error:', error);
      return [];
    }
  }
};
