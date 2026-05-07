export type Priority = "low" | "medium" | "high";

export type TaskFilterStatus = "all" | "active" | "completed";
export type SortMode = "manual" | "newest" | "oldest" | "incomplete" | "priority";

export type Task = {
  id: string;
  title: string;
  completed: boolean;
  tags: string[];
  createdAt: number;
  priority: Priority;
  focusPinned: boolean;
  order: number;
};

export type PersistedState = {
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

export type DraftState = {
  newTask: string;
  newInterest: string;
  newTaskPriority: Priority;
  newTaskTags: string[];
};

export type EditingState = {
  taskId: string | null;
  title: string;
  priority: Priority;
  tags: string[];
  focusPinned: boolean;
};

export type TagSummary = {
  name: string;
  count: number;
  accent: string;
};
