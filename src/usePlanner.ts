import { useEffect, useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type {
  DraftState,
  EditingState,
  PersistedState,
  Priority,
  SortMode,
  Task,
  TaskFilterStatus,
} from "./types";
import {
  GENERAL_TAG,
  SEARCH_DEBOUNCE_MS,
  generateId,
  getFocusScore,
  getSearchScore,
  getSuggestedTags,
  getTagSummaries,
  normalizePriority,
  normalizeSortMode,
  normalizeTaskFilterStatus,
  normalizeTaskOrder,
  priorityRank,
  toggleInList,
  dedupeStrings,
} from "./utils";
import { loadPlannerState, savePlannerState } from "./storage";

export function usePlanner() {
  const [initialState] = useState<PersistedState>(() => loadPlannerState());
  const [persistedState, setPersistedState] = useState<PersistedState>(initialState);
  const [drafts, setDrafts] = useState<DraftState>({
    newTask: "",
    newInterest: "",
    newTaskPriority: "medium",
    newTaskTags: [],
  });
  const [editing, setEditing] = useState<EditingState>({
    taskId: null,
    title: "",
    priority: "medium",
    tags: [],
    focusPinned: false,
  });
  const [searchInputValue, setSearchInputValue] = useState(initialState.ui.searchQuery);
  const [pendingFocusSelector, setPendingFocusSelector] = useState<string | null>(null);

  const saveTimeout = useRef<number | null>(null);
  const searchTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (saveTimeout.current !== null) {
      window.clearTimeout(saveTimeout.current);
    }

    saveTimeout.current = window.setTimeout(() => {
      savePlannerState(persistedState);
      saveTimeout.current = null;
    }, 250);

    return () => {
      if (saveTimeout.current !== null) {
        window.clearTimeout(saveTimeout.current);
      }
    };
  }, [persistedState]);

  useEffect(() => {
    return () => {
      if (saveTimeout.current !== null) {
        window.clearTimeout(saveTimeout.current);
      }
      if (searchTimeout.current !== null) {
        window.clearTimeout(searchTimeout.current);
      }
    };
  }, []);

  const tagSummaries = useMemo(
    () => getTagSummaries(persistedState.tasks, persistedState.selectedInterests),
    [persistedState.tasks, persistedState.selectedInterests]
  );

  const availableTags = useMemo(() => tagSummaries.map((summary) => summary.name), [tagSummaries]);

  const suggestedTags = useMemo(
    () => getSuggestedTags(drafts.newTask, persistedState.tasks, persistedState.selectedInterests, drafts.newTaskTags),
    [drafts.newTask, drafts.newTaskTags, persistedState.tasks, persistedState.selectedInterests]
  );

  const visibleTasks = useMemo(() => {
    const query = persistedState.ui.searchQuery.trim().toLowerCase();
    const ranked = persistedState.tasks
      .filter((task) => {
        if (persistedState.ui.focusMode && !isFocusCandidate(task)) return false;
        if (persistedState.ui.taskFilterStatus === "active" && task.completed) return false;
        if (persistedState.ui.taskFilterStatus === "completed" && !task.completed) return false;
        if (persistedState.ui.taskFilterTags.length > 0 && !persistedState.ui.taskFilterTags.some((tag) => task.tags.includes(tag))) return false;
        return true;
      })
      .map((task) => ({
        task,
        searchScore: query ? getSearchScore(task, query) : 0,
        focusScore: getFocusScore(task),
      }))
      .filter((entry) => !query || entry.searchScore > 0);

    ranked.sort((left, right) => compareRankedTasks(left, right, persistedState.ui.sortMode, persistedState.ui.focusMode, Boolean(query)));
    return ranked.map((entry) => entry.task);
  }, [persistedState.tasks, persistedState.ui]);

  function updateState(updater: (previous: PersistedState) => PersistedState) {
    setPersistedState((previous) => updater(previous));
  }

  function queueSearch(value: string) {
    setSearchInputValue(value);

    if (searchTimeout.current !== null) {
      window.clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = window.setTimeout(() => {
      updateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          searchQuery: value,
        },
      }));
      setPendingFocusSelector("#search-input");
      searchTimeout.current = null;
    }, SEARCH_DEBOUNCE_MS);
  }

  function addTask(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;

    const suggested = getSuggestedTags(trimmed, persistedState.tasks, persistedState.selectedInterests, drafts.newTaskTags).map((tag) => tag.name);
    const selectedTags = drafts.newTaskTags.length > 0 ? drafts.newTaskTags : suggested.length > 0 ? suggested : [persistedState.selectedInterests[0] ?? GENERAL_TAG];
    const taskTags = dedupeStrings(selectedTags.filter((tag) => availableTags.includes(tag)));

    updateState((previous) => ({
      ...previous,
      tasks: normalizeTaskOrder([
        ...previous.tasks,
        {
          id: generateId(),
          title: trimmed,
          completed: false,
          tags: taskTags.length > 0 ? taskTags : [GENERAL_TAG],
          createdAt: Date.now(),
          priority: drafts.newTaskPriority,
          focusPinned: false,
          order: previous.tasks.length,
        },
      ]),
    }));

    setDrafts((previous) => ({
      ...previous,
      newTask: "",
      newTaskPriority: "medium",
      newTaskTags: [],
    }));
  }

  function addInterest(interest: string) {
    const trimmed = interest.trim();
    if (!trimmed || persistedState.selectedInterests.includes(trimmed)) return;

    updateState((previous) => ({
      ...previous,
      selectedInterests: [...previous.selectedInterests, trimmed],
    }));
    setDrafts((previous) => ({ ...previous, newInterest: "" }));
  }

  function toggleInterest(interest: string) {
    updateState((previous) => ({
      ...previous,
      selectedInterests: previous.selectedInterests.includes(interest)
        ? previous.selectedInterests.filter((item) => item !== interest)
        : [...previous.selectedInterests, interest],
    }));
  }

  function removeInterest(interest: string) {
    updateState((previous) => ({
      ...previous,
      selectedInterests: previous.selectedInterests.filter((item) => item !== interest),
      tasks: previous.tasks
        .map((task) => ({ ...task, tags: task.tags.filter((tag) => tag !== interest) }))
        .map((task) => ({
          ...task,
          tags: task.tags.length > 0 ? task.tags : [GENERAL_TAG],
        })),
    }));
  }

  function toggleTaskCompleted(taskId: string) {
    updateState((previous) => ({
      ...previous,
      tasks: previous.tasks.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      ),
    }));
  }

  function toggleTaskFocused(taskId: string) {
    updateState((previous) => ({
      ...previous,
      tasks: previous.tasks.map((task) =>
        task.id === taskId ? { ...task, focusPinned: !task.focusPinned } : task
      ),
    }));
  }

  function startEditing(task: Task) {
    setEditing({
      taskId: task.id,
      title: task.title,
      priority: task.priority,
      tags: [...task.tags],
      focusPinned: task.focusPinned,
    });
    setPendingFocusSelector(".edit-task-input");
  }

  function saveEdit(taskId: string) {
    if (!editing.title.trim()) return;

    updateState((previous) => ({
      ...previous,
      tasks: previous.tasks.map((task) =>
        task.id !== taskId
          ? task
          : {
              ...task,
              title: editing.title.trim(),
              priority: editing.priority,
              tags: editing.tags.length > 0 ? dedupeStrings(editing.tags) : [GENERAL_TAG],
              focusPinned: editing.focusPinned,
            }
      ),
    }));

    setEditing({ taskId: null, title: "", priority: "medium", tags: [], focusPinned: false });
  }

  function cancelEdit() {
    setEditing({ taskId: null, title: "", priority: "medium", tags: [], focusPinned: false });
  }

  function deleteTask(taskId: string) {
    updateState((previous) => ({
      ...previous,
      tasks: normalizeTaskOrder(previous.tasks.filter((task) => task.id !== taskId)),
    }));
  }

  function setTaskFilterStatus(status: TaskFilterStatus) {
    updateState((previous) => ({
      ...previous,
      ui: { ...previous.ui, taskFilterStatus: normalizeTaskFilterStatus(status) },
    }));
  }

  function setSortMode(mode: SortMode) {
    updateState((previous) => ({
      ...previous,
      ui: { ...previous.ui, sortMode: normalizeSortMode(mode) },
    }));
  }

  function toggleFilterTag(tag: string) {
    updateState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        taskFilterTags: tag ? toggleInList(previous.ui.taskFilterTags, tag) : [],
      },
    }));
  }

  function toggleCreateTag(tag: string) {
    setDrafts((previous) => ({
      ...previous,
      newTaskTags: toggleInList(previous.newTaskTags, tag),
    }));
  }

  function toggleEditTag(tag: string) {
    setEditing((previous) => ({
      ...previous,
      tags: toggleInList(previous.tags, tag),
    }));
    setPendingFocusSelector(".edit-task-input");
  }

  function setOnboardingFinished(value: boolean) {
    updateState((previous) => ({ ...previous, onboardingFinished: value }));
  }

  function setFocusMode(value: boolean) {
    updateState((previous) => ({
      ...previous,
      ui: { ...previous.ui, focusMode: value },
    }));
  }

  function setSearchInputValueLocal(value: string) {
    setSearchInputValue(value);
  }

  function setDraftTaskTitle(value: string) {
    setDrafts((previous) => ({ ...previous, newTask: value }));
  }

  function setInterestDraft(value: string) {
    setDrafts((previous) => ({ ...previous, newInterest: value }));
  }

  function setDraftPriority(value: Priority) {
    setDrafts((previous) => ({ ...previous, newTaskPriority: normalizePriority(value) }));
  }

  function setEditingTitle(value: string) {
    setEditing((previous) => ({ ...previous, title: value }));
  }

  function setEditingPriority(value: Priority) {
    setEditing((previous) => ({ ...previous, priority: normalizePriority(value) }));
  }

  function toggleOnboardingInterest(interest: string) {
    updateState((previous) => ({
      ...previous,
      selectedInterests: previous.selectedInterests.includes(interest)
        ? previous.selectedInterests.filter((item) => item !== interest)
        : [...previous.selectedInterests, interest],
    }));
  }

  function reorderTasks(activeId: string, overId: string, visibleTaskIds: string[]) {
    updateState((previous) => {
      const ordered = normalizeTaskOrder(previous.tasks);
      const visibleTaskIdSet = new Set(visibleTaskIds);
      const visibleOrdered = ordered.filter((task) => visibleTaskIdSet.has(task.id));
      const activeIndex = visibleOrdered.findIndex((task) => task.id === activeId);
      const overIndex = visibleOrdered.findIndex((task) => task.id === overId);
      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
        return previous;
      }

      const reorderedVisible = arrayMove(visibleOrdered, activeIndex, overIndex);
      let visibleCursor = 0;
      const nextTasks = ordered.map((task) => {
        if (!visibleTaskIdSet.has(task.id)) {
          return task;
        }

        const reorderedTask = reorderedVisible[visibleCursor];
        visibleCursor += 1;
        return reorderedTask;
      });

      return {
        ...previous,
        tasks: normalizeTaskOrder(nextTasks),
      };
    });
  }

  return {
    persistedState,
    drafts,
    editing,
    searchInputValue,
    pendingFocusSelector,
    visibleTasks,
    tagSummaries,
    availableTags,
    suggestedTags,
    queueSearch,
    addTask,
    addInterest,
    toggleInterest,
    removeInterest,
    toggleTaskCompleted,
    toggleTaskFocused,
    startEditing,
    saveEdit,
    cancelEdit,
    deleteTask,
    setTaskFilterStatus,
    setSortMode,
    toggleFilterTag,
    toggleCreateTag,
    toggleEditTag,
    setOnboardingFinished,
    setFocusMode,
    setSearchInputValueLocal,
    setDraftTaskTitle,
    setInterestDraft,
    setDraftPriority,
    setEditingTitle,
    setEditingPriority,
    toggleOnboardingInterest,
    reorderTasks,
  };
}

function compareRankedTasks(
  left: { task: Task; searchScore: number; focusScore: number },
  right: { task: Task; searchScore: number; focusScore: number },
  sortMode: SortMode,
  focusMode: boolean,
  hasQuery: boolean
) {
  if (hasQuery && left.searchScore !== right.searchScore) {
    return right.searchScore - left.searchScore;
  }

  if (focusMode && left.focusScore !== right.focusScore) {
    return right.focusScore - left.focusScore;
  }

  if (sortMode === "oldest") {
    return left.task.createdAt - right.task.createdAt;
  }

  if (sortMode === "newest") {
    return right.task.createdAt - left.task.createdAt;
  }

  if (sortMode === "incomplete") {
    if (left.task.completed !== right.task.completed) {
      return left.task.completed ? 1 : -1;
    }
    return left.task.order - right.task.order;
  }

  if (sortMode === "priority") {
    const diff = priorityRank[right.task.priority] - priorityRank[left.task.priority];
    return diff !== 0 ? diff : left.task.order - right.task.order;
  }

  return left.task.order - right.task.order;
}

function isFocusCandidate(task: Task) {
  if (task.completed) return false;
  return task.focusPinned || task.priority === "high" || Date.now() - task.createdAt <= 24 * 60 * 60 * 1000;
}
