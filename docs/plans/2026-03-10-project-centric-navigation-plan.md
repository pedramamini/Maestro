# Project-Centric Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Maestro's navigation from agent-centric (flat session list) to project/repo-centric (projects in left bar, session tabs per project, global inbox for attention items).

**Architecture:** Add `Project` as a new first-class entity alongside `Session`. Sessions gain a `projectId` linking them to a project. A new `projectStore` (Zustand) manages project state, a new `inboxStore` manages attention items. The left sidebar is rewritten to show Inbox + Projects. The existing tab bar becomes project-scoped (showing sessions-as-tabs). Groups and bookmarks are removed.

**Tech Stack:** Electron, React, Zustand, TypeScript, Vitest, electron-store

**Design Doc:** `docs/plans/2026-03-10-project-centric-navigation-design.md`

---

## Phase 1: Data Model & Types

### Task 1: Add Project and InboxItem types

**Files:**
- Modify: `src/renderer/types/index.ts`
- Modify: `src/shared/types.ts`

**Step 1: Add Project interface to shared types**

In `src/shared/types.ts`, add after the Group interface (keep Group for now — remove in Phase 9):

```typescript
export interface Project {
	id: string;
	name: string;
	repoPath: string;
	createdAt: number;
	color?: string;
	collapsed?: boolean;
}
```

**Step 2: Add InboxItem interface and InboxReason type to renderer types**

In `src/renderer/types/index.ts`, add after the existing type definitions:

```typescript
export type InboxReason = 'finished' | 'error' | 'waiting_input';

export interface InboxItem {
	id: string;
	sessionId: string;
	tabId: string;
	projectId: string;
	reason: InboxReason;
	agentType: ToolType;
	tabName: string;
	projectName: string;
	timestamp: number;
}
```

**Step 3: Add projectId to Session interface**

In `src/renderer/types/index.ts`, find the Session interface (line 505). Add `projectId` after the `groupId` field:

```typescript
export interface Session {
	id: string;
	groupId?: string;        // Keep for migration — remove in Phase 9
	projectId?: string;      // NEW — links to Project. Optional during migration, required after.
	name: string;
	// ... rest unchanged
}
```

Note: `projectId` is optional during the migration period. After migration runs, all sessions will have one.

**Step 4: Add ProjectsData type to store types**

In `src/main/stores/types.ts`, add after GroupsData:

```typescript
export interface ProjectsData {
	projects: Project[];
}
```

Import Project from shared types:

```typescript
import type { SshRemoteConfig, Group, Project } from '../../shared/types';
```

**Step 5: Commit**

```bash
git add src/renderer/types/index.ts src/shared/types.ts src/main/stores/types.ts
git commit -m "feat: add Project and InboxItem type definitions"
```

---

## Phase 2: Zustand Stores

### Task 2: Create projectStore

**Files:**
- Create: `src/renderer/stores/projectStore.ts`
- Test: `src/__tests__/renderer/stores/projectStore.test.ts`

**Step 1: Write failing tests for projectStore**

Create `src/__tests__/renderer/stores/projectStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
	useProjectStore,
	selectActiveProject,
	selectAllProjects,
	selectSessionCountByProject,
	getProjectState,
	getProjectActions,
} from '../../../renderer/stores/projectStore';

function createMockProject(overrides: Partial<any> = {}) {
	return {
		id: overrides.id ?? `project-${Math.random().toString(36).slice(2, 8)}`,
		name: overrides.name ?? 'Test Project',
		repoPath: overrides.repoPath ?? '/test/repo',
		createdAt: overrides.createdAt ?? Date.now(),
		...overrides,
	};
}

describe('projectStore', () => {
	beforeEach(() => {
		useProjectStore.setState({
			projects: [],
			activeProjectId: '',
		});
	});

	describe('CRUD operations', () => {
		it('should add a project', () => {
			const project = createMockProject({ id: 'p1', name: 'Maestro' });
			useProjectStore.getState().addProject(project);
			expect(useProjectStore.getState().projects).toHaveLength(1);
			expect(useProjectStore.getState().projects[0].name).toBe('Maestro');
		});

		it('should remove a project by ID', () => {
			const p1 = createMockProject({ id: 'p1' });
			const p2 = createMockProject({ id: 'p2' });
			useProjectStore.setState({ projects: [p1, p2] });
			useProjectStore.getState().removeProject('p1');
			expect(useProjectStore.getState().projects).toHaveLength(1);
			expect(useProjectStore.getState().projects[0].id).toBe('p2');
		});

		it('should not mutate state when removing non-existent project', () => {
			const p1 = createMockProject({ id: 'p1' });
			useProjectStore.setState({ projects: [p1] });
			const before = useProjectStore.getState().projects;
			useProjectStore.getState().removeProject('nonexistent');
			expect(useProjectStore.getState().projects).toBe(before);
		});

		it('should update a project', () => {
			const p1 = createMockProject({ id: 'p1', name: 'Old' });
			useProjectStore.setState({ projects: [p1] });
			useProjectStore.getState().updateProject('p1', { name: 'New' });
			expect(useProjectStore.getState().projects[0].name).toBe('New');
		});

		it('should set all projects', () => {
			const projects = [createMockProject({ id: 'p1' }), createMockProject({ id: 'p2' })];
			useProjectStore.getState().setProjects(projects);
			expect(useProjectStore.getState().projects).toHaveLength(2);
		});

		it('should support functional updater for setProjects', () => {
			const p1 = createMockProject({ id: 'p1' });
			useProjectStore.setState({ projects: [p1] });
			useProjectStore.getState().setProjects((prev) => [...prev, createMockProject({ id: 'p2' })]);
			expect(useProjectStore.getState().projects).toHaveLength(2);
		});
	});

	describe('active project', () => {
		it('should set active project ID and reset to -1 cycle', () => {
			useProjectStore.getState().setActiveProjectId('p1');
			expect(useProjectStore.getState().activeProjectId).toBe('p1');
		});
	});

	describe('selectors', () => {
		it('selectActiveProject returns active project', () => {
			const p1 = createMockProject({ id: 'p1' });
			const p2 = createMockProject({ id: 'p2' });
			useProjectStore.setState({ projects: [p1, p2], activeProjectId: 'p2' });
			const result = selectActiveProject(useProjectStore.getState());
			expect(result?.id).toBe('p2');
		});

		it('selectActiveProject falls back to first project', () => {
			const p1 = createMockProject({ id: 'p1' });
			useProjectStore.setState({ projects: [p1], activeProjectId: 'nonexistent' });
			const result = selectActiveProject(useProjectStore.getState());
			expect(result?.id).toBe('p1');
		});

		it('selectActiveProject returns undefined when empty', () => {
			const result = selectActiveProject(useProjectStore.getState());
			expect(result).toBeUndefined();
		});

		it('selectAllProjects returns all projects', () => {
			const projects = [createMockProject({ id: 'p1' }), createMockProject({ id: 'p2' })];
			useProjectStore.setState({ projects });
			expect(selectAllProjects(useProjectStore.getState())).toHaveLength(2);
		});
	});

	describe('non-React access', () => {
		it('getProjectState returns current state', () => {
			const p1 = createMockProject({ id: 'p1' });
			useProjectStore.setState({ projects: [p1], activeProjectId: 'p1' });
			const state = getProjectState();
			expect(state.projects).toHaveLength(1);
			expect(state.activeProjectId).toBe('p1');
		});

		it('getProjectActions returns stable action references', () => {
			const actions = getProjectActions();
			expect(typeof actions.addProject).toBe('function');
			expect(typeof actions.removeProject).toBe('function');
			expect(typeof actions.setActiveProjectId).toBe('function');
		});
	});
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/renderer/stores/projectStore.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement projectStore**

Create `src/renderer/stores/projectStore.ts`:

```typescript
/**
 * projectStore - Zustand store for project (repo) state management
 *
 * Projects are the top-level organizational unit. Each project maps to a
 * git repository. Sessions belong to a project via session.projectId.
 */

import { create } from 'zustand';
import type { Project } from '../../shared/types';

// ============================================================================
// Store Types
// ============================================================================

export interface ProjectStoreState {
	projects: Project[];
	activeProjectId: string;
}

export interface ProjectStoreActions {
	setProjects: (projects: Project[] | ((prev: Project[]) => Project[])) => void;
	addProject: (project: Project) => void;
	removeProject: (projectId: string) => void;
	updateProject: (projectId: string, updates: Partial<Project>) => void;
	setActiveProjectId: (projectId: string) => void;
}

export type ProjectStore = ProjectStoreState & ProjectStoreActions;

// ============================================================================
// Helpers
// ============================================================================

function resolve<T>(valOrFn: T | ((prev: T) => T), prev: T): T {
	return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useProjectStore = create<ProjectStore>()((set) => ({
	projects: [],
	activeProjectId: '',

	setProjects: (v) =>
		set((s) => {
			const newProjects = resolve(v, s.projects);
			if (newProjects === s.projects) return s;
			return { projects: newProjects };
		}),

	addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),

	removeProject: (projectId) =>
		set((s) => {
			const filtered = s.projects.filter((p) => p.id !== projectId);
			if (filtered.length === s.projects.length) return s;
			return { projects: filtered };
		}),

	updateProject: (projectId, updates) =>
		set((s) => {
			let found = false;
			const newProjects = s.projects.map((p) => {
				if (p.id === projectId) {
					found = true;
					return { ...p, ...updates };
				}
				return p;
			});
			if (!found) return s;
			return { projects: newProjects };
		}),

	setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectActiveProject = (state: ProjectStore): Project | undefined =>
	state.projects.find((p) => p.id === state.activeProjectId) || state.projects[0];

export const selectAllProjects = (state: ProjectStore): Project[] => state.projects;

export const selectProjectById =
	(id: string) =>
	(state: ProjectStore): Project | undefined =>
		state.projects.find((p) => p.id === id);

export const selectSessionCountByProject =
	(projectId: string, sessions: { projectId?: string }[]) => (): number =>
		sessions.filter((s) => s.projectId === projectId).length;

// ============================================================================
// Non-React Access
// ============================================================================

export function getProjectState() {
	return useProjectStore.getState();
}

export function getProjectActions() {
	const state = useProjectStore.getState();
	return {
		setProjects: state.setProjects,
		addProject: state.addProject,
		removeProject: state.removeProject,
		updateProject: state.updateProject,
		setActiveProjectId: state.setActiveProjectId,
	};
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/renderer/stores/projectStore.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/renderer/stores/projectStore.ts src/__tests__/renderer/stores/projectStore.test.ts
git commit -m "feat: add projectStore with CRUD, selectors, and tests"
```

---

### Task 3: Create inboxStore

**Files:**
- Create: `src/renderer/stores/inboxStore.ts`
- Test: `src/__tests__/renderer/stores/inboxStore.test.ts`

**Step 1: Write failing tests for inboxStore**

Create `src/__tests__/renderer/stores/inboxStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
	useInboxStore,
	selectInboxItems,
	selectInboxCount,
	selectInboxByProject,
	getInboxActions,
} from '../../../renderer/stores/inboxStore';
import type { InboxItem } from '../../../renderer/types';

function createMockInboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
	return {
		id: overrides.id ?? `inbox-${Math.random().toString(36).slice(2, 8)}`,
		sessionId: overrides.sessionId ?? 'session-1',
		tabId: overrides.tabId ?? 'tab-1',
		projectId: overrides.projectId ?? 'project-1',
		reason: overrides.reason ?? 'finished',
		agentType: overrides.agentType ?? 'claude-code',
		tabName: overrides.tabName ?? 'Tab 1',
		projectName: overrides.projectName ?? 'Test Project',
		timestamp: overrides.timestamp ?? Date.now(),
		...overrides,
	};
}

describe('inboxStore', () => {
	beforeEach(() => {
		useInboxStore.setState({ items: [] });
	});

	describe('addItem', () => {
		it('should add an inbox item', () => {
			const item = createMockInboxItem({ id: 'i1' });
			useInboxStore.getState().addItem(item);
			expect(useInboxStore.getState().items).toHaveLength(1);
		});

		it('should deduplicate by sessionId + reason', () => {
			const item1 = createMockInboxItem({ id: 'i1', sessionId: 's1', reason: 'finished' });
			const item2 = createMockInboxItem({ id: 'i2', sessionId: 's1', reason: 'finished' });
			useInboxStore.getState().addItem(item1);
			useInboxStore.getState().addItem(item2);
			expect(useInboxStore.getState().items).toHaveLength(1);
		});

		it('should allow same session with different reason', () => {
			const item1 = createMockInboxItem({ id: 'i1', sessionId: 's1', reason: 'finished' });
			const item2 = createMockInboxItem({ id: 'i2', sessionId: 's1', reason: 'error' });
			useInboxStore.getState().addItem(item1);
			useInboxStore.getState().addItem(item2);
			expect(useInboxStore.getState().items).toHaveLength(2);
		});
	});

	describe('dismissItem', () => {
		it('should remove a specific item by ID', () => {
			const item = createMockInboxItem({ id: 'i1' });
			useInboxStore.setState({ items: [item] });
			useInboxStore.getState().dismissItem('i1');
			expect(useInboxStore.getState().items).toHaveLength(0);
		});

		it('should not mutate when dismissing non-existent item', () => {
			const item = createMockInboxItem({ id: 'i1' });
			useInboxStore.setState({ items: [item] });
			const before = useInboxStore.getState().items;
			useInboxStore.getState().dismissItem('nonexistent');
			expect(useInboxStore.getState().items).toBe(before);
		});
	});

	describe('dismissAllForSession', () => {
		it('should remove all items for a session', () => {
			const items = [
				createMockInboxItem({ id: 'i1', sessionId: 's1' }),
				createMockInboxItem({ id: 'i2', sessionId: 's1', reason: 'error' }),
				createMockInboxItem({ id: 'i3', sessionId: 's2' }),
			];
			useInboxStore.setState({ items });
			useInboxStore.getState().dismissAllForSession('s1');
			expect(useInboxStore.getState().items).toHaveLength(1);
			expect(useInboxStore.getState().items[0].sessionId).toBe('s2');
		});
	});

	describe('dismissAllForProject', () => {
		it('should remove all items for a project', () => {
			const items = [
				createMockInboxItem({ id: 'i1', projectId: 'p1' }),
				createMockInboxItem({ id: 'i2', projectId: 'p2' }),
			];
			useInboxStore.setState({ items });
			useInboxStore.getState().dismissAllForProject('p1');
			expect(useInboxStore.getState().items).toHaveLength(1);
			expect(useInboxStore.getState().items[0].projectId).toBe('p2');
		});
	});

	describe('clearAll', () => {
		it('should remove all items', () => {
			const items = [
				createMockInboxItem({ id: 'i1' }),
				createMockInboxItem({ id: 'i2', sessionId: 's2' }),
			];
			useInboxStore.setState({ items });
			useInboxStore.getState().clearAll();
			expect(useInboxStore.getState().items).toHaveLength(0);
		});
	});

	describe('selectors', () => {
		it('selectInboxItems returns items sorted newest first', () => {
			const items = [
				createMockInboxItem({ id: 'i1', timestamp: 1000 }),
				createMockInboxItem({ id: 'i2', sessionId: 's2', timestamp: 2000 }),
			];
			useInboxStore.setState({ items });
			const sorted = selectInboxItems(useInboxStore.getState());
			expect(sorted[0].id).toBe('i2');
			expect(sorted[1].id).toBe('i1');
		});

		it('selectInboxCount returns item count', () => {
			const items = [
				createMockInboxItem({ id: 'i1' }),
				createMockInboxItem({ id: 'i2', sessionId: 's2' }),
			];
			useInboxStore.setState({ items });
			expect(selectInboxCount(useInboxStore.getState())).toBe(2);
		});

		it('selectInboxByProject filters by project', () => {
			const items = [
				createMockInboxItem({ id: 'i1', projectId: 'p1' }),
				createMockInboxItem({ id: 'i2', projectId: 'p2', sessionId: 's2' }),
			];
			useInboxStore.setState({ items });
			const selector = selectInboxByProject('p1');
			expect(selector(useInboxStore.getState())).toHaveLength(1);
		});
	});
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/renderer/stores/inboxStore.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement inboxStore**

Create `src/renderer/stores/inboxStore.ts`:

```typescript
/**
 * inboxStore - Zustand store for attention inbox management
 *
 * Tracks sessions that need user attention (finished, errored, waiting for input).
 * Runtime-only — not persisted to disk.
 */

import { create } from 'zustand';
import type { InboxItem } from '../types';

// ============================================================================
// Store Types
// ============================================================================

export interface InboxStoreState {
	items: InboxItem[];
}

export interface InboxStoreActions {
	addItem: (item: InboxItem) => void;
	dismissItem: (itemId: string) => void;
	dismissAllForSession: (sessionId: string) => void;
	dismissAllForProject: (projectId: string) => void;
	clearAll: () => void;
}

export type InboxStore = InboxStoreState & InboxStoreActions;

// ============================================================================
// Store Implementation
// ============================================================================

export const useInboxStore = create<InboxStore>()((set) => ({
	items: [],

	addItem: (item) =>
		set((s) => {
			// Deduplicate: don't add if same session+reason already exists
			const exists = s.items.some(
				(existing) => existing.sessionId === item.sessionId && existing.reason === item.reason
			);
			if (exists) return s;
			return { items: [...s.items, item] };
		}),

	dismissItem: (itemId) =>
		set((s) => {
			const filtered = s.items.filter((item) => item.id !== itemId);
			if (filtered.length === s.items.length) return s;
			return { items: filtered };
		}),

	dismissAllForSession: (sessionId) =>
		set((s) => {
			const filtered = s.items.filter((item) => item.sessionId !== sessionId);
			if (filtered.length === s.items.length) return s;
			return { items: filtered };
		}),

	dismissAllForProject: (projectId) =>
		set((s) => {
			const filtered = s.items.filter((item) => item.projectId !== projectId);
			if (filtered.length === s.items.length) return s;
			return { items: filtered };
		}),

	clearAll: () => set({ items: [] }),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectInboxItems = (state: InboxStore): InboxItem[] =>
	[...state.items].sort((a, b) => b.timestamp - a.timestamp);

export const selectInboxCount = (state: InboxStore): number => state.items.length;

export const selectInboxByProject =
	(projectId: string) =>
	(state: InboxStore): InboxItem[] =>
		state.items
			.filter((item) => item.projectId === projectId)
			.sort((a, b) => b.timestamp - a.timestamp);

// ============================================================================
// Non-React Access
// ============================================================================

export function getInboxActions() {
	const state = useInboxStore.getState();
	return {
		addItem: state.addItem,
		dismissItem: state.dismissItem,
		dismissAllForSession: state.dismissAllForSession,
		dismissAllForProject: state.dismissAllForProject,
		clearAll: state.clearAll,
	};
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/renderer/stores/inboxStore.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/renderer/stores/inboxStore.ts src/__tests__/renderer/stores/inboxStore.test.ts
git commit -m "feat: add inboxStore with dedup, dismissal, selectors, and tests"
```

---

### Task 4: Add selectSessionsByProject to sessionStore

**Files:**
- Modify: `src/renderer/stores/sessionStore.ts`
- Modify: `src/__tests__/renderer/stores/sessionStore.test.ts`

**Step 1: Write failing test**

Add to `src/__tests__/renderer/stores/sessionStore.test.ts` — find the selectors describe block and add:

```typescript
import { selectSessionsByProject } from '../../../renderer/stores/sessionStore';

// Inside the selectors describe block:
describe('selectSessionsByProject', () => {
	it('should return sessions matching projectId', () => {
		const sessions = [
			createMockSession({ id: 's1', projectId: 'p1' }),
			createMockSession({ id: 's2', projectId: 'p2' }),
			createMockSession({ id: 's3', projectId: 'p1' }),
		];
		useSessionStore.setState({ sessions });
		const result = selectSessionsByProject('p1')(useSessionStore.getState());
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.id)).toEqual(['s1', 's3']);
	});

	it('should return empty array for unknown projectId', () => {
		const sessions = [createMockSession({ id: 's1', projectId: 'p1' })];
		useSessionStore.setState({ sessions });
		const result = selectSessionsByProject('nonexistent')(useSessionStore.getState());
		expect(result).toHaveLength(0);
	});
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/renderer/stores/sessionStore.test.ts
```

Expected: FAIL — `selectSessionsByProject` is not exported.

**Step 3: Add the selector to sessionStore**

In `src/renderer/stores/sessionStore.ts`, add after the `selectUngroupedSessions` selector (around line 360):

```typescript
/**
 * Select sessions belonging to a specific project.
 */
export const selectSessionsByProject =
	(projectId: string) =>
	(state: SessionStore): Session[] =>
		state.sessions.filter((s) => s.projectId === projectId);
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/renderer/stores/sessionStore.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/renderer/stores/sessionStore.ts src/__tests__/renderer/stores/sessionStore.test.ts
git commit -m "feat: add selectSessionsByProject selector to sessionStore"
```

---

## Phase 3: Persistence Layer (IPC)

### Task 5: Add projects electron-store and IPC handlers

**Files:**
- Modify: `src/main/stores/types.ts` (already done in Task 1)
- Modify: `src/main/stores/defaults.ts`
- Modify: `src/main/stores/instances.ts`
- Modify: `src/main/stores/getters.ts`
- Modify: `src/main/stores/index.ts` (if it re-exports)
- Modify: `src/main/ipc/handlers/persistence.ts`

**Step 1: Add PROJECTS_DEFAULTS to defaults.ts**

In `src/main/stores/defaults.ts`, add import for `ProjectsData` and the default:

```typescript
import type { ProjectsData } from './types';

export const PROJECTS_DEFAULTS: ProjectsData = {
	projects: [],
};
```

**Step 2: Add projects store to instances.ts**

In `src/main/stores/instances.ts`:

1. Import `ProjectsData` in the type import block.
2. Import `PROJECTS_DEFAULTS` in the defaults import block.
3. Add instance variable: `let _projectsStore: Store<ProjectsData> | null = null;`
4. In `initializeStores()`, after the groups store init (line 110), add:

```typescript
_projectsStore = new Store<ProjectsData>({
	name: 'maestro-projects',
	cwd: _syncPath,
	defaults: PROJECTS_DEFAULTS,
});
```

5. In `getStoreInstances()`, add `projectsStore: _projectsStore` to the return object.

**Step 3: Add getter in getters.ts**

In `src/main/stores/getters.ts`:

1. Import `ProjectsData` type.
2. Add getter function:

```typescript
export function getProjectsStore(): Store<ProjectsData> {
	ensureInitialized();
	return getStoreInstances().projectsStore!;
}
```

**Step 4: Update store index exports**

In `src/main/stores/index.ts`, add re-export for `getProjectsStore` if not auto-exported.

**Step 5: Add IPC handlers in persistence.ts**

In `src/main/ipc/handlers/persistence.ts`:

1. Update `PersistenceHandlerDependencies` to include `projectsStore`:

```typescript
export interface PersistenceHandlerDependencies {
	settingsStore: Store<MaestroSettings>;
	sessionsStore: Store<SessionsData>;
	groupsStore: Store<GroupsData>;
	projectsStore: Store<ProjectsData>;
	getWebServer: () => WebServer | null;
}
```

2. Import `ProjectsData` in the type imports.

3. After the `groups:setAll` handler (line 205), add:

```typescript
// Projects persistence
ipcMain.handle('projects:getAll', async () => {
	return projectsStore.get('projects', []);
});

ipcMain.handle('projects:setAll', async (_, projects: Project[]) => {
	try {
		projectsStore.set('projects', projects);
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		logger.warn(`Failed to persist projects: ${code || (err as Error).message}`, 'Projects');
		return false;
	}
	return true;
});
```

4. Destructure `projectsStore` from `deps` at the top of `registerPersistenceHandlers`.

**Step 6: Wire projectsStore in main/index.ts**

In `src/main/index.ts`, find where `sessionsStore` and `groupsStore` are initialized (around line 231). Add:

```typescript
const projectsStore = getProjectsStore();
```

Import `getProjectsStore` from the stores module. Pass `projectsStore` to `registerPersistenceHandlers` call.

**Step 7: Commit**

```bash
git add src/main/stores/ src/main/ipc/handlers/persistence.ts src/main/index.ts
git commit -m "feat: add projects electron-store and IPC persistence handlers"
```

---

### Task 6: Add projects preload bridge

**Files:**
- Modify: `src/main/preload/settings.ts`
- Modify: `src/main/preload/index.ts`

**Step 1: Add createProjectsApi to preload/settings.ts**

In `src/main/preload/settings.ts`, add after `createGroupsApi()`:

```typescript
/**
 * Creates the projects persistence API object for preload exposure
 */
export function createProjectsApi() {
	return {
		getAll: () => ipcRenderer.invoke('projects:getAll'),
		setAll: (projects: any[]) => ipcRenderer.invoke('projects:setAll', projects),
	};
}

export type ProjectsApi = ReturnType<typeof createProjectsApi>;
```

**Step 2: Expose in preload/index.ts**

In `src/main/preload/index.ts`:

1. Import `createProjectsApi` from `'./settings'`.
2. Add to the `contextBridge.exposeInMainWorld('maestro', { ... })` object:

```typescript
// Projects persistence API
projects: createProjectsApi(),
```

**Step 3: Commit**

```bash
git add src/main/preload/settings.ts src/main/preload/index.ts
git commit -m "feat: expose window.maestro.projects IPC bridge"
```

---

## Phase 4: Project Restoration & Migration

### Task 7: Create useProjectRestoration hook

**Files:**
- Create: `src/renderer/hooks/project/useProjectRestoration.ts`
- Modify: `src/renderer/hooks/session/useSessionRestoration.ts` (add migration)

**Step 1: Create the hook**

Create `src/renderer/hooks/project/useProjectRestoration.ts`:

```typescript
/**
 * useProjectRestoration - Loads projects from disk on startup and runs migration.
 *
 * Migration: Converts existing groups → projects on first run.
 * After migration, groups store is left inert (not read again).
 */

import { useEffect, useRef } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSessionStore } from '../../stores/sessionStore';
import { generateId } from '../../utils/ids';
import type { Project } from '../../../shared/types';
import type { Session } from '../../types';

const MIGRATION_KEY = 'projectMigrationComplete';

/**
 * Migrate groups → projects. Runs once.
 */
async function migrateGroupsToProjects(): Promise<{
	projects: Project[];
	updatedSessions: Session[];
} | null> {
	const migrated = await window.maestro.settings.get(MIGRATION_KEY);
	if (migrated) return null;

	const groups = await window.maestro.groups.getAll();
	const sessions = useSessionStore.getState().sessions;

	if ((!groups || groups.length === 0) && sessions.every((s) => !s.groupId)) {
		// No groups, no groupId on sessions — nothing to migrate
		// But still need to create projects for orphaned sessions
	}

	const projects: Project[] = [];
	const sessionUpdates = new Map<string, string>(); // sessionId → projectId

	// 1. Convert groups → projects
	if (groups && groups.length > 0) {
		for (const group of groups) {
			const groupSessions = sessions.filter((s) => s.groupId === group.id);
			if (groupSessions.length === 0) continue;

			const project: Project = {
				id: generateId(),
				name: group.name || 'Unnamed Project',
				repoPath: groupSessions[0].projectRoot || groupSessions[0].cwd,
				createdAt: Date.now(),
			};
			projects.push(project);

			for (const session of groupSessions) {
				sessionUpdates.set(session.id, project.id);
			}
		}
	}

	// 2. Handle ungrouped sessions — group by projectRoot/cwd
	const ungrouped = sessions.filter((s) => !s.groupId && !sessionUpdates.has(s.id));
	const byRoot = new Map<string, Session[]>();
	for (const session of ungrouped) {
		const root = session.projectRoot || session.cwd;
		if (!byRoot.has(root)) byRoot.set(root, []);
		byRoot.get(root)!.push(session);
	}

	for (const [root, rootSessions] of byRoot) {
		const folderName = root.split(/[\\/]/).filter(Boolean).pop() || 'Default';
		const project: Project = {
			id: generateId(),
			name: folderName,
			repoPath: root,
			createdAt: Date.now(),
		};
		projects.push(project);
		for (const session of rootSessions) {
			sessionUpdates.set(session.id, project.id);
		}
	}

	// 3. Apply projectId to sessions
	const updatedSessions = sessions.map((s) => ({
		...s,
		projectId: sessionUpdates.get(s.id) || s.projectId,
	}));

	// 4. Mark migration complete
	await window.maestro.settings.set(MIGRATION_KEY, true);

	return { projects, updatedSessions };
}

export function useProjectRestoration() {
	const hasRun = useRef(false);
	const { setProjects, setActiveProjectId } = useProjectStore.getState();
	const { setSessions } = useSessionStore.getState();
	const initialLoadComplete = useSessionStore((s) => s.initialLoadComplete);

	useEffect(() => {
		if (!initialLoadComplete || hasRun.current) return;
		hasRun.current = true;

		const loadProjects = async () => {
			// 1. Try loading existing projects
			const savedProjects = await window.maestro.projects.getAll();

			if (savedProjects && savedProjects.length > 0) {
				setProjects(savedProjects);

				// Set active project to the one containing the active session
				const activeSessionId = useSessionStore.getState().activeSessionId;
				const activeSession = useSessionStore
					.getState()
					.sessions.find((s) => s.id === activeSessionId);
				if (activeSession?.projectId) {
					setActiveProjectId(activeSession.projectId);
				} else if (savedProjects.length > 0) {
					setActiveProjectId(savedProjects[0].id);
				}
				return;
			}

			// 2. No projects saved — run migration
			const migrationResult = await migrateGroupsToProjects();
			if (migrationResult) {
				setProjects(migrationResult.projects);
				setSessions(migrationResult.updatedSessions);
				await window.maestro.projects.setAll(migrationResult.projects);

				// Set active project
				const activeSessionId = useSessionStore.getState().activeSessionId;
				const activeSession = migrationResult.updatedSessions.find(
					(s) => s.id === activeSessionId
				);
				if (activeSession?.projectId) {
					setActiveProjectId(activeSession.projectId);
				} else if (migrationResult.projects.length > 0) {
					setActiveProjectId(migrationResult.projects[0].id);
				}
			}
		};

		loadProjects().catch((err) => {
			console.error('[useProjectRestoration] Failed to load/migrate projects:', err);
		});
	}, [initialLoadComplete, setProjects, setActiveProjectId, setSessions]);
}
```

**Step 2: Add debounced persistence for projects**

In the existing `useDebouncedPersistence` hook (or wherever session persistence is debounced), add a matching effect for the project store. Find the file at `src/renderer/hooks/settings/useDebouncedPersistence.ts` and follow the same pattern used for sessions:

```typescript
// Projects persistence (same debounce pattern)
useEffect(() => {
	if (!initialLoadComplete) return;
	const timer = setTimeout(() => {
		const { projects } = useProjectStore.getState();
		window.maestro.projects.setAll(projects);
	}, DEBOUNCE_MS);
	return () => clearTimeout(timer);
}, [projects, initialLoadComplete]);
```

The exact wiring depends on how the existing debounce is structured — follow the same subscription pattern.

**Step 3: Commit**

```bash
git add src/renderer/hooks/project/useProjectRestoration.ts
git commit -m "feat: add useProjectRestoration with group→project migration"
```

---

## Phase 5: Left Sidebar UI

### Task 8: Create InboxItem component

**Files:**
- Create: `src/renderer/components/ProjectSidebar/InboxItem.tsx`

**Step 1: Create the component**

```typescript
/**
 * InboxItem - A single attention item in the inbox sidebar section.
 * Shows reason icon, agent type, tab name, project name, and relative time.
 * Click navigates to the project + session and auto-dismisses.
 */

import React, { useCallback, useMemo } from 'react';
import type { InboxItem as InboxItemType } from '../../types';
import type { Theme } from '../../constants/themes';

interface InboxItemProps {
	item: InboxItemType;
	theme: Theme;
	onNavigate: (item: InboxItemType) => void;
}

const REASON_CONFIG = {
	finished: { icon: '●', color: '#22c55e', label: 'Finished' },
	error: { icon: '●', color: '#ef4444', label: 'Error' },
	waiting_input: { icon: '●', color: '#eab308', label: 'Waiting' },
} as const;

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

export const InboxItemComponent = React.memo(function InboxItemComponent({
	item,
	theme,
	onNavigate,
}: InboxItemProps) {
	const config = REASON_CONFIG[item.reason];

	const handleClick = useCallback(() => {
		onNavigate(item);
	}, [item, onNavigate]);

	const timeAgo = useMemo(() => formatRelativeTime(item.timestamp), [item.timestamp]);

	return (
		<div
			onClick={handleClick}
			style={{
				display: 'flex',
				alignItems: 'center',
				padding: '6px 12px',
				cursor: 'pointer',
				borderRadius: 4,
				gap: 8,
				minHeight: 36,
				backgroundColor: 'transparent',
				transition: 'background-color 0.1s',
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.backgroundColor = theme.colors.backgroundHover;
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.backgroundColor = 'transparent';
			}}
		>
			<span style={{ color: config.color, fontSize: 10, flexShrink: 0 }}>{config.icon}</span>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						color: theme.colors.text,
						fontSize: 12,
						fontWeight: 500,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{item.tabName}
				</div>
				<div
					style={{
						color: theme.colors.textSecondary,
						fontSize: 10,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{item.projectName} · {timeAgo}
				</div>
			</div>
		</div>
	);
});
```

**Step 2: Commit**

```bash
git add src/renderer/components/ProjectSidebar/InboxItem.tsx
git commit -m "feat: add InboxItem component for attention inbox"
```

---

### Task 9: Create InboxSection component

**Files:**
- Create: `src/renderer/components/ProjectSidebar/InboxSection.tsx`

**Step 1: Create the component**

```typescript
/**
 * InboxSection - Collapsible section at the top of the left sidebar.
 * Shows inbox items with count badge and clear button.
 */

import React, { useCallback, useState } from 'react';
import { useInboxStore, selectInboxItems, selectInboxCount } from '../../stores/inboxStore';
import { InboxItemComponent } from './InboxItem';
import type { InboxItem } from '../../types';
import type { Theme } from '../../constants/themes';

interface InboxSectionProps {
	theme: Theme;
	onNavigateToItem: (item: InboxItem) => void;
}

export const InboxSection = React.memo(function InboxSection({
	theme,
	onNavigateToItem,
}: InboxSectionProps) {
	const items = useInboxStore(selectInboxItems);
	const count = useInboxStore(selectInboxCount);
	const clearAll = useInboxStore((s) => s.clearAll);
	const [collapsed, setCollapsed] = useState(false);

	const handleClear = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			clearAll();
		},
		[clearAll]
	);

	const toggleCollapsed = useCallback(() => {
		setCollapsed((prev) => !prev);
	}, []);

	if (count === 0) return null;

	return (
		<div style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
			{/* Header */}
			<div
				onClick={toggleCollapsed}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '8px 12px',
					cursor: 'pointer',
					userSelect: 'none',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
					<span
						style={{
							color: theme.colors.textSecondary,
							fontSize: 10,
							transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
							transition: 'transform 0.15s',
							display: 'inline-block',
						}}
					>
						▼
					</span>
					<span
						style={{
							color: theme.colors.textSecondary,
							fontSize: 11,
							fontWeight: 600,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
						}}
					>
						Inbox
					</span>
					<span
						style={{
							backgroundColor: theme.colors.accent,
							color: theme.colors.background,
							fontSize: 10,
							fontWeight: 700,
							borderRadius: 8,
							padding: '1px 6px',
							minWidth: 16,
							textAlign: 'center',
						}}
					>
						{count}
					</span>
				</div>
				<button
					onClick={handleClear}
					style={{
						background: 'none',
						border: 'none',
						color: theme.colors.textSecondary,
						fontSize: 10,
						cursor: 'pointer',
						padding: '2px 6px',
						borderRadius: 3,
					}}
				>
					Clear
				</button>
			</div>

			{/* Items */}
			{!collapsed && (
				<div style={{ paddingBottom: 4 }}>
					{items.map((item) => (
						<InboxItemComponent
							key={item.id}
							item={item}
							theme={theme}
							onNavigate={onNavigateToItem}
						/>
					))}
				</div>
			)}
		</div>
	);
});
```

**Step 2: Commit**

```bash
git add src/renderer/components/ProjectSidebar/InboxSection.tsx
git commit -m "feat: add InboxSection collapsible sidebar component"
```

---

### Task 10: Create ProjectItem component

**Files:**
- Create: `src/renderer/components/ProjectSidebar/ProjectItem.tsx`

**Step 1: Create the component**

A project row in the sidebar showing: name, session count badge, active highlight, color accent.

```typescript
/**
 * ProjectItem - A single project row in the left sidebar.
 */

import React, { useCallback } from 'react';
import type { Project } from '../../../shared/types';
import type { Theme } from '../../constants/themes';

interface ProjectItemProps {
	project: Project;
	isActive: boolean;
	sessionCount: number;
	theme: Theme;
	onSelect: (projectId: string) => void;
	onContextMenu: (e: React.MouseEvent, projectId: string) => void;
}

export const ProjectItem = React.memo(function ProjectItem({
	project,
	isActive,
	sessionCount,
	theme,
	onSelect,
	onContextMenu,
}: ProjectItemProps) {
	const handleClick = useCallback(() => {
		onSelect(project.id);
	}, [project.id, onSelect]);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			onContextMenu(e, project.id);
		},
		[project.id, onContextMenu]
	);

	return (
		<div
			onClick={handleClick}
			onContextMenu={handleContextMenu}
			style={{
				display: 'flex',
				alignItems: 'center',
				padding: '8px 12px',
				cursor: 'pointer',
				borderRadius: 4,
				borderLeft: project.color ? `3px solid ${project.color}` : '3px solid transparent',
				backgroundColor: isActive ? `${theme.colors.accent}20` : 'transparent',
				boxShadow: isActive ? `inset 2px 0 0 ${theme.colors.accent}` : 'none',
				transition: 'background-color 0.1s',
				gap: 8,
			}}
			onMouseEnter={(e) => {
				if (!isActive) {
					e.currentTarget.style.backgroundColor = theme.colors.backgroundHover;
				}
			}}
			onMouseLeave={(e) => {
				if (!isActive) {
					e.currentTarget.style.backgroundColor = 'transparent';
				}
			}}
		>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						color: isActive ? theme.colors.text : theme.colors.textSecondary,
						fontSize: 13,
						fontWeight: isActive ? 600 : 400,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{project.name}
				</div>
			</div>
			{sessionCount > 0 && (
				<span
					style={{
						color: theme.colors.textSecondary,
						fontSize: 10,
						flexShrink: 0,
					}}
				>
					{sessionCount}
				</span>
			)}
		</div>
	);
});
```

**Step 2: Commit**

```bash
git add src/renderer/components/ProjectSidebar/ProjectItem.tsx
git commit -m "feat: add ProjectItem sidebar component"
```

---

### Task 11: Create ProjectSidebar component

**Files:**
- Create: `src/renderer/components/ProjectSidebar/ProjectSidebar.tsx`
- Create: `src/renderer/components/ProjectSidebar/index.ts`

**Step 1: Create the main sidebar component**

This replaces the existing `SessionList` component. It renders:
1. InboxSection (at top, when items exist)
2. Projects list with session counts

```typescript
/**
 * ProjectSidebar - Left sidebar showing inbox + project list.
 * Replaces the old SessionList component.
 */

import React, { useCallback, useMemo } from 'react';
import { useProjectStore, selectAllProjects } from '../../stores/projectStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useInboxStore } from '../../stores/inboxStore';
import { InboxSection } from './InboxSection';
import { ProjectItem } from './ProjectItem';
import type { InboxItem } from '../../types';
import type { Theme } from '../../constants/themes';

interface ProjectSidebarProps {
	theme: Theme;
	onAddProject: () => void;
}

export const ProjectSidebar = React.memo(function ProjectSidebar({
	theme,
	onAddProject,
}: ProjectSidebarProps) {
	const projects = useProjectStore(selectAllProjects);
	const activeProjectId = useProjectStore((s) => s.activeProjectId);
	const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
	const sessions = useSessionStore((s) => s.sessions);
	const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
	const dismissItem = useInboxStore((s) => s.dismissItem);
	const dismissAllForSession = useInboxStore((s) => s.dismissAllForSession);

	// Count sessions per project
	const sessionCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const session of sessions) {
			if (session.projectId) {
				counts.set(session.projectId, (counts.get(session.projectId) || 0) + 1);
			}
		}
		return counts;
	}, [sessions]);

	const handleSelectProject = useCallback(
		(projectId: string) => {
			setActiveProjectId(projectId);
			// When switching projects, select the first session in the new project
			const projectSessions = sessions.filter((s) => s.projectId === projectId);
			if (projectSessions.length > 0) {
				setActiveSessionId(projectSessions[0].id);
			}
		},
		[setActiveProjectId, setActiveSessionId, sessions]
	);

	const handleNavigateToInboxItem = useCallback(
		(item: InboxItem) => {
			// Switch to the project
			setActiveProjectId(item.projectId);
			// Switch to the session
			setActiveSessionId(item.sessionId);
			// Dismiss the item
			dismissItem(item.id);
			// Also dismiss any other items for this session
			dismissAllForSession(item.sessionId);
		},
		[setActiveProjectId, setActiveSessionId, dismissItem, dismissAllForSession]
	);

	const handleProjectContextMenu = useCallback(
		(e: React.MouseEvent, _projectId: string) => {
			e.preventDefault();
			// TODO: Implement context menu (rename, change color, delete)
		},
		[]
	);

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: '100%',
				overflow: 'hidden',
			}}
		>
			{/* Inbox Section */}
			<InboxSection theme={theme} onNavigateToItem={handleNavigateToInboxItem} />

			{/* Projects Header */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '8px 12px',
				}}
			>
				<span
					style={{
						color: theme.colors.textSecondary,
						fontSize: 11,
						fontWeight: 600,
						textTransform: 'uppercase',
						letterSpacing: '0.05em',
					}}
				>
					Projects
				</span>
				<button
					onClick={onAddProject}
					style={{
						background: 'none',
						border: 'none',
						color: theme.colors.textSecondary,
						fontSize: 16,
						cursor: 'pointer',
						padding: '0 4px',
						lineHeight: 1,
					}}
					title="New Project"
				>
					+
				</button>
			</div>

			{/* Project List */}
			<div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
				{projects.map((project) => (
					<ProjectItem
						key={project.id}
						project={project}
						isActive={project.id === activeProjectId}
						sessionCount={sessionCounts.get(project.id) || 0}
						theme={theme}
						onSelect={handleSelectProject}
						onContextMenu={handleProjectContextMenu}
					/>
				))}

				{projects.length === 0 && (
					<div
						style={{
							color: theme.colors.textSecondary,
							fontSize: 12,
							textAlign: 'center',
							padding: '20px 12px',
						}}
					>
						No projects yet. Click + to add a repo.
					</div>
				)}
			</div>
		</div>
	);
});
```

**Step 2: Create index barrel export**

Create `src/renderer/components/ProjectSidebar/index.ts`:

```typescript
export { ProjectSidebar } from './ProjectSidebar';
```

**Step 3: Commit**

```bash
git add src/renderer/components/ProjectSidebar/
git commit -m "feat: add ProjectSidebar component (inbox + project list)"
```

---

## Phase 6: Inbox Watcher

### Task 12: Create useInboxWatcher hook

**Files:**
- Create: `src/renderer/hooks/useInboxWatcher.ts`
- Test: `src/__tests__/renderer/hooks/useInboxWatcher.test.ts`

**Step 1: Write failing test**

Create `src/__tests__/renderer/hooks/useInboxWatcher.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from '../../../renderer/stores/sessionStore';
import { useInboxStore } from '../../../renderer/stores/inboxStore';
import { useProjectStore } from '../../../renderer/stores/projectStore';
import { shouldCreateInboxItem } from '../../../renderer/hooks/useInboxWatcher';
import type { Session } from '../../../renderer/types';

function createMockSession(overrides: Partial<Session> = {}): Session {
	return {
		id: 'session-1',
		name: 'Test',
		toolType: 'claude-code',
		state: 'idle',
		cwd: '/test',
		fullPath: '/test',
		projectRoot: '/test',
		projectId: 'project-1',
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 0,
		isLive: false,
		changedFiles: [],
		isGitRepo: false,
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		executionQueue: [],
		activeTimeMs: 0,
		aiTabs: [{ id: 'tab-1', name: 'Tab 1', agentSessionId: null, starred: false, logs: [], inputValue: '', stagedImages: [], createdAt: Date.now(), state: 'idle' }],
		activeTabId: 'tab-1',
		closedTabHistory: [],
		filePreviewTabs: [],
		activeFileTabId: null,
		unifiedTabOrder: [],
		unifiedClosedTabHistory: [],
		...overrides,
	} as Session;
}

describe('shouldCreateInboxItem', () => {
	it('returns "finished" when transitioning busy → idle for non-active session', () => {
		const result = shouldCreateInboxItem('busy', 'idle', 'session-1', 'session-2');
		expect(result).toBe('finished');
	});

	it('returns "error" when transitioning busy → error', () => {
		const result = shouldCreateInboxItem('busy', 'error', 'session-1', 'session-2');
		expect(result).toBe('error');
	});

	it('returns "waiting_input" when transitioning to waiting_input', () => {
		const result = shouldCreateInboxItem('busy', 'waiting_input', 'session-1', 'session-2');
		expect(result).toBe('waiting_input');
	});

	it('returns null for active session (user is looking at it)', () => {
		const result = shouldCreateInboxItem('busy', 'idle', 'session-1', 'session-1');
		expect(result).toBeNull();
	});

	it('returns null for non-triggering state transitions', () => {
		expect(shouldCreateInboxItem('idle', 'busy', 's1', 's2')).toBeNull();
		expect(shouldCreateInboxItem('idle', 'connecting', 's1', 's2')).toBeNull();
	});
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/renderer/hooks/useInboxWatcher.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement useInboxWatcher**

Create `src/renderer/hooks/useInboxWatcher.ts`:

```typescript
/**
 * useInboxWatcher - Watches session state transitions and creates inbox items.
 *
 * Triggers:
 * - busy → idle: "finished"
 * - busy → error: "error"
 * - * → waiting_input: "waiting_input"
 *
 * Only for sessions the user is NOT currently looking at.
 */

import { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useProjectStore } from '../stores/projectStore';
import { useInboxStore } from '../stores/inboxStore';
import { generateId } from '../utils/ids';
import type { SessionState, InboxReason } from '../types';

/**
 * Pure function to determine if a state transition should create an inbox item.
 * Exported for testing.
 */
export function shouldCreateInboxItem(
	prevState: string,
	newState: string,
	sessionId: string,
	activeSessionId: string
): InboxReason | null {
	// Don't create items for the session the user is currently viewing
	if (sessionId === activeSessionId) return null;

	// busy → idle = finished
	if (prevState === 'busy' && newState === 'idle') return 'finished';

	// busy → error = error
	if (prevState === 'busy' && newState === 'error') return 'error';

	// * → waiting_input = waiting
	if (newState === 'waiting_input' && prevState !== 'waiting_input') return 'waiting_input';

	return null;
}

export function useInboxWatcher() {
	const prevStates = useRef<Map<string, string>>(new Map());

	useEffect(() => {
		// Subscribe to session store changes
		const unsubscribe = useSessionStore.subscribe((state, prevState) => {
			const activeSessionId = state.activeSessionId;
			const { addItem } = useInboxStore.getState();

			for (const session of state.sessions) {
				const prevSession = prevState.sessions.find((s) => s.id === session.id);
				if (!prevSession) continue;

				const prevSessionState = prevSession.state;
				const newSessionState = session.state;

				if (prevSessionState === newSessionState) continue;

				const reason = shouldCreateInboxItem(
					prevSessionState,
					newSessionState,
					session.id,
					activeSessionId
				);

				if (reason) {
					const project = useProjectStore
						.getState()
						.projects.find((p) => p.id === session.projectId);
					const activeTab = session.aiTabs.find((t) => t.id === session.activeTabId);

					addItem({
						id: generateId(),
						sessionId: session.id,
						tabId: session.activeTabId,
						projectId: session.projectId || '',
						reason,
						agentType: session.toolType,
						tabName: activeTab?.name || session.name,
						projectName: project?.name || 'Unknown',
						timestamp: Date.now(),
					});
				}
			}
		});

		return unsubscribe;
	}, []);
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/renderer/hooks/useInboxWatcher.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/renderer/hooks/useInboxWatcher.ts src/__tests__/renderer/hooks/useInboxWatcher.test.ts
git commit -m "feat: add useInboxWatcher hook for session state → inbox triggers"
```

---

## Phase 7: Wire Into App.tsx

### Task 13: Integrate new sidebar and hooks into App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

This task is the most context-dependent. The changes to App.tsx involve:

**Step 1: Import new stores and hooks**

At the top of App.tsx, add imports:

```typescript
import { useProjectStore, selectActiveProject } from './stores/projectStore';
import { useInboxStore } from './stores/inboxStore';
import { useProjectRestoration } from './hooks/project/useProjectRestoration';
import { useInboxWatcher } from './hooks/useInboxWatcher';
import { ProjectSidebar } from './components/ProjectSidebar';
```

**Step 2: Add hook calls**

Inside the App component body, add:

```typescript
// Project restoration (loads/migrates on startup)
useProjectRestoration();

// Inbox watcher (creates inbox items on session state transitions)
useInboxWatcher();

// Project state
const activeProject = useProjectStore(selectActiveProject);
```

**Step 3: Add "New Project" handler**

```typescript
const handleAddProject = useCallback(async () => {
	const result = await window.maestro.dialog.showOpenDialog({
		properties: ['openDirectory'],
		title: 'Select a repository folder',
	});
	if (result.canceled || result.filePaths.length === 0) return;

	const repoPath = result.filePaths[0];
	const folderName = repoPath.split(/[\\/]/).filter(Boolean).pop() || 'New Project';

	const project = {
		id: generateId(),
		name: folderName,
		repoPath,
		createdAt: Date.now(),
	};

	useProjectStore.getState().addProject(project);
	useProjectStore.getState().setActiveProjectId(project.id);
}, []);
```

**Step 4: Replace SessionList with ProjectSidebar in JSX**

Find where `<SessionList` is rendered in the JSX (around line 2440). Replace it with:

```tsx
<ProjectSidebar theme={theme} onAddProject={handleAddProject} />
```

Keep the existing sidebar wrapper/container div — just swap the inner component.

**Step 5: Auto-dismiss inbox items on session navigation**

In the existing `setActiveSessionId` handler (wherever it's wrapped in App.tsx), add inbox dismissal:

```typescript
const setActiveSessionId = useCallback((id: string) => {
	setActiveGroupChatId(null);
	storeSetActiveSessionId(id);
	// Auto-dismiss inbox items for the session we're navigating to
	useInboxStore.getState().dismissAllForSession(id);
}, [storeSetActiveSessionId, setActiveGroupChatId]);
```

**Step 6: Scope session cycling (Cmd+J/K) to active project**

Find where session cycling logic reads `sessions` (likely filtering by visible sessions). Update to filter by active project:

```typescript
const activeProjectId = useProjectStore.getState().activeProjectId;
const cycleSessions = sessions.filter((s) => s.projectId === activeProjectId);
```

**Step 7: Ensure new sessions get projectId**

Find where new sessions are created (the `addNewSession` handler). Add `projectId` from the active project:

```typescript
const activeProjectId = useProjectStore.getState().activeProjectId;
// In the new session object:
const newSession = {
	...defaultSessionFields,
	projectId: activeProjectId,
	// ... rest of fields
};
```

**Step 8: Test manually**

```bash
npm run dev:win
```

Verify:
1. Left sidebar shows Inbox (if items exist) + Projects list
2. Clicking a project highlights it and shows its sessions in the tab bar
3. New sessions are created within the active project
4. Session state changes in non-active sessions create inbox items

**Step 9: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire ProjectSidebar, inbox watcher, and project restoration into App"
```

---

## Phase 8: Keyboard Shortcuts

### Task 14: Add project navigation shortcuts

**Files:**
- Modify: `src/renderer/constants/shortcuts.ts`
- Modify: `src/renderer/App.tsx` (keyboard handler)

**Step 1: Add new shortcut definitions**

In `src/renderer/constants/shortcuts.ts`, add to `DEFAULT_SHORTCUTS`:

```typescript
cycleProjectPrev: {
	id: 'cycleProjectPrev',
	label: 'Previous Project',
	keys: ['Ctrl', 'Shift', '['],
},
cycleProjectNext: {
	id: 'cycleProjectNext',
	label: 'Next Project',
	keys: ['Ctrl', 'Shift', ']'],
},
focusInbox: {
	id: 'focusInbox',
	label: 'Focus Inbox',
	keys: ['Ctrl', 'i'],
},
newProject: {
	id: 'newProject',
	label: 'New Project',
	keys: ['Ctrl', 'Shift', 'n'],
},
```

**Step 2: Wire keyboard handlers in App.tsx**

In the keyboard handler section of App.tsx (find where existing shortcuts like `cyclePrev` are handled), add:

```typescript
// Cycle projects
if (matchesShortcut('cycleProjectNext', e)) {
	e.preventDefault();
	const { projects, activeProjectId, setActiveProjectId } = useProjectStore.getState();
	const idx = projects.findIndex((p) => p.id === activeProjectId);
	const next = (idx + 1) % projects.length;
	if (projects[next]) {
		setActiveProjectId(projects[next].id);
		// Also select first session in that project
		const projectSessions = sessions.filter((s) => s.projectId === projects[next].id);
		if (projectSessions.length > 0) {
			setActiveSessionId(projectSessions[0].id);
		}
	}
}

if (matchesShortcut('cycleProjectPrev', e)) {
	e.preventDefault();
	const { projects, activeProjectId, setActiveProjectId } = useProjectStore.getState();
	const idx = projects.findIndex((p) => p.id === activeProjectId);
	const prev = (idx - 1 + projects.length) % projects.length;
	if (projects[prev]) {
		setActiveProjectId(projects[prev].id);
		const projectSessions = sessions.filter((s) => s.projectId === projects[prev].id);
		if (projectSessions.length > 0) {
			setActiveSessionId(projectSessions[0].id);
		}
	}
}

if (matchesShortcut('newProject', e)) {
	e.preventDefault();
	handleAddProject();
}
```

**Step 3: Commit**

```bash
git add src/renderer/constants/shortcuts.ts src/renderer/App.tsx
git commit -m "feat: add keyboard shortcuts for project cycling and inbox focus"
```

---

## Phase 9: Cleanup — Remove Dead Code

### Task 15: Remove group and bookmark code from sessionStore

**Files:**
- Modify: `src/renderer/stores/sessionStore.ts`
- Modify: `src/__tests__/renderer/stores/sessionStore.test.ts`

**Step 1: Remove from store**

In `src/renderer/stores/sessionStore.ts`:

1. Remove `groups: Group[]` from state (line 28)
2. Remove group actions: `setGroups`, `addGroup`, `removeGroup`, `updateGroup`, `toggleGroupCollapsed` (lines 84-96, 204-237)
3. Remove bookmark action: `toggleBookmark` (lines 245-250)
4. Remove group selectors: `selectSessionsByGroup`, `selectUngroupedSessions`, `selectGroupById` (lines 348-371)
5. Remove bookmark selector: `selectBookmarkedSessions` (lines 339-340)
6. Remove group-related entries from `getSessionActions` (lines 430-434)
7. Remove `Group` import from types

**Step 2: Update test file**

In `src/__tests__/renderer/stores/sessionStore.test.ts`:

1. Remove imports for deleted selectors (`selectBookmarkedSessions`, `selectSessionsByGroup`, `selectUngroupedSessions`, `selectGroupById`)
2. Remove all test cases that test group or bookmark functionality
3. Remove `Group` import

**Step 3: Run tests**

```bash
npx vitest run src/__tests__/renderer/stores/sessionStore.test.ts
```

Expected: ALL PASS (remaining tests).

**Step 4: Commit**

```bash
git add src/renderer/stores/sessionStore.ts src/__tests__/renderer/stores/sessionStore.test.ts
git commit -m "refactor: remove group and bookmark code from sessionStore"
```

---

### Task 16: Remove group references across the codebase

**Files:** Multiple files — search and replace.

**Step 1: Find all group references**

```bash
# Find all files referencing groupId, Group type, group store actions
npx grep -rn "groupId\|setGroups\|addGroup\|removeGroup\|toggleGroupCollapsed\|selectSessionsByGroup\|selectBookmarkedSessions\|selectUngroupedSessions" src/renderer/ --include="*.ts" --include="*.tsx"
```

**Step 2: Remove group references systematically**

For each file:
- Remove group-related imports
- Remove group-related props
- Remove group-related state hooks
- Remove group-related callbacks
- Remove group-related JSX

Key files to check:
- `src/renderer/App.tsx` — remove `groups` state, `setGroups`, group handler functions, group-related props
- `src/renderer/components/SessionList/` — this entire directory is being replaced (skip if already swapped out)
- `src/renderer/hooks/session/useSessionRestoration.ts` — remove `groups.getAll()` call (migration handles it now)
- `src/renderer/hooks/settings/useDebouncedPersistence.ts` — remove groups persistence effect

**Step 3: Run full test suite**

```bash
npx vitest run
```

Fix any failures caused by removed references.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove group and bookmark references across renderer"
```

---

### Task 17: Remove Group type from shared types

**Files:**
- Modify: `src/shared/types.ts` — remove `Group` interface
- Modify: `src/main/stores/types.ts` — remove `GroupsData` and `Group` imports
- Modify: `src/main/ipc/handlers/persistence.ts` — remove group IPC handlers (or leave inert for backward compat)
- Modify: `src/main/preload/settings.ts` — remove `createGroupsApi` (or leave inert)

**Step 1: Comment out or remove Group-related code**

Since the migration hook still reads `groups:getAll` once, keep the IPC handler alive but mark it as deprecated. After a few releases, remove entirely.

In `src/shared/types.ts`, add deprecation comment:

```typescript
/** @deprecated Replaced by Project. Kept for migration compatibility. */
export interface Group {
	id: string;
	name: string;
	emoji: string;
	collapsed: boolean;
}
```

**Step 2: Run tests**

```bash
npx vitest run
```

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: deprecate Group type, keep for migration compatibility"
```

---

## Phase 10: Final Integration & Manual Testing

### Task 18: Full integration test

**Step 1: Start the app**

```bash
npm run dev:win
```

**Step 2: Verify core flows**

Checklist:
- [ ] App starts without errors
- [ ] If first run after migration: groups are converted to projects, sessions get projectIds
- [ ] Left sidebar shows Inbox section (only when items exist) and Projects section
- [ ] Clicking "+" opens folder picker, creates a project
- [ ] Clicking a project selects it, tab bar shows its sessions
- [ ] Creating a new session (Cmd+N) adds it to the active project
- [ ] Session state transitions (busy→idle) create inbox items for non-active sessions
- [ ] Clicking an inbox item navigates to that project + session and dismisses the item
- [ ] Clear button dismisses all inbox items
- [ ] Ctrl+Shift+[ / ] cycles between projects
- [ ] Cmd+[ / ] cycles between sessions within the active project
- [ ] Group chat can be created within a project
- [ ] Settings persist across restart (projects saved and restored)

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete project-centric navigation with inbox"
```

---

## Summary of All Tasks

| # | Task | Phase | Files Changed |
|---|------|-------|---------------|
| 1 | Add Project/InboxItem types | Data Model | types, shared/types, stores/types |
| 2 | Create projectStore | Stores | projectStore.ts + test |
| 3 | Create inboxStore | Stores | inboxStore.ts + test |
| 4 | Add selectSessionsByProject | Stores | sessionStore.ts + test |
| 5 | Add projects electron-store + IPC | Persistence | stores/*, persistence.ts, index.ts |
| 6 | Add projects preload bridge | Persistence | preload/settings.ts, preload/index.ts |
| 7 | Create useProjectRestoration | Migration | useProjectRestoration.ts |
| 8 | Create InboxItem component | UI | InboxItem.tsx |
| 9 | Create InboxSection component | UI | InboxSection.tsx |
| 10 | Create ProjectItem component | UI | ProjectItem.tsx |
| 11 | Create ProjectSidebar component | UI | ProjectSidebar.tsx, index.ts |
| 12 | Create useInboxWatcher hook | Inbox | useInboxWatcher.ts + test |
| 13 | Wire into App.tsx | Integration | App.tsx |
| 14 | Add keyboard shortcuts | Shortcuts | shortcuts.ts, App.tsx |
| 15 | Remove group/bookmark from store | Cleanup | sessionStore.ts + test |
| 16 | Remove group refs across codebase | Cleanup | Multiple files |
| 17 | Deprecate Group type | Cleanup | shared/types.ts, stores/types.ts |
| 18 | Full integration test | Testing | Manual verification |
