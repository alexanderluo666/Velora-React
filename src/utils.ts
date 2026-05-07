import type {
  Priority,
  SortMode,
  Task,
  TaskFilterStatus,
  TagSummary,
  PersistedState,
} from "./types";

export const GENERAL_TAG = "General";
export const SEARCH_DEBOUNCE_MS = 1000;
export const FOCUS_WINDOW_MS = 24 * 60 * 60 * 1000;

export const starterInterests = [
  "Studying",
  "Gaming",
  "Developing",
  "Fitness",
  "Reading",
  "Art",
  "Music",
  "Math",
  "AI",
];

export const priorityRank: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export const defaultPersistedState: PersistedState = {
  version: 3,
  selectedInterests: [],
  tasks: [],
  onboardingFinished: false,
  ui: {
    taskFilterStatus: "all",
    taskFilterTags: [],
    searchQuery: "",
    sortMode: "manual",
    focusMode: false,
  },
};

export function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

export function dedupeStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function toggleInList(values: string[], value: string) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function normalizePriority(value: unknown): Priority {
  return value === "low" || value === "high" ? value : "medium";
}

export function normalizeTaskFilterStatus(value: unknown): TaskFilterStatus {
  return value === "active" || value === "completed" ? value : "all";
}

export function normalizeSortMode(value: unknown): SortMode {
  return value === "newest" || value === "oldest" || value === "incomplete" || value === "priority"
    ? value
    : "manual";
}

export function normalizeTaskFilterTags(candidate: unknown, legacyCandidate?: unknown): string[] {
  const tags = Array.isArray(candidate)
    ? candidate
    : typeof legacyCandidate === "string" && legacyCandidate !== "All"
    ? [legacyCandidate]
    : [];

  return dedupeStrings(tags.filter((tag): tag is string => typeof tag === "string"));
}

export function normalizeTaskOrder(tasks: Task[]) {
  return [...tasks]
    .sort((left, right) => left.order - right.order)
    .map((task, index) => ({ ...task, order: index }));
}

export function sortTasks(tasks: Task[], mode: SortMode) {
  const ordered = [...tasks];

  if (mode === "newest") {
    return ordered.sort((a, b) => b.createdAt - a.createdAt);
  }

  if (mode === "oldest") {
    return ordered.sort((a, b) => a.createdAt - b.createdAt);
  }

  if (mode === "priority") {
    return ordered.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]);
  }

  return ordered;
}

export function sanitizeClass(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function getTagAccent(tag: string) {
  const normalized = sanitizeClass(tag);
  const predefined = getComputedStyle(document.documentElement).getPropertyValue(`--tag-${normalized}`).trim();
  if (predefined) {
    return predefined.replace(/0\.2\)/, "0.85)").replace(/0\.15\)/, "0.85)");
  }

  const hash = [...tag].reduce((total, char) => total + char.charCodeAt(0) * 17, 0);
  const hue = hash % 360;
  return `hsl(${hue} 80% 64%)`;
}

export function getTagSummaries(tasks: Task[], selectedInterests: string[]): TagSummary[] {
  const allTags = dedupeStrings([...(selectedInterests ?? []), GENERAL_TAG, ...tasks.flatMap((task) => task.tags)]);

  return allTags.map((name) => ({
    name,
    count: tasks.filter((task) => task.tags.includes(name)).length,
    accent: getTagAccent(name),
  }));
}

export function getFuzzyScore(source: string, query: string, base = 100) {
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

export function getSearchScore(task: Task, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const titleScore = getFuzzyScore(task.title, normalizedQuery, 240);
  const tagScore = Math.max(...task.tags.map((tag) => getFuzzyScore(tag, normalizedQuery, 140)), 0);
  const priorityBonus = priorityRank[task.priority] * 6;
  const recencyBonus = Math.max(0, 8 - Math.floor((Date.now() - task.createdAt) / (12 * 60 * 60 * 1000)));

  return titleScore + tagScore + priorityBonus + recencyBonus;
}

export function getFocusScore(task: Task) {
  if (task.completed) return -1;

  let score = 0;
  if (task.focusPinned) score += 100;
  score += priorityRank[task.priority] * 30;
  if (Date.now() - task.createdAt <= FOCUS_WINDOW_MS) score += 20;
  score += Math.max(0, 10 - task.order);
  return score;
}

export function isFocusCandidate(task: Task) {
  if (task.completed) return false;
  return task.focusPinned || task.priority === "high" || Date.now() - task.createdAt <= FOCUS_WINDOW_MS;
}

export function getSuggestedTags(
  input: string,
  tasks: Task[],
  selectedInterests: string[],
  selectedTags: string[] = []
) {
  const query = input.trim().toLowerCase();
  if (!query) return [];

  return getTagSummaries(tasks, selectedInterests)
    .filter((tag) => !selectedTags.includes(tag.name))
    .map((tag) => ({
      tag,
      score: getFuzzyScore(tag.name, query) + getFuzzyScore(query, tag.name),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((entry) => entry.tag);
}
