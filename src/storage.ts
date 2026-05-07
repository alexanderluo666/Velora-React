import type { PersistedState, Task } from "./types";
import {
  defaultPersistedState,
  normalizePriority,
  normalizeTaskFilterStatus,
  normalizeTaskFilterTags,
  normalizeSortMode,
  normalizeTaskOrder,
  dedupeStrings,
  GENERAL_TAG,
} from "./utils";

const STORAGE_VERSION = 3;
const STORAGE_KEY = "velora";
const STORAGE_BACKUP_KEY = "velora:backup";
const STORAGE_RECOVERY_KEY = "velora:recovery";

type LegacyStorageData = {
  version?: number;
  selectedInterests?: unknown;
  tasks?: unknown;
  onboardingFinished?: unknown;
  ui?: Partial<PersistedState["ui"]>;
  taskFilterStatus?: unknown;
  taskFilterTags?: unknown;
  searchQuery?: unknown;
  sortMode?: unknown;
  focusMode?: unknown;
  taskFilterTag?: unknown;
};

export function loadPlannerState(): PersistedState {
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
      savePlannerState(migrated);
      return migrated;
    }
    preserveRecoveryCopy(STORAGE_BACKUP_KEY, backup);
  }

  return structuredClone(defaultPersistedState);
}

export function savePlannerState(state: PersistedState) {
  try {
    const snapshot = JSON.stringify(state);
    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous && previous !== snapshot) {
      localStorage.setItem(STORAGE_BACKUP_KEY, previous);
    }
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch (error) {
    console.error("Failed to save planning state:", error);
    try {
      localStorage.setItem(STORAGE_BACKUP_KEY, JSON.stringify(state));
    } catch (backupError) {
      console.error("Failed to persist backup state:", backupError);
    }
  }
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
    localStorage.setItem(
      STORAGE_RECOVERY_KEY,
      JSON.stringify({ sourceKey, savedAt: new Date().toISOString(), raw })
    );
  } catch (error) {
    console.error("Failed to preserve recovery copy:", error);
  }
}

function migratePersistedState(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== "object") return null;

  const legacy = raw as LegacyStorageData;
  const detectedVersion = typeof legacy.version === "number" ? legacy.version : 1;
  if (detectedVersion > STORAGE_VERSION) return null;

  const selectedInterests = dedupeStrings(
    Array.isArray(legacy.selectedInterests)
      ? legacy.selectedInterests.filter((item): item is string => typeof item === "string")
      : []
  );

  const tasks = Array.isArray(legacy.tasks)
    ? legacy.tasks
        .map((task, index) => normalizeTask(task, index))
        .filter((task): task is Task => task !== null)
    : [];

  const legacyUi = legacy.ui ?? {};
  const taskFilterStatus = normalizeTaskFilterStatus(legacyUi.taskFilterStatus ?? legacy.taskFilterStatus);
  const taskFilterTags = normalizeTaskFilterTags(legacyUi.taskFilterTags ?? legacy.taskFilterTags, legacy.taskFilterTag);
  const searchQuery = typeof (legacyUi.searchQuery ?? legacy.searchQuery) === "string"
    ? (legacyUi.searchQuery ?? legacy.searchQuery) as string
    : "";
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
      focusMode,
    },
  };
}

function normalizeTask(raw: unknown, fallbackOrder = 0): Task | null {
  if (!raw || typeof raw !== "object") return null;

  const task = raw as Record<string, unknown>;
  const title = typeof task.title === "string" ? task.title.trim() : "";
  const id = typeof task.id === "string" ? task.id : "";
  if (!id || !title) return null;

  const rawTags = Array.isArray(task.tags)
    ? task.tags
    : typeof task.tag === "string"
    ? [task.tag]
    : [];

  const tags = dedupeStrings(
    rawTags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean)
  );

  return {
    id,
    title,
    completed: Boolean(task.completed),
    tags: tags.length > 0 ? tags : [GENERAL_TAG],
    createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
    priority: normalizePriority(task.priority),
    focusPinned: Boolean(task.focusPinned),
    order: typeof task.order === "number" ? task.order : fallbackOrder,
  };
}
