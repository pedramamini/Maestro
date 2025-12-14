import { useCallback } from 'react';
import type { Session, BatchRunConfig } from '../types';

/**
 * Tree node structure for Auto Run document tree
 */
export interface AutoRunTreeNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: unknown[];
}

/**
 * Dependencies required by the useAutoRunHandlers hook
 */
export interface UseAutoRunHandlersDeps {
  // State setters
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setAutoRunDocumentList: React.Dispatch<React.SetStateAction<string[]>>;
  setAutoRunDocumentTree: React.Dispatch<React.SetStateAction<AutoRunTreeNode[]>>;
  setAutoRunContent: React.Dispatch<React.SetStateAction<string>>;
  setAutoRunIsLoadingDocuments: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoRunSetupModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBatchRunnerModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveRightTab: React.Dispatch<React.SetStateAction<'files' | 'history' | 'autorun'>>;
  setRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveFocus: React.Dispatch<React.SetStateAction<'sidebar' | 'main' | 'right'>>;
  setSuccessFlashNotification: React.Dispatch<React.SetStateAction<string | null>>;

  // Current state values
  autoRunContent: string;
  autoRunDocumentList: string[];

  // Batch processor hook
  startBatchRun: (sessionId: string, config: BatchRunConfig, folderPath: string) => void;
}

/**
 * Return type for the useAutoRunHandlers hook
 */
export interface UseAutoRunHandlersReturn {
  /** Handle folder selection from Auto Run setup modal */
  handleAutoRunFolderSelected: (folderPath: string) => Promise<void>;
  /** Start a batch run with the given configuration */
  handleStartBatchRun: (config: BatchRunConfig) => void;
  /** Get the number of unchecked tasks in a document */
  getDocumentTaskCount: (filename: string) => Promise<number>;
  /** Handle content changes in the Auto Run editor */
  handleAutoRunContentChange: (content: string) => Promise<void>;
  /** Handle mode changes (edit/preview) */
  handleAutoRunModeChange: (mode: 'edit' | 'preview') => void;
  /** Handle state changes (scroll/cursor positions) */
  handleAutoRunStateChange: (state: {
    mode: 'edit' | 'preview';
    cursorPosition: number;
    editScrollPos: number;
    previewScrollPos: number;
  }) => void;
  /** Handle document selection */
  handleAutoRunSelectDocument: (filename: string) => Promise<void>;
  /** Refresh the document list */
  handleAutoRunRefresh: () => Promise<void>;
  /** Open the Auto Run setup modal */
  handleAutoRunOpenSetup: () => void;
  /** Create a new document */
  handleAutoRunCreateDocument: (filename: string) => Promise<boolean>;
}

/**
 * Hook that provides handlers for Auto Run operations.
 * Extracted from App.tsx to reduce file size and improve maintainability.
 *
 * @param activeSession - The currently active session (can be null)
 * @param deps - Dependencies including state setters and values
 * @returns Object containing all Auto Run handler functions
 */
export function useAutoRunHandlers(
  activeSession: Session | null,
  deps: UseAutoRunHandlersDeps
): UseAutoRunHandlersReturn {
  const {
    setSessions,
    setAutoRunDocumentList,
    setAutoRunDocumentTree,
    setAutoRunContent,
    setAutoRunIsLoadingDocuments,
    setAutoRunSetupModalOpen,
    setBatchRunnerModalOpen,
    setActiveRightTab,
    setRightPanelOpen,
    setActiveFocus,
    setSuccessFlashNotification,
    autoRunContent,
    autoRunDocumentList,
    startBatchRun,
  } = deps;

  // Handler for auto run folder selection from setup modal
  const handleAutoRunFolderSelected = useCallback(async (folderPath: string) => {
    if (!activeSession) return;

    // Load the document list from the folder
    const result = await window.maestro.autorun.listDocs(folderPath);
    if (result.success) {
      setAutoRunDocumentList(result.files || []);
      setAutoRunDocumentTree((result.tree as AutoRunTreeNode[]) || []);
      // Auto-select first document if available
      const firstFile = result.files?.[0];
      setSessions(prev => prev.map(s =>
        s.id === activeSession.id
          ? {
              ...s,
              autoRunFolderPath: folderPath,
              autoRunSelectedFile: firstFile,
            }
          : s
      ));
      // Load content of first document
      if (firstFile) {
        const contentResult = await window.maestro.autorun.readDoc(folderPath, firstFile + '.md');
        if (contentResult.success) {
          setAutoRunContent(contentResult.content || '');
        }
      }
    } else {
      setSessions(prev => prev.map(s =>
        s.id === activeSession.id
          ? { ...s, autoRunFolderPath: folderPath }
          : s
      ));
    }
    setAutoRunSetupModalOpen(false);
    // Switch to the autorun tab now that folder is configured
    setActiveRightTab('autorun');
    setRightPanelOpen(true);
    setActiveFocus('right');
  }, [activeSession, setSessions, setAutoRunDocumentList, setAutoRunDocumentTree, setAutoRunContent, setAutoRunSetupModalOpen, setActiveRightTab, setRightPanelOpen, setActiveFocus]);

  // Handler to start batch run from modal with multi-document support
  const handleStartBatchRun = useCallback((config: BatchRunConfig) => {
    console.log('[useAutoRunHandlers] handleStartBatchRun called with config:', config);
    if (!activeSession || !activeSession.autoRunFolderPath) {
      console.log('[useAutoRunHandlers] handleStartBatchRun early return - no active session or autoRunFolderPath');
      return;
    }
    console.log('[useAutoRunHandlers] Starting batch run for session:', activeSession.id, 'folder:', activeSession.autoRunFolderPath);
    setBatchRunnerModalOpen(false);
    startBatchRun(activeSession.id, config, activeSession.autoRunFolderPath);
  }, [activeSession, startBatchRun, setBatchRunnerModalOpen]);

  // Memoized function to get task count for a document (used by BatchRunnerModal)
  const getDocumentTaskCount = useCallback(async (filename: string) => {
    if (!activeSession?.autoRunFolderPath) return 0;
    const result = await window.maestro.autorun.readDoc(activeSession.autoRunFolderPath, filename + '.md');
    if (!result.success || !result.content) return 0;
    // Count unchecked tasks: - [ ] pattern
    const matches = result.content.match(/^[\s]*-\s*\[\s*\]\s*.+$/gm);
    return matches ? matches.length : 0;
  }, [activeSession?.autoRunFolderPath]);

  // Auto Run document content change handler
  // Note: This only updates the shared state. File saving is handled by AutoRun component
  // directly, which uses the correct folderPath/selectedFile from its props (not activeSession).
  // This prevents content from being saved to the wrong session when switching between sessions
  // that have documents with the same name.
  const handleAutoRunContentChange = useCallback(async (content: string) => {
    setAutoRunContent(content);
  }, [setAutoRunContent]);

  // Auto Run mode change handler
  const handleAutoRunModeChange = useCallback((mode: 'edit' | 'preview') => {
    if (!activeSession) return;
    setSessions(prev => prev.map(s =>
      s.id === activeSession.id ? { ...s, autoRunMode: mode } : s
    ));
  }, [activeSession, setSessions]);

  // Auto Run state change handler (scroll/cursor positions)
  const handleAutoRunStateChange = useCallback((state: {
    mode: 'edit' | 'preview';
    cursorPosition: number;
    editScrollPos: number;
    previewScrollPos: number;
  }) => {
    if (!activeSession) return;
    setSessions(prev => prev.map(s =>
      s.id === activeSession.id ? {
        ...s,
        autoRunMode: state.mode,
        autoRunCursorPosition: state.cursorPosition,
        autoRunEditScrollPos: state.editScrollPos,
        autoRunPreviewScrollPos: state.previewScrollPos,
      } : s
    ));
  }, [activeSession, setSessions]);

  // Auto Run document selection handler
  // NOTE: Saving the current document's pending changes is handled by AutoRun.tsx's
  // useEffect that detects selectedFile changes. This handler only:
  // 1. Loads the new document's content
  // 2. Updates the selectedFile in session state
  // The AutoRun component saves localContent (which may differ from autoRunContent shared state)
  // to the OLD document before this handler's changes take effect.
  const handleAutoRunSelectDocument = useCallback(async (filename: string) => {
    if (!activeSession?.autoRunFolderPath) return;

    // Load new document content FIRST (before updating selectedFile)
    // This ensures content prop updates atomically with the file selection
    const result = await window.maestro.autorun.readDoc(
      activeSession.autoRunFolderPath,
      filename + '.md'
    );
    const newContent = result.success ? (result.content || '') : '';

    // Update content first, then selected file
    // This prevents the AutoRun component from seeing mismatched file/content
    setAutoRunContent(newContent);

    // Then update the selected file
    setSessions(prev => prev.map(s =>
      s.id === activeSession.id ? { ...s, autoRunSelectedFile: filename } : s
    ));
  }, [activeSession, setAutoRunContent, setSessions]);

  // Auto Run refresh handler - reload document list and show flash notification
  const handleAutoRunRefresh = useCallback(async () => {
    if (!activeSession?.autoRunFolderPath) return;
    const previousCount = autoRunDocumentList.length;
    setAutoRunIsLoadingDocuments(true);
    const result = await window.maestro.autorun.listDocs(activeSession.autoRunFolderPath);
    if (result.success) {
      const newFiles = result.files || [];
      setAutoRunDocumentList(newFiles);
      setAutoRunDocumentTree((result.tree as AutoRunTreeNode[]) || []);
      setAutoRunIsLoadingDocuments(false);

      // Show flash notification with result
      const diff = newFiles.length - previousCount;
      let message: string;
      if (diff > 0) {
        message = `Found ${diff} new document${diff === 1 ? '' : 's'}`;
      } else if (diff < 0) {
        message = `${Math.abs(diff)} document${Math.abs(diff) === 1 ? '' : 's'} removed`;
      } else {
        message = 'Refresh complete, no new documents';
      }
      setSuccessFlashNotification(message);
      setTimeout(() => setSuccessFlashNotification(null), 2000);
      return;
    }
    setAutoRunIsLoadingDocuments(false);
  }, [activeSession?.autoRunFolderPath, autoRunDocumentList.length, setAutoRunDocumentList, setAutoRunDocumentTree, setAutoRunIsLoadingDocuments, setSuccessFlashNotification]);

  // Auto Run open setup handler
  const handleAutoRunOpenSetup = useCallback(() => {
    setAutoRunSetupModalOpen(true);
  }, [setAutoRunSetupModalOpen]);

  // Auto Run create new document handler
  const handleAutoRunCreateDocument = useCallback(async (filename: string): Promise<boolean> => {
    if (!activeSession?.autoRunFolderPath) return false;

    try {
      // Create the document with empty content so placeholder hint shows
      const result = await window.maestro.autorun.writeDoc(
        activeSession.autoRunFolderPath,
        filename + '.md',
        ''
      );

      if (result.success) {
        // Refresh the document list
        const listResult = await window.maestro.autorun.listDocs(activeSession.autoRunFolderPath);
        if (listResult.success) {
          setAutoRunDocumentList(listResult.files || []);
        }

        // Select the new document and switch to edit mode
        setSessions(prev => prev.map(s =>
          s.id === activeSession.id ? { ...s, autoRunSelectedFile: filename, autoRunMode: 'edit' } : s
        ));

        // Load the new document content
        const contentResult = await window.maestro.autorun.readDoc(
          activeSession.autoRunFolderPath,
          filename + '.md'
        );
        if (contentResult.success) {
          setAutoRunContent(contentResult.content || '');
        }

        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to create document:', error);
      return false;
    }
  }, [activeSession, setSessions, setAutoRunDocumentList, setAutoRunContent]);

  return {
    handleAutoRunFolderSelected,
    handleStartBatchRun,
    getDocumentTaskCount,
    handleAutoRunContentChange,
    handleAutoRunModeChange,
    handleAutoRunStateChange,
    handleAutoRunSelectDocument,
    handleAutoRunRefresh,
    handleAutoRunOpenSetup,
    handleAutoRunCreateDocument,
  };
}
