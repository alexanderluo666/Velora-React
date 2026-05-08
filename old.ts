import './style.css';

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('Missing #app');
const app: HTMLDivElement = appElement;

const STORAGE_VERSION = 3;
const STORAGE_KEY = 'velora';
const STORAGE_BACKUP_KEY = 'velora:backup';
const STORAGE_RECOVERY_KEY = 'velora:recovery';
const SEARCH_DEBOUNCE_MS = 1000;
const SAVE_DEBOUNCE_MS = 250;
const GENERAL_TAG = 'General';
const FOCUS_WINDOW_MS = 24 * 60 * 60 * 1000;

type Priority = 'low' | 'medium' | 'high';
type TaskFilterStatus = 'all' | 'active' | 'completed';
type SortMode = 'manual' | 'newest' | 'oldest' | 'incomplete' | 'priority';

type Task = {
    id: string;
    title: string;
    completed: boolean;
    tags: string[];
    createdAt: number;
    priority: Priority;
    focusPinned: boolean;
    order: number;
};

type PersistedState = {
    version: number;
    selectedInterests: string[];
    tasks: Task[];
    onboardingFinished: boolean;
    ui: {
        taskFilterStatus: TaskFilterStatus;
        taskFilterTags: string[];
        searchQuery: string;
        sortMode: SortMode;
        focusMode: boolean;
    };
};

type LegacyStorageData = {
    version?: number;
    selectedInterests?: unknown;
    tasks?: unknown;
    onboardingFinished?: unknown;
    taskFilterStatus?: unknown;
    taskFilterTag?: unknown;
    taskFilterTags?: unknown;
    searchQuery?: unknown;
    sortMode?: unknown;
    focusMode?: unknown;
    ui?: Partial<PersistedState['ui']>;
};

type DraftState = {
    newTask: string;
    newInterest: string;
    newTaskPriority: Priority;
    newTaskTags: string[];
};

type EditingState = {
    taskId: string | null;
    title: string;
    priority: Priority;
    tags: string[];
    focusPinned: boolean;
};

type UIState = PersistedState['ui'] & {
    searchInputValue: string;
    pendingFocusSelector: string | null;
    draggingTaskId: string | null;
    dropTargetTaskId: string | null;
    dropPosition: 'before' | 'after' | null;
};

type AppState = {
    selectedInterests: string[];
    tasks: Task[];
    onboardingFinished: boolean;
    drafts: DraftState;
    editing: EditingState;
    ui: UIState;
};

type TagSummary = {
    name: string;
    count: number;
    accent: string;
};

type RankedTask = {
    task: Task;
    searchScore: number;
    focusScore: number;
};

const starterInterests = [
    'Studying',
    'Gaming',
    'Developing',
    'Fitness',
    'Reading',
    'Art',
    'Music',
    'Math',
    'AI'
];

const priorityRank: Record<Priority, number> = {
    low: 0,
    medium: 1,
    high: 2
};

const defaultPersistedState: PersistedState = {
    version: STORAGE_VERSION,
    selectedInterests: [],
    tasks: [],
    onboardingFinished: false,
    ui: {
        taskFilterStatus: 'all',
        taskFilterTags: [],
        searchQuery: '',
        sortMode: 'manual',
        focusMode: false
    }
};

const state: AppState = {
    selectedInterests: [],
    tasks: [],
    onboardingFinished: false,
    drafts: {
        newTask: '',
        newInterest: '',
        newTaskPriority: 'medium',
        newTaskTags: []
    },
    editing: {
        taskId: null,
        title: '',
        priority: 'medium',
        tags: [],
        focusPinned: false
    },
    ui: {
        taskFilterStatus: 'all',
        taskFilterTags: [],
        searchQuery: '',
        searchInputValue: '',
        sortMode: 'manual',
        focusMode: false,
        pendingFocusSelector: null,
        draggingTaskId: null,
        dropTargetTaskId: null,
        dropPosition: null
    }
};

let searchDebounceId: number | null = null;
let saveDebounceId: number | null = null;
let lastSavedSnapshot = '';
let isDragging = false;

function render() {
    if (state.onboardingFinished) {
        renderPlanner();
    } else {
        renderWelcome();
    }
    setupEvents();
    restorePendingFocus();
}


function renderWelcome() {
    app.innerHTML = `
    <div class="welcome-screen">
        <div class="welcome-card">
            <div class="welcome-header">
                <h1 class="welcome-title">✨ Velora</h1>
                <p class="welcome-subtitle">Organize your life around what matters</p>
            </div>

            <div class="welcome-content">
                <p class="interests-prompt">Select your interests to get started</p>

                <div class="interest-grid">
                    ${starterInterests.map((interest) => `
                        <button
                            class="interest-btn ${state.selectedInterests.includes(interest) ? 'selected' : ''}"
                            data-interest="${escapeAttr(interest)}"
                            title="Toggle ${escapeAttr(interest)}"
                        >
                            ${escapeHtml(interest)}
                        </button>
                    `).join('')}
                </div>

                <div class="divider">or add your own</div>

                <div class="custom-box">
                    <input
                        id="interest-input"
                        type="text"
                        placeholder="Custom interest..."
                        value="${escapeAttr(state.drafts.newInterest)}"
                        aria-label="Add custom interest"
                    />
                    <button class="primary-btn" id="add-interest" title="Add custom interest">
                        Add
                    </button>
                </div>
            </div>

            <button class="primary-btn continue-btn" ${state.selectedInterests.length === 0 ? 'disabled' : ''}>
                Continue →
            </button>
        </div>
    </div>
    `;
}

function renderPlanner() {
    const completedCount = state.tasks.filter((task) => task.completed).length;
    const totalCount = state.tasks.length;

    app.innerHTML = `
    <div class="planner">
        ${renderSidebar(completedCount, totalCount)}
        ${renderMainContent(completedCount, totalCount)}
    </div>
    `;
}

function renderSidebar(completedCount: number, totalCount: number): string {
    const tagSummaries = getTagSummaries();

    return `
    <aside class="sidebar">
        <div class="sidebar-header">
            <h2 class="logo">✨ Velora</h2>
            <div class="progress-indicator">${completedCount}/${totalCount}</div>
        </div>

        <div class="sidebar-section">
            <h3 class="section-title">Your Interests</h3>

            ${tagSummaries.length === 0 ? `
                <p class="empty-state-text">No interests yet</p>
            ` : `
                <div class="tags">
                    ${tagSummaries.map((tag) => `
                        <div class="tag" style="--tag-accent: ${tag.accent}">
                            <span class="tag-dot"></span>
                            <span>${escapeHtml(tag.name)}</span>
                            <span class="tag-count">${tag.count}</span>
                            <button class="tag-remove" data-interest="${escapeAttr(tag.name)}" title="Remove ${escapeAttr(tag.name)}">
                                ×
                            </button>
                        </div>
                    `).join('')}
                </div>
            `}

            <div class="custom-box compact">
                <input
                    id="planner-interest"
                    type="text"
                    placeholder="Add interest..."
                    value="${escapeAttr(state.drafts.newInterest)}"
                    aria-label="Add new interest"
                />
                <button class="primary-btn icon-btn" id="add-planner-interest" title="Add interest">
                    +
                </button>
            </div>
        </div>
    </aside>
    `;
}

function renderMainContent(completedCount: number, totalCount: number): string {
    const visibleTasks = getVisibleTasks();
    const tagSummaries = getTagSummaries();
    const availableTags = tagSummaries.map((tag) => tag.name);
    const matchingTasks = visibleTasks.length;
    const searchPending = state.ui.searchInputValue !== state.ui.searchQuery;
    const suggestedTags = getSuggestedTags(state.drafts.newTask);
    const dragEnabled = canDragReorder();

    return `
    <main class="main">
        <div class="main-header">
            <div>
                <h2>Today's Tasks</h2>
                <p class="task-count">${completedCount}/${totalCount} completed</p>
            </div>
            <button class="filter-btn ${state.ui.focusMode ? 'active' : ''}" id="focus-mode-toggle" title="Toggle Today Focus mode">
                Focus Mode ${state.ui.focusMode ? 'On' : 'Off'}
            </button>
        </div>

        <div class="task-input-section">
            <div class="custom-box search-box">
                <input
                    id="search-input"
                    type="search"
                    placeholder="Search tasks..."
                    value="${escapeAttr(state.ui.searchInputValue)}"
                    aria-label="Search tasks"
                />
            </div>
            <p class="search-hint">${searchPending ? 'Updating results after 1 second of inactivity...' : 'Search supports fuzzy matching and ranked results.'}</p>

            <div class="filter-row">
                <div class="filter-group" role="group" aria-label="Status filters">
                    <button class="filter-btn ${state.ui.taskFilterStatus === 'all' ? 'active' : ''}" data-filter-status="all">All</button>
                    <button class="filter-btn ${state.ui.taskFilterStatus === 'active' ? 'active' : ''}" data-filter-status="active">Active</button>
                    <button class="filter-btn ${state.ui.taskFilterStatus === 'completed' ? 'active' : ''}" data-filter-status="completed">Completed</button>
                </div>
                <select id="sort-select" class="tag-select" aria-label="Sort tasks">
                    <option value="manual" ${state.ui.sortMode === 'manual' ? 'selected' : ''}>Manual order</option>
                    <option value="newest" ${state.ui.sortMode === 'newest' ? 'selected' : ''}>Newest</option>
                    <option value="oldest" ${state.ui.sortMode === 'oldest' ? 'selected' : ''}>Oldest</option>
                    <option value="incomplete" ${state.ui.sortMode === 'incomplete' ? 'selected' : ''}>Incomplete first</option>
                    <option value="priority" ${state.ui.sortMode === 'priority' ? 'selected' : ''}>Priority first</option>
                </select>
            </div>

            <div class="focus-summary">
                ${state.ui.focusMode
                    ? 'Focus Mode surfaces pinned tasks first, then high-priority or recent incomplete tasks.'
                    : dragEnabled
                        ? 'Manual order is active. Drag tasks with the dotted handle to reorder them.'
                        : 'Switch to Manual order with no active search to drag and reorder tasks.'}
            </div>

            <div class="chip-section">
                <span class="chip-section-label">Filter tags</span>
                <div class="chip-row">
                    <button class="chip ${state.ui.taskFilterTags.length === 0 ? 'selected' : ''}" data-chip-group="filter" data-chip-value="">
                        All tags
                    </button>
                    ${tagSummaries.map((tag) => `
                        <button
                            class="chip ${state.ui.taskFilterTags.includes(tag.name) ? 'selected' : ''}"
                            data-chip-group="filter"
                            data-chip-value="${escapeAttr(tag.name)}"
                            style="--tag-accent: ${tag.accent}"
                        >
                            <span>${escapeHtml(tag.name)}</span>
                            <span class="chip-count">${tag.count}</span>
                        </button>
                    `).join('')}
                </div>
            </div>

            <div class="task-creator">
                <div class="custom-box">
                    <input
                        id="task-input"
                        type="text"
                        placeholder="What needs to be done?"
                        value="${escapeAttr(state.drafts.newTask)}"
                        aria-label="Add new task"
                    />
                    <select id="task-priority-select" class="tag-select" aria-label="Select task priority">
                        <option value="low" ${state.drafts.newTaskPriority === 'low' ? 'selected' : ''}>Low priority</option>
                        <option value="medium" ${state.drafts.newTaskPriority === 'medium' ? 'selected' : ''}>Medium priority</option>
                        <option value="high" ${state.drafts.newTaskPriority === 'high' ? 'selected' : ''}>High priority</option>
                    </select>
                    <button class="primary-btn" id="add-task" title="Add task">
                        Add Task
                    </button>
                </div>

                ${suggestedTags.length > 0 ? `
                    <div class="chip-section">
                        <span class="chip-section-label">Suggested tags</span>
                        <div class="chip-row">
                            ${suggestedTags.map((tag) => `
                                <button
                                    class="chip suggested-chip ${state.drafts.newTaskTags.includes(tag.name) ? 'selected' : ''}"
                                    data-chip-group="create"
                                    data-chip-value="${escapeAttr(tag.name)}"
                                    style="--tag-accent: ${tag.accent}"
                                >
                                    <span>${escapeHtml(tag.name)}</span>
                                    <span class="chip-count">${tag.count}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <div class="chip-section">
                    <span class="chip-section-label">Task tags</span>
                    <div class="chip-row">
                        ${tagSummaries.map((tag) => `
                            <button
                                class="chip ${state.drafts.newTaskTags.includes(tag.name) ? 'selected' : ''}"
                                data-chip-group="create"
                                data-chip-value="${escapeAttr(tag.name)}"
                                style="--tag-accent: ${tag.accent}"
                            >
                                <span>${escapeHtml(tag.name)}</span>
                                <span class="chip-count">${tag.count}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>

        ${dragEnabled ? `
            <div class="manual-order-banner">
                <span class="manual-order-badge">Manual Order</span>
                <span>Use the ` + "≡" + ` handle on the left of each task and drop above or below another task.</span>
            </div>
        ` : ''}

        <div class="task-list ${dragEnabled ? 'drag-enabled-list' : ''}">
            ${renderTaskList(visibleTasks, matchingTasks, availableTags)}
        </div>
    </main>
    `;
}

function renderTaskList(visibleTasks: Task[], matchingTasks: number, availableTags: string[]): string {
    if (state.tasks.length === 0) {
        return `
        <div class="empty-state">
            <div class="empty-icon">📝</div>
            <p>No tasks yet. Add one to get started.</p>
        </div>
        `;
    }

    if (matchingTasks === 0) {
        return `
        <div class="empty-state">
            <div class="empty-icon">${state.ui.focusMode ? '🎯' : '🔍'}</div>
            <p>${state.ui.focusMode ? 'No tasks qualify for Focus Mode right now.' : 'No tasks match your current filters.'}</p>
        </div>
        `;
    }

    return visibleTasks.map((task) => renderTask(task, availableTags)).join('');
}

function renderTask(task: Task, availableTags: string[]): string {
    const tagSummaries = getTagSummaries();
    const dragEnabled = canDragReorder();

    if (state.editing.taskId === task.id) {
        return `
        <div class="task ${task.completed ? 'done' : ''}" data-task-id="${task.id}">
            <div class="task-edit-mode">
                <input
                    type="text"
                    class="edit-task-input"
                    value="${escapeAttr(state.editing.title)}"
                    placeholder="Task title..."
                />
                <select class="edit-task-priority" aria-label="Edit task priority">
                    <option value="low" ${state.editing.priority === 'low' ? 'selected' : ''}>Low</option>
                    <option value="medium" ${state.editing.priority === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="high" ${state.editing.priority === 'high' ? 'selected' : ''}>High</option>
                </select>
                <button class="ghost-btn focus-chip-toggle ${state.editing.focusPinned ? 'active' : ''}" title="Pin to Today Focus">
                    ${state.editing.focusPinned ? 'Pinned to Focus' : 'Pin to Focus'}
                </button>
                <div class="chip-row edit-chip-row">
                    ${tagSummaries
                        .filter((tag) => availableTags.includes(tag.name))
                        .map((tag) => `
                            <button
                                class="chip ${state.editing.tags.includes(tag.name) ? 'selected' : ''}"
                                data-chip-group="edit"
                                data-chip-value="${escapeAttr(tag.name)}"
                                style="--tag-accent: ${tag.accent}"
                            >
                                <span>${escapeHtml(tag.name)}</span>
                                <span class="chip-count">${tag.count}</span>
                            </button>
                        `).join('')}
                </div>
                <button class="primary-btn save-edit" data-task-id="${task.id}" title="Save changes">
                    Save
                </button>
                <button class="ghost-btn cancel-edit" title="Cancel editing">
                    Cancel
                </button>
            </div>
        </div>
        `;
    }

    const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
    const focusScore = getFocusScore(task);
    const tagMarkup = task.tags.map((tag) => {
        const accent = getTagAccent(tag);
        return `
            <span class="task-tag" style="--tag-accent: ${accent}">
                <span class="tag-dot"></span>
                ${escapeHtml(tag)}
            </span>
        `;
    }).join('');

    const dropClass = state.ui.dropTargetTaskId === task.id && state.ui.dropPosition
        ? `drag-over-${state.ui.dropPosition}`
        : '';

    return `
    <div
        class="task ${task.completed ? 'done' : ''} priority-${task.priority} ${dragEnabled ? 'drag-enabled-task' : ''} ${dropClass}"
        data-task-id="${task.id}"
    >
        <div class="task-content">
            ${dragEnabled ? `
                <div
                    class="drag-handle"
                    data-drag-handle="true"
                    data-task-id="${task.id}"
                    title="Drag to reorder"
                    aria-label="Drag to reorder"
                    draggable="true"
                >
                    ≡
                </div>
            ` : ''}
            <button class="task-checkbox" data-task-id="${task.id}" title="${task.completed ? 'Mark incomplete' : 'Mark complete'}">
                ${task.completed ? '✓' : ''}
            </button>
            <div class="task-text">
                <div class="task-title-row">
                    <h3>${escapeHtml(task.title)}</h3>
                    <span class="priority-badge priority-badge-${task.priority}">${priorityLabel}</span>
                    ${task.focusPinned ? '<span class="focus-badge">Pinned</span>' : ''}
                    ${state.ui.focusMode ? `<span class="focus-score">Focus ${focusScore}</span>` : ''}
                </div>
                <div class="task-meta">
                    ${tagMarkup}
                </div>
            </div>
        </div>
        <div class="task-actions">
            <button class="ghost-btn focus-btn ${task.focusPinned ? 'active' : ''}" data-task-id="${task.id}" title="Toggle Today Focus pin">
                ${task.focusPinned ? 'Unfocus' : 'Focus'}
            </button>
            <button class="ghost-btn edit-btn" data-task-id="${task.id}" title="Edit task">
                ✎
            </button>
            <button class="danger-btn delete" data-task-id="${task.id}" title="Delete task">
                ✕
            </button>
        </div>
    </div>
    `;
}

function createPersistedSnapshot(): PersistedState {
    return {
        version: STORAGE_VERSION,
        selectedInterests: [...state.selectedInterests],
        tasks: state.tasks.map((task) => ({
            ...task,
            tags: [...task.tags]
        })),
        onboardingFinished: state.onboardingFinished,
        ui: {
            taskFilterStatus: state.ui.taskFilterStatus,
            taskFilterTags: [...state.ui.taskFilterTags],
            searchQuery: state.ui.searchQuery,
            sortMode: state.ui.sortMode,
            focusMode: state.ui.focusMode
        }
    };
}

function scheduleSave() {
    const snapshot = JSON.stringify(createPersistedSnapshot());
    if (snapshot === lastSavedSnapshot) return;

    if (saveDebounceId !== null) {
        window.clearTimeout(saveDebounceId);
    }

    saveDebounceId = window.setTimeout(() => {
        persistSnapshot(snapshot);
        saveDebounceId = null;
    }, SAVE_DEBOUNCE_MS);
}

function persistSnapshot(snapshot: string) {
    try {
        const previous = localStorage.getItem(STORAGE_KEY);
        if (previous && previous !== snapshot) {
            localStorage.setItem(STORAGE_BACKUP_KEY, previous);
        }
        localStorage.setItem(STORAGE_KEY, snapshot);
        lastSavedSnapshot = snapshot;
    } catch (error) {
        console.error('Failed to save data:', error);
        try {
            localStorage.setItem(STORAGE_BACKUP_KEY, snapshot);
        } catch (backupError) {
            console.error('Failed to save backup data:', backupError);
        }
    }
}

function flushSave() {
    if (saveDebounceId === null) return;
    window.clearTimeout(saveDebounceId);
    saveDebounceId = null;
    persistSnapshot(JSON.stringify(createPersistedSnapshot()));
}

function loadState() {
    const loaded = readPersistedState();
    applyPersistedState(loaded);
    state.ui.searchInputValue = state.ui.searchQuery;
    lastSavedSnapshot = JSON.stringify(createPersistedSnapshot());
}

function readPersistedState(): PersistedState {
    const primary = safeParseStorage(STORAGE_KEY);
    if (primary) {
        const migrated = migratePersistedState(primary);
        if (migrated) return migrated;
        preserveRecoveryCopy(STORAGE_KEY, primary);
    }

    const backup = safeParseStorage(STORAGE_BACKUP_KEY);
    if (backup) {
        const migrated = migratePersistedState(backup);
        if (migrated) {
            persistSnapshot(JSON.stringify(migrated));
            return migrated;
        }
        preserveRecoveryCopy(STORAGE_BACKUP_KEY, backup);
    }

    return structuredClone(defaultPersistedState);
}

function safeParseStorage(key: string): unknown | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error(`Failed to parse storage key "${key}":`, error);
        return null;
    }
}

function preserveRecoveryCopy(sourceKey: string, raw: unknown) {
    try {
        localStorage.setItem(STORAGE_RECOVERY_KEY, JSON.stringify({
            sourceKey,
            savedAt: new Date().toISOString(),
            raw
        }));
    } catch (error) {
        console.error('Failed to preserve recovery copy:', error);
    }
}

function migratePersistedState(raw: unknown): PersistedState | null {
    if (!raw || typeof raw !== 'object') return null;

    const legacy = raw as LegacyStorageData;
    const detectedVersion = typeof legacy.version === 'number' ? legacy.version : 1;
    if (detectedVersion > STORAGE_VERSION) return null;

    const selectedInterests = dedupeStrings(asStringArray(legacy.selectedInterests));
    const tasks = Array.isArray(legacy.tasks)
        ? legacy.tasks
            .map((task, index) => normalizeTask(task, index))
            .filter((task): task is Task => task !== null)
        : [];

    const legacyUi = legacy.ui ?? {};
    const taskFilterStatus = normalizeTaskFilterStatus(legacyUi.taskFilterStatus ?? legacy.taskFilterStatus);
    const taskFilterTags = normalizeTaskFilterTags(legacyUi.taskFilterTags ?? legacy.taskFilterTags, legacy.taskFilterTag);
    const searchQuery = typeof (legacyUi.searchQuery ?? legacy.searchQuery) === 'string'
        ? (legacyUi.searchQuery ?? legacy.searchQuery) as string
        : '';
    const sortMode = normalizeSortMode(legacyUi.sortMode ?? legacy.sortMode);
    const focusMode = Boolean(legacyUi.focusMode ?? legacy.focusMode);

    return {
        version: STORAGE_VERSION,
        selectedInterests,
        tasks: normalizeTaskOrder(tasks),
        onboardingFinished: Boolean(legacy.onboardingFinished),
        ui: {
            taskFilterStatus,
            taskFilterTags,
            searchQuery,
            sortMode,
            focusMode
        }
    };
}

function applyPersistedState(persisted: PersistedState) {
    state.selectedInterests = [...persisted.selectedInterests];
    state.tasks = normalizeTaskOrder(persisted.tasks.map((task) => ({
        ...task,
        tags: [...task.tags]
    })));
    state.onboardingFinished = persisted.onboardingFinished;
    state.ui.taskFilterStatus = persisted.ui.taskFilterStatus;
    state.ui.taskFilterTags = [...persisted.ui.taskFilterTags];
    state.ui.searchQuery = persisted.ui.searchQuery;
    state.ui.sortMode = persisted.ui.sortMode;
    state.ui.focusMode = persisted.ui.focusMode;
}

function normalizeTask(raw: unknown, fallbackOrder = 0): Task | null {
    if (!raw || typeof raw !== 'object') return null;

    const task = raw as Record<string, unknown>;
    const title = typeof task.title === 'string' ? task.title.trim() : '';
    const id = typeof task.id === 'string' ? task.id : '';
    if (!id || !title) return null;

    const rawTags = Array.isArray(task.tags)
        ? task.tags
        : typeof task.tag === 'string'
            ? [task.tag]
            : [];

    const tags = dedupeStrings(
        rawTags
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim())
            .filter(Boolean)
    );

    return {
        id,
        title,
        completed: Boolean(task.completed),
        tags: tags.length > 0 ? tags : [GENERAL_TAG],
        createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
        priority: normalizePriority(task.priority),
        focusPinned: Boolean(task.focusPinned),
        order: typeof task.order === 'number' ? task.order : fallbackOrder
    };
}

function normalizeTaskOrder(tasks: Task[]): Task[] {
    return [...tasks]
        .sort((left, right) => left.order - right.order)
        .map((task, index) => ({ ...task, order: index }));
}

function normalizeTaskFilterStatus(value: unknown): TaskFilterStatus {
    return value === 'active' || value === 'completed' ? value : 'all';
}

function normalizeSortMode(value: unknown): SortMode {
    return value === 'newest' || value === 'oldest' || value === 'incomplete' || value === 'priority'
        ? value
        : 'manual';
}

function normalizePriority(value: unknown): Priority {
    return value === 'low' || value === 'high' ? value : 'medium';
}

function normalizeTaskFilterTags(candidate: unknown, legacyCandidate?: unknown): string[] {
    const tags = Array.isArray(candidate)
        ? candidate
        : typeof legacyCandidate === 'string' && legacyCandidate !== 'All'
            ? [legacyCandidate]
            : [];

    return dedupeStrings(tags.filter((tag): tag is string => typeof tag === 'string'));
}

function asStringArray(candidate: unknown): string[] {
    return Array.isArray(candidate)
        ? candidate.filter((value): value is string => typeof value === 'string')
        : [];
}

function addTask(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;

    const availableTags = getAvailableTaskTags();
    const suggestedTags = getSuggestedTags(trimmed).map((tag) => tag.name);
    const selectedTags = state.drafts.newTaskTags.length > 0
        ? state.drafts.newTaskTags
        : suggestedTags.length > 0
            ? suggestedTags
            : [state.selectedInterests[0] || GENERAL_TAG];

    state.tasks = normalizeTaskOrder([
        ...state.tasks,
        {
            id: generateId(),
            title: trimmed,
            completed: false,
            tags: dedupeStrings(selectedTags.filter((tag) => availableTags.includes(tag))),
            createdAt: Date.now(),
            priority: state.drafts.newTaskPriority,
            focusPinned: false,
            order: state.tasks.length
        }
    ]);

    state.drafts.newTask = '';
    state.drafts.newTaskPriority = 'medium';
    state.drafts.newTaskTags = [];
    scheduleSave();
    safeRender();
}

function addInterest(interest: string) {
    const trimmed = interest.trim();
    if (!trimmed || state.selectedInterests.includes(trimmed)) return;

    state.selectedInterests = [...state.selectedInterests, trimmed];
    scheduleSave();
    state.drafts.newInterest = '';
    safeRender();
}

function getVisibleTasks(): Task[] {
    const query = state.ui.searchQuery.trim().toLowerCase();

    const ranked = state.tasks
        .filter((task) => {
            if (state.ui.focusMode && !isFocusCandidate(task)) return false;
            if (state.ui.taskFilterStatus === 'active' && task.completed) return false;
            if (state.ui.taskFilterStatus === 'completed' && !task.completed) return false;
            if (state.ui.taskFilterTags.length > 0 && !state.ui.taskFilterTags.some((tag) => task.tags.includes(tag))) return false;
            return true;
        })
        .map((task) => ({
            task,
            searchScore: query ? getSearchScore(task, query) : 0,
            focusScore: getFocusScore(task)
        }))
        .filter((entry) => !query || entry.searchScore > 0);

    ranked.sort((left, right) => compareRankedTasks(left, right, Boolean(query)));
    return ranked.map((entry) => entry.task);
}

function compareRankedTasks(left: RankedTask, right: RankedTask, hasQuery: boolean): number {
    if (hasQuery && left.searchScore !== right.searchScore) {
        return right.searchScore - left.searchScore;
    }

    if (state.ui.focusMode && left.focusScore !== right.focusScore) {
        return right.focusScore - left.focusScore;
    }

    if (state.ui.sortMode === 'oldest') {
        return left.task.createdAt - right.task.createdAt;
    }

    if (state.ui.sortMode === 'newest') {
        return right.task.createdAt - left.task.createdAt;
    }

    if (state.ui.sortMode === 'incomplete') {
        if (left.task.completed !== right.task.completed) {
            return left.task.completed ? 1 : -1;
        }
        return left.task.order - right.task.order;
    }

    if (state.ui.sortMode === 'priority') {
        const priorityDiff = priorityRank[right.task.priority] - priorityRank[left.task.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return left.task.order - right.task.order;
    }

    return left.task.order - right.task.order;
}

function getAvailableTaskTags(): string[] {
    return getTagSummaries().map((tag) => tag.name);
}

function getTagSummaries(): TagSummary[] {
    const allTags = dedupeStrings([
        ...state.selectedInterests,
        GENERAL_TAG,
        ...state.tasks.flatMap((task) => task.tags)
    ]);

    return allTags.map((name) => ({
        name,
        count: state.tasks.filter((task) => task.tags.includes(name)).length,
        accent: getTagAccent(name)
    }));
}

function getTagAccent(tag: string): string {
    const normalized = sanitizeClass(tag);
    const predefined = getComputedStyle(document.documentElement).getPropertyValue(`--tag-${normalized}`).trim();
    if (predefined) {
        return predefined.replace(/0\.2\)/, '0.85)').replace(/0\.15\)/, '0.85)');
    }

    const hash = [...tag].reduce((total, char) => total + char.charCodeAt(0) * 17, 0);
    const hue = hash % 360;
    return `hsl(${hue} 80% 64%)`;
}

function getSuggestedTags(input: string): TagSummary[] {
    const query = input.trim().toLowerCase();
    if (!query) return [];

    return getTagSummaries()
        .filter((tag) => !state.drafts.newTaskTags.includes(tag.name))
        .map((tag) => ({
            tag,
            score: getFuzzyScore(tag.name, query) + getFuzzyScore(query, tag.name)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 4)
        .map((entry) => entry.tag);
}

function findTaskById(id: string): Task | undefined {
    return state.tasks.find((task) => task.id === id);
}

function queueSearch(value: string) {
    state.ui.searchInputValue = value;

    if (searchDebounceId !== null) {
        window.clearTimeout(searchDebounceId);
    }

    searchDebounceId = window.setTimeout(() => {
        searchDebounceId = null;
        state.ui.searchQuery = state.ui.searchInputValue;
        state.ui.pendingFocusSelector = '#search-input';
        scheduleSave();
        safeRender();
    }, SEARCH_DEBOUNCE_MS);
}

function getSearchScore(task: Task, query: string): number {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return 0;

    const titleScore = getFuzzyScore(task.title, normalizedQuery, 240);
    const tagScore = Math.max(...task.tags.map((tag) => getFuzzyScore(tag, normalizedQuery, 140)), 0);
    const priorityBonus = priorityRank[task.priority] * 6;
    const recencyBonus = Math.max(0, 8 - Math.floor((Date.now() - task.createdAt) / (12 * 60 * 60 * 1000)));

    return titleScore + tagScore + priorityBonus + recencyBonus;
}

function getFuzzyScore(source: string, query: string, base = 100): number {
    const normalizedSource = source.trim().toLowerCase();
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedSource || !normalizedQuery) return 0;

    if (normalizedSource === normalizedQuery) {
        return base + 100;
    }

    const exactIndex = normalizedSource.indexOf(normalizedQuery);
    if (exactIndex >= 0) {
        return base + 80 - exactIndex;
    }

    const words = normalizedSource.split(/\s+/);
    const wordIndex = words.findIndex((word) => word.startsWith(normalizedQuery));
    if (wordIndex >= 0) {
        return base + 55 - wordIndex * 3;
    }

    let sourceIndex = 0;
    let queryIndex = 0;
    let gaps = 0;
    let streak = 0;
    let bestStreak = 0;

    while (sourceIndex < normalizedSource.length && queryIndex < normalizedQuery.length) {
        if (normalizedSource[sourceIndex] === normalizedQuery[queryIndex]) {
            queryIndex += 1;
            streak += 1;
            bestStreak = Math.max(bestStreak, streak);
        } else if (queryIndex > 0) {
            gaps += 1;
            streak = 0;
        }
        sourceIndex += 1;
    }

    if (queryIndex !== normalizedQuery.length) return 0;

    return Math.max(1, base + 28 + bestStreak * 8 - gaps * 2 - (normalizedSource.length - normalizedQuery.length));
}

function isFocusCandidate(task: Task): boolean {
    if (task.completed) return false;

    const recent = Date.now() - task.createdAt <= FOCUS_WINDOW_MS;
    return task.focusPinned || task.priority === 'high' || recent;
}

function getFocusScore(task: Task): number {
    if (task.completed) return -1;

    let score = 0;
    if (task.focusPinned) score += 100;
    score += priorityRank[task.priority] * 30;
    if (Date.now() - task.createdAt <= FOCUS_WINDOW_MS) score += 20;
    score += Math.max(0, 10 - task.order);
    return score;
}

function canDragReorder(): boolean {
    return !state.ui.focusMode && !state.ui.searchQuery.trim() && state.ui.sortMode === 'manual' && state.editing.taskId === null;
}

function restorePendingFocus() {
    if (!state.ui.pendingFocusSelector) return;

    const element = document.querySelector<HTMLInputElement>(state.ui.pendingFocusSelector);
    state.ui.pendingFocusSelector = null;
    if (!element) return;

    element.focus();
    const length = element.value.length;
    element.setSelectionRange(length, length);
}

function setupEvents() {
    if (app.dataset.eventsAttached) return;

    app.dataset.eventsAttached = 'true';
    app.addEventListener('click', handleAppClick);
    app.addEventListener('input', handleAppInput);
    app.addEventListener('keypress', handleAppKeypress);
    app.addEventListener('change', handleAppChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flushSave);
    window.addEventListener('beforeunload', flushSave);
}

// FIXED DRAG AND DROP
function setupDragAndDrop() {
    document.querySelectorAll<HTMLElement>('.drag-handle').forEach(handle => {
        handle.addEventListener('dragstart', handleDragStart);
        handle.addEventListener('dragend', handleDragEnd);
    });

    document.querySelectorAll<HTMLElement>('.task').forEach(task => {
        task.addEventListener('dragover', handleDragOver);
        task.addEventListener('drop', handleDrop);
    });
}

function handleAppClick(event: Event) {
    if (isDragging) return;
    const target = event.target as HTMLElement;

    // Prevent drag handle clicks from bubbling to task
    if (target.closest('.drag-handle')) {
        return;
    }

    if (target.closest('.interest-btn')) {
        const button = target.closest<HTMLButtonElement>('.interest-btn');
        const interest = button?.dataset.interest;
        if (!interest) return;

        state.selectedInterests = state.selectedInterests.includes(interest)
            ? state.selectedInterests.filter((item) => item !== interest)
            : [...state.selectedInterests, interest];

        scheduleSave();
        safeRender();
        return;
    }

    if (target.closest('.continue-btn')) {
        if (state.selectedInterests.length > 0) {
            state.onboardingFinished = true;
            scheduleSave();
            safeRender();
        }
        return;
    }

    if (target.id === 'add-interest') {
        const input = document.querySelector<HTMLInputElement>('#interest-input');
        if (input?.value.trim()) addInterest(input.value);
        return;
    }

    if (target.id === 'add-planner-interest') {
        const input = document.querySelector<HTMLInputElement>('#planner-interest');
        if (input?.value.trim()) addInterest(input.value);
        return;
    }

    if (target.closest('.tag-remove')) {
        const button = target.closest<HTMLButtonElement>('.tag-remove');
        const interest = button?.dataset.interest;
        if (!interest) return;

        state.selectedInterests = state.selectedInterests.filter((item) => item !== interest);
        state.tasks = state.tasks.map((task) => ({
            ...task,
            tags: task.tags.filter((tag) => tag !== interest)
        })).map((task) => ({
            ...task,
            tags: task.tags.length > 0 ? task.tags : [GENERAL_TAG]
        }));
        scheduleSave();
        safeRender();
        return;
    }

    if (target.closest('.filter-btn')?.hasAttribute('data-filter-status')) {
        const button = target.closest<HTMLButtonElement>('.filter-btn');
        const status = button?.dataset.filterStatus;
        if (!status) return;

        state.ui.taskFilterStatus = normalizeTaskFilterStatus(status);
        scheduleSave();
        safeRender();
        return;
    }

    if (target.id === 'focus-mode-toggle') {
        state.ui.focusMode = !state.ui.focusMode;
        scheduleSave();
        safeRender();
        return;
    }

    if (target.closest('.chip')) {
        const chip = target.closest<HTMLButtonElement>('.chip');
        const group = chip?.dataset.chipGroup;
        const value = chip?.dataset.chipValue ?? '';

        if (group === 'create') {
            if (value) {
                state.drafts.newTaskTags = toggleInList(state.drafts.newTaskTags, value);
                render();
            }
            return;
        }

        if (group === 'filter') {
            state.ui.taskFilterTags = value ? toggleInList(state.ui.taskFilterTags, value) : [];
            scheduleSave();
            safeRender();
            return;
        }

        if (group === 'edit' && value) {
            state.editing.tags = toggleInList(state.editing.tags, value);
            state.ui.pendingFocusSelector = '.edit-task-input';
            render();
            return;
        }
    }

    if (target.id === 'add-task') {
        const input = document.querySelector<HTMLInputElement>('#task-input');
        if (input?.value.trim()) addTask(input.value);
        return;
    }

    if (target.closest('.task-checkbox')) {
        const button = target.closest<HTMLButtonElement>('.task-checkbox');
        const taskId = button?.dataset.taskId;
        if (!taskId) return;

        state.tasks = state.tasks.map((task) => task.id === taskId ? { ...task, completed: !task.completed } : task);
        scheduleSave();
        safeRender();
        return;
    }

    if (target.closest('.focus-btn')) {
        const button = target.closest<HTMLButtonElement>('.focus-btn');
        const taskId = button?.dataset.taskId;
        if (!taskId) return;

        state.tasks = state.tasks.map((task) => task.id === taskId ? { ...task, focusPinned: !task.focusPinned } : task);
        scheduleSave();
        safeRender();
        return;
    }

    if (target.closest('.edit-btn')) {
        const button = target.closest<HTMLButtonElement>('.edit-btn');
        const taskId = button?.dataset.taskId;
        const task = taskId ? findTaskById(taskId) : undefined;
        if (!task) return;

        state.editing = {
            taskId: task.id,
            title: task.title,
            priority: task.priority,
            tags: [...task.tags],
            focusPinned: task.focusPinned
        };
        state.ui.pendingFocusSelector = '.edit-task-input';
        safeRender();
        return;
    }

    if (target.closest('.focus-chip-toggle')) {
        state.editing.focusPinned = !state.editing.focusPinned;
        state.ui.pendingFocusSelector = '.edit-task-input';
        safeRender();
        return;
    }

    if (target.closest('.save-edit')) {
        const button = target.closest<HTMLButtonElement>('.save-edit');
        const taskId = button?.dataset.taskId;
        if (!taskId || !state.editing.title.trim()) return;

        state.tasks = state.tasks.map((task) => {
            if (task.id !== taskId) return task;
            return {
                ...task,
                title: state.editing.title.trim(),
                priority: state.editing.priority,
                tags: state.editing.tags.length > 0 ? dedupeStrings(state.editing.tags) : [GENERAL_TAG],
                focusPinned: state.editing.focusPinned
            };
        });

        resetEditingState();
        scheduleSave();
        safeRender();
        return;
    }

    if (target.closest('.cancel-edit')) {
        resetEditingState();
        safeRender();
        return;
    }

    if (target.closest('.delete')) {
        const button = target.closest<HTMLButtonElement>('.delete');
        const taskId = button?.dataset.taskId;
        if (!taskId || !confirm('Delete this task?')) return;

        state.tasks = normalizeTaskOrder(state.tasks.filter((task) => task.id !== taskId));
        scheduleSave();
        safeRender();
    }
}

function handleAppInput(event: Event) {
    const target = event.target as HTMLInputElement;

    if (target.id === 'task-input') {
        state.drafts.newTask = target.value;
        state.ui.pendingFocusSelector = '#task-input';
        safeRender();
        return;
    }

    if (target.id === 'search-input') {
        queueSearch(target.value);
        return;
    }

    if (target.id === 'interest-input' || target.id === 'planner-interest') {
        state.drafts.newInterest = target.value;
        return;
    }

    if (target.classList.contains('edit-task-input')) {
        state.editing.title = target.value;
    }
}

function handleAppKeypress(event: KeyboardEvent) {
    const target = event.target as HTMLInputElement;
    if (event.key !== 'Enter') return;

    if (target.id === 'interest-input') {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('#add-interest')?.click();
        return;
    }

    if (target.id === 'planner-interest') {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('#add-planner-interest')?.click();
        return;
    }

    if (target.id === 'task-input') {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('#add-task')?.click();
        return;
    }

    if (target.classList.contains('edit-task-input')) {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('.save-edit')?.click();
    }
}

function handleAppChange(event: Event) {
    const target = event.target as HTMLSelectElement;

    if (target.id === 'sort-select') {
        state.ui.sortMode = normalizeSortMode(target.value);
        scheduleSave();
        safeRender();
        return;
    }

    if (target.id === 'task-priority-select') {
        state.drafts.newTaskPriority = normalizePriority(target.value);
        return;
    }

    if (target.classList.contains('edit-task-priority')) {
        state.editing.priority = normalizePriority(target.value);
    }
}

function handleDragStart(event: DragEvent) {
    if (!canDragReorder()) return;

    const handle = event.target as HTMLElement;
    const dragHandle = handle.closest<HTMLElement>('.drag-handle[data-task-id]');
    if (!dragHandle) return;

    const taskId = dragHandle.dataset.taskId;
    if (!taskId) return;

    isDragging = true;
    state.ui.draggingTaskId = taskId;

    const taskElement = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest('.task[data-task-id]') as HTMLElement;
    taskElement?.classList.add('dragging');

    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', taskId);
}

function handleDragOver(event: DragEvent) {
    event.preventDefault();

    const el = event.currentTarget as HTMLElement;
    const targetId = el.dataset.taskId;
    if (!state.ui.draggingTaskId || !targetId) return;

    const rect = el.getBoundingClientRect();
    const pos = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';

    clearDragIndicators();

    state.ui.dropTargetTaskId = targetId;
    state.ui.dropPosition = pos;

    el.classList.add(`drag-over-${pos}`);
}

function handleDrop(event: DragEvent) {
    event.preventDefault();

    const el = event.currentTarget as HTMLElement;
    const targetId = el.dataset.taskId;
    const draggingId = state.ui.draggingTaskId;

    if (!targetId || !draggingId || targetId === draggingId) return;

    reorderTasks(draggingId, targetId, state.ui.dropPosition ?? 'before');

    state.ui.draggingTaskId = null;
    clearDragIndicators();

    scheduleSave();
}

function handleDragEnd() {
    isDragging = false;
    state.ui.draggingTaskId = null;
    clearDragIndicators();
}

function clearDragIndicators() {
    document.querySelectorAll('.drag-over-before,.drag-over-after,.dragging')
        .forEach(el => el.classList.remove('drag-over-before','drag-over-after','dragging'));
}

function reorderTasks(dragId: string, targetId: string, pos: 'before'|'after') {
    const arr = [...state.tasks].sort((a,b)=>a.order-b.order);
    const from = arr.findIndex(t=>t.id===dragId);
    const to = arr.findIndex(t=>t.id===targetId);

    const [item] = arr.splice(from,1);
    const insert = pos==='after'?to:to-1;

    arr.splice(insert,0,item);

    state.tasks = arr.map((t,i)=>({...t,order:i}));
}

function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
        flushSave();
    }
}

function resetEditingState() {
    state.editing = {
        taskId: null,
        title: '',
        priority: 'medium',
        tags: [],
        focusPinned: false
    };
}

function sanitizeClass(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
    return escapeHtml(value);
}

function dedupeStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toggleInList(values: string[], value: string): string[] {
    return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function generateId(): string {
    return Math.random().toString(36).slice(2, 11);
}

function safeRender() {
    if (!isDragging) render();
}

loadState();
setupDragAndDrop();
safeRender();
