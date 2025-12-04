/**
 * Check if a file should be opened in external app based on extension
 */
export function shouldOpenExternally(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  // File types that should open in default system app
  const externalExtensions = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', // Documents
    'zip', 'tar', 'gz', 'rar', '7z', // Archives
    'exe', 'dmg', 'app', 'deb', 'rpm', // Executables/Installers
    'mp4', 'avi', 'mov', 'mkv', 'mp3', 'wav', 'flac', // Media files
  ];
  return externalExtensions.includes(ext || '');
}

export interface FileTreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

/**
 * Load file tree from directory recursively
 */
export async function loadFileTree(
  dirPath: string,
  maxDepth = 10,
  currentDepth = 0
): Promise<FileTreeNode[]> {
  if (currentDepth >= maxDepth) return [];

  try {
    const entries = await window.maestro.fs.readDir(dirPath);
    const tree: FileTreeNode[] = [];

    for (const entry of entries) {
      // Skip hidden files and common ignore patterns
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') {
        continue;
      }

      if (entry.isDirectory) {
        const children = await loadFileTree(`${dirPath}/${entry.name}`, maxDepth, currentDepth + 1);
        tree.push({
          name: entry.name,
          type: 'folder',
          children
        });
      } else if (entry.isFile) {
        tree.push({
          name: entry.name,
          type: 'file'
        });
      }
    }

    return tree.sort((a, b) => {
      // Folders first, then alphabetically
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error loading file tree:', error);
    throw error; // Propagate error to be caught by caller
  }
}

/**
 * Get all folder paths from a file tree recursively
 */
export function getAllFolderPaths(nodes: FileTreeNode[], currentPath = ''): string[] {
  let paths: string[] = [];
  nodes.forEach((node) => {
    if (node.type === 'folder') {
      const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
      paths.push(fullPath);
      if (node.children) {
        paths = paths.concat(getAllFolderPaths(node.children, fullPath));
      }
    }
  });
  return paths;
}

export interface FlatTreeNode extends FileTreeNode {
  fullPath: string;
  isFolder: boolean;
}

/**
 * Flatten file tree for keyboard navigation
 */
export function flattenTree(
  nodes: FileTreeNode[],
  expandedSet: Set<string>,
  currentPath = ''
): FlatTreeNode[] {
  let result: FlatTreeNode[] = [];
  nodes.forEach((node) => {
    const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
    const isFolder = node.type === 'folder';
    result.push({ ...node, fullPath, isFolder });

    if (isFolder && expandedSet.has(fullPath) && node.children) {
      result = result.concat(flattenTree(node.children, expandedSet, fullPath));
    }
  });
  return result;
}

export interface FileTreeChanges {
  totalChanges: number;
  newFiles: number;
  newFolders: number;
  removedFiles: number;
  removedFolders: number;
}

/**
 * Helper to collect all paths from a file tree
 */
function collectPaths(
  nodes: FileTreeNode[],
  currentPath = ''
): { files: Set<string>; folders: Set<string> } {
  const files = new Set<string>();
  const folders = new Set<string>();

  for (const node of nodes) {
    const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
    if (node.type === 'folder') {
      folders.add(fullPath);
      if (node.children) {
        const childPaths = collectPaths(node.children, fullPath);
        childPaths.files.forEach(f => files.add(f));
        childPaths.folders.forEach(f => folders.add(f));
      }
    } else {
      files.add(fullPath);
    }
  }

  return { files, folders };
}

/**
 * Compare two file trees and count the differences
 */
export function compareFileTrees(
  oldTree: FileTreeNode[],
  newTree: FileTreeNode[]
): FileTreeChanges {
  const oldPaths = collectPaths(oldTree);
  const newPaths = collectPaths(newTree);

  // Count new items (in new but not in old)
  let newFiles = 0;
  let newFolders = 0;
  for (const file of newPaths.files) {
    if (!oldPaths.files.has(file)) newFiles++;
  }
  for (const folder of newPaths.folders) {
    if (!oldPaths.folders.has(folder)) newFolders++;
  }

  // Count removed items (in old but not in new)
  let removedFiles = 0;
  let removedFolders = 0;
  for (const file of oldPaths.files) {
    if (!newPaths.files.has(file)) removedFiles++;
  }
  for (const folder of oldPaths.folders) {
    if (!newPaths.folders.has(folder)) removedFolders++;
  }

  return {
    totalChanges: newFiles + newFolders + removedFiles + removedFolders,
    newFiles,
    newFolders,
    removedFiles,
    removedFolders
  };
}
