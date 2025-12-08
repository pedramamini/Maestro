import React, { useState, useEffect, useRef } from 'react';
import { GitBranch, Plus, Minus, FileEdit } from 'lucide-react';
import type { Theme } from '../types';
import { gitService } from '../services/git';

interface GitFileChange {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  modified?: boolean;
}

interface GitStatusWidgetProps {
  cwd: string;
  isGitRepo: boolean;
  theme: Theme;
  onViewDiff: () => void;
}

export function GitStatusWidget({ cwd, isGitRepo, theme, onViewDiff }: GitStatusWidgetProps) {
  const [fileChanges, setFileChanges] = useState<GitFileChange[]>([]);
  const [additions, setAdditions] = useState(0);
  const [deletions, setDeletions] = useState(0);
  const [modified, setModified] = useState(0);
  const [loading, setLoading] = useState(false);
  // Tooltip hover state with timeout for smooth UX
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeout.current) {
        clearTimeout(tooltipTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isGitRepo) {
      setFileChanges([]);
      setAdditions(0);
      setDeletions(0);
      setModified(0);
      return;
    }

    const loadGitStatus = async () => {
      setLoading(true);
      try {
        const [status, numstat] = await Promise.all([
          gitService.getStatus(cwd),
          gitService.getNumstat(cwd)
        ]);

        // Create a map of path -> numstat data
        const numstatMap = new Map<string, { additions: number; deletions: number }>();
        numstat.files.forEach(file => {
          numstatMap.set(file.path, { additions: file.additions, deletions: file.deletions });
        });

        // Parse porcelain format and merge with numstat
        const changes: GitFileChange[] = [];
        let totalAdds = 0;
        let totalDels = 0;
        let totalMods = 0;

        status.files.forEach(file => {
          const statusCode = file.status.trim();
          const indexStatus = statusCode[0];
          const workingStatus = statusCode[1] || ' ';
          const stats = numstatMap.get(file.path) || { additions: 0, deletions: 0 };

          const change: GitFileChange = {
            path: file.path,
            status: statusCode,
            additions: stats.additions,
            deletions: stats.deletions,
            modified: false
          };

          // Accumulate totals
          totalAdds += stats.additions;
          totalDels += stats.deletions;

          // Check for modifications
          if (indexStatus === 'M' || workingStatus === 'M' || indexStatus === 'R' || workingStatus === 'R') {
            change.modified = true;
            totalMods++;
          }

          // Count additions and deletions for the summary
          if (indexStatus === 'A' || indexStatus === '?' || workingStatus === 'A' || workingStatus === '?') {
            // New file
          }

          if (indexStatus === 'D' || workingStatus === 'D') {
            // Deleted file
          }

          changes.push(change);
        });

        setFileChanges(changes);
        setAdditions(totalAdds);
        setDeletions(totalDels);
        setModified(totalMods);
      } catch (error) {
        console.error('Failed to load git status:', error);
      } finally {
        setLoading(false);
      }
    };

    loadGitStatus();

    // Refresh every 5 seconds
    const interval = setInterval(loadGitStatus, 5000);
    return () => clearInterval(interval);
  }, [cwd, isGitRepo]);

  // Don't render if not a git repo or no changes
  if (!isGitRepo || fileChanges.length === 0) {
    return null;
  }

  const totalChanges = additions + deletions + modified;

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        // Clear any pending close timeout
        if (tooltipTimeout.current) {
          clearTimeout(tooltipTimeout.current);
          tooltipTimeout.current = null;
        }
        setTooltipOpen(true);
      }}
      onMouseLeave={() => {
        // Delay closing to allow mouse to reach the dropdown
        tooltipTimeout.current = setTimeout(() => {
          setTooltipOpen(false);
        }, 150);
      }}
    >
      <button
        onClick={onViewDiff}
        className="flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors hover:bg-white/5"
        style={{ color: theme.colors.textMain }}
      >
        <GitBranch className="w-3 h-3" />

        {additions > 0 && (
          <span className="flex items-center gap-0.5 text-green-500">
            <Plus className="w-3 h-3" />
            {additions}
          </span>
        )}

        {deletions > 0 && (
          <span className="flex items-center gap-0.5 text-red-500">
            <Minus className="w-3 h-3" />
            {deletions}
          </span>
        )}

        {modified > 0 && (
          <span className="flex items-center gap-0.5 text-orange-500">
            <FileEdit className="w-3 h-3" />
            {modified}
          </span>
        )}
      </button>

      {/* Hover tooltip showing file list with GitHub-style diff bars */}
      {tooltipOpen && (
        <>
          {/* Invisible bridge to prevent hover gap */}
          <div
            className="absolute left-0 right-0 h-3 pointer-events-auto"
            style={{ top: '100%' }}
            onMouseEnter={() => {
              if (tooltipTimeout.current) {
                clearTimeout(tooltipTimeout.current);
                tooltipTimeout.current = null;
              }
              setTooltipOpen(true);
            }}
          />
          <div
            className="absolute top-full left-0 mt-2 w-max max-w-[400px] rounded shadow-xl z-[100] pointer-events-auto"
            style={{
              backgroundColor: theme.colors.bgSidebar,
              border: `1px solid ${theme.colors.border}`
            }}
            onMouseEnter={() => {
              if (tooltipTimeout.current) {
                clearTimeout(tooltipTimeout.current);
                tooltipTimeout.current = null;
              }
              setTooltipOpen(true);
            }}
            onMouseLeave={() => {
              tooltipTimeout.current = setTimeout(() => {
                setTooltipOpen(false);
              }, 150);
            }}
          >
        <div
          className="text-[10px] uppercase font-bold p-3 border-b"
          style={{
            color: theme.colors.textDim,
            borderColor: theme.colors.border
          }}
        >
          Changed Files ({totalChanges}) • +{additions} −{deletions}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {fileChanges.map((file, idx) => {
            const total = file.additions + file.deletions;
            const maxBarWidth = 60; // Max width in pixels for the bar
            const additionsWidth = total > 0 ? (file.additions / total) * maxBarWidth : 0;
            const deletionsWidth = total > 0 ? (file.deletions / total) * maxBarWidth : 0;

            return (
              <div
                key={idx}
                className="px-3 py-2 text-xs border-b last:border-b-0"
                style={{
                  borderColor: theme.colors.border,
                  color: theme.colors.textMain
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-mono flex-1 min-w-0" title={file.path}>{file.path}</span>
                  <div className="flex items-center gap-2 shrink-0 text-[10px]">
                    {file.additions > 0 && (
                      <span className="text-green-500">+{file.additions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-red-500">−{file.deletions}</span>
                    )}
                  </div>
                </div>
                {/* GitHub-style diff bar */}
                {total > 0 && (
                  <div className="flex gap-0.5 h-2">
                    {file.additions > 0 && (
                      <div
                        className="bg-green-500 rounded-sm"
                        style={{ width: `${additionsWidth}px` }}
                      />
                    )}
                    {file.deletions > 0 && (
                      <div
                        className="bg-red-500 rounded-sm"
                        style={{ width: `${deletionsWidth}px` }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
          <button
            onClick={onViewDiff}
            className="text-[10px] p-2 text-center border-t w-full hover:bg-white/5 transition-colors cursor-pointer"
            style={{
              color: theme.colors.textDim,
              borderColor: theme.colors.border
            }}
          >
            View Full Diff
          </button>
          </div>
        </>
      )}
    </div>
  );
}
