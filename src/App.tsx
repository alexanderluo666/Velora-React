import { useEffect, type FormEvent } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  MouseSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePlanner } from "./usePlanner";
import { starterInterests } from "./utils";
import type { Priority, SortMode, Task } from "./types";
import "./App.css";

function SortableTaskCard({
  task,
  availableTags,
  isDraggingEnabled,
  editing,
  onToggleCompleted,
  onToggleFocus,
  onEdit,
  onDelete,
  onSaveEdit,
  onCancelEdit,
  onEditingTitle,
  onEditingPriority,
  onToggleEditTag,
}: {
  task: Task;
  availableTags: string[];
  isDraggingEnabled: boolean;
  editing: {
    taskId: string | null;
    title: string;
    priority: "low" | "medium" | "high";
    tags: string[];
    focusPinned: boolean;
  };
  onToggleCompleted: (id: string) => void;
  onToggleFocus: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onEditingTitle: (value: string) => void;
  onEditingPriority: (value: "low" | "medium" | "high") => void;
  onToggleEditTag: (tag: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !isDraggingEnabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };

  const priorityLabel = task.priority[0].toUpperCase() + task.priority.slice(1);
  const createdLabel = formatTaskDate(task.createdAt);

  if (editing.taskId === task.id) {
    return (
      <div ref={setNodeRef} style={style} className="task-card editing">
        <div className="task-edit-row">
          <input
            className="edit-task-input"
            value={editing.title}
            onChange={(event) => onEditingTitle(event.target.value)}
            placeholder="Task title..."
          />
          <select
            className="edit-task-priority"
            value={editing.priority}
            onChange={(event) => onEditingPriority(event.target.value as "low" | "medium" | "high")}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="chip-row edit-chip-row">
          {availableTags.map((tag) => (
            <button
              key={tag}
              className={`chip ${editing.tags.includes(tag) ? "selected" : ""}`}
              type="button"
              onClick={() => onToggleEditTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="task-actions-row">
          <button className="primary-btn" type="button" onClick={() => onSaveEdit(task.id)}>
            Save
          </button>
          <button className="ghost-btn" type="button" onClick={onCancelEdit}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`task-card ${task.completed ? "completed" : ""} ${isDragging ? "dragging" : ""}`}
    >
      <div className="task-main">
        <div className="task-leading">
          {isDraggingEnabled ? (
            <button className="drag-handle" type="button" {...attributes} {...listeners} aria-label="Drag task to reorder">
              <span className="drag-glyph">⋮⋮</span>
            </button>
          ) : null}
          <button className="task-checkbox" type="button" onClick={() => onToggleCompleted(task.id)} aria-label={task.completed ? "Mark task incomplete" : "Mark task complete"}>
            {task.completed ? "✓" : ""}
          </button>
        </div>
        <div className="task-meta">
          <div className="task-title-row">
            <h3>{task.title}</h3>
            <div className="task-status-badges">
              <span className={`priority-badge priority-${task.priority}`}>{priorityLabel}</span>
              {task.focusPinned ? <span className="focus-badge">Pinned</span> : null}
            </div>
          </div>
          <div className="task-info-row">
            <span className="meta-pill">Created {createdLabel}</span>
            <span className={`meta-pill ${task.completed ? "success" : ""}`}>
              {task.completed ? "Completed" : "In progress"}
            </span>
          </div>
          <div className="task-tags" aria-label="Task tags">
            {task.tags.map((tag) => (
              <span key={tag} className="task-tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="task-actions">
        <button className={`ghost-btn icon-btn ${task.focusPinned ? "active" : ""}`} type="button" onClick={() => onToggleFocus(task.id)}>
          <span aria-hidden="true">◎</span>
          <span>{task.focusPinned ? "Unfocus" : "Focus"}</span>
        </button>
        <button className="ghost-btn icon-btn" type="button" onClick={() => onEdit(task)}>
          <span aria-hidden="true">✎</span>
          <span>Edit</span>
        </button>
        <button className="danger-btn icon-btn" type="button" onClick={() => onDelete(task.id)}>
          <span aria-hidden="true">✕</span>
          <span>Delete</span>
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const {
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
  } = usePlanner();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const dragEnabled = !persistedState.ui.focusMode && !persistedState.ui.searchQuery.trim() && persistedState.ui.sortMode === "manual" && editing.taskId === null;
  const completedCount = persistedState.tasks.filter((task) => task.completed).length;
  const totalCount = persistedState.tasks.length;
  const searchPending = searchInputValue !== persistedState.ui.searchQuery;
  const activeCount = totalCount - completedCount;
  const focusedCount = persistedState.tasks.filter((task) => task.focusPinned).length;
  const highPriorityCount = persistedState.tasks.filter((task) => task.priority === "high" && !task.completed).length;
  const completionRate = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const selectedFilterCount = persistedState.ui.taskFilterTags.length;

  useEffect(() => {
    if (!pendingFocusSelector) return;
    const element = document.querySelector<HTMLInputElement>(pendingFocusSelector);
    element?.focus();
  }, [pendingFocusSelector]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorderTasks(
      String(active.id),
      String(over.id),
      visibleTasks.map((task) => task.id)
    );
  }

  function handleSubmitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addTask(drafts.newTask);
  }

  return (
    <div className="app-shell">
      {persistedState.onboardingFinished ? (
        <div className="planner">
          <aside className="sidebar">
            <div className="sidebar-header">
              <h2>✨ Velora</h2>
              <div className="progress-indicator">{completedCount}/{totalCount}</div>
            </div>
            <section className="sidebar-section">
              <h3>Overview</h3>
              <div className="stats-grid">
                <div className="stat-card accent">
                  <span className="stat-label">Completion</span>
                  <strong>{completionRate}%</strong>
                  <span className="stat-meta">{completedCount} finished</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Active</span>
                  <strong>{activeCount}</strong>
                  <span className="stat-meta">Tasks in motion</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Focus</span>
                  <strong>{focusedCount}</strong>
                  <span className="stat-meta">Pinned tasks</span>
                </div>
                <div className="stat-card warning">
                  <span className="stat-label">Urgent</span>
                  <strong>{highPriorityCount}</strong>
                  <span className="stat-meta">High priority open</span>
                </div>
              </div>
            </section>
            <section className="sidebar-section">
              <h3>Your Interests</h3>
              {tagSummaries.length === 0 ? (
                <p className="empty-state-text">No interests yet</p>
              ) : (
                <div className="tags-grid">
                  {tagSummaries.map((tag) => (
                    <div key={tag.name} className="tag-pill" style={{ borderColor: tag.accent }}>
                      <span>{tag.name}</span>
                      <button type="button" onClick={() => removeInterest(tag.name)} title={`Remove ${tag.name}`}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="custom-box compact">
                <input
                  id="planner-interest"
                  type="text"
                  value={drafts.newInterest}
                  onChange={(event) => setInterestDraft(event.target.value)}
                  placeholder="Add interest..."
                />
                <button type="button" onClick={() => addInterest(drafts.newInterest)}>
                  +
                </button>
              </div>
            </section>
          </aside>

          <main className="main-panel">
            <header className="main-header">
              <div>
                <h2>Today's Tasks</h2>
                <p>{completedCount}/{totalCount} completed</p>
              </div>
              <button className={`filter-btn ${persistedState.ui.focusMode ? "active" : ""}`} type="button" onClick={() => setFocusMode(!persistedState.ui.focusMode)}>
                Focus Mode {persistedState.ui.focusMode ? "On" : "Off"}
              </button>
            </header>

            <section className="summary-strip" aria-label="Task overview">
              <div className="summary-tile">
                <span className="summary-icon" aria-hidden="true">◌</span>
                <div>
                  <strong>{activeCount}</strong>
                  <p>Open tasks</p>
                </div>
              </div>
              <div className="summary-tile">
                <span className="summary-icon" aria-hidden="true">⌘</span>
                <div>
                  <strong>{persistedState.ui.sortMode}</strong>
                  <p>Current sort</p>
                </div>
              </div>
              <div className="summary-tile">
                <span className="summary-icon" aria-hidden="true">#</span>
                <div>
                  <strong>{selectedFilterCount}</strong>
                  <p>Tag filters</p>
                </div>
              </div>
              <div className="summary-tile">
                <span className="summary-icon" aria-hidden="true">↕</span>
                <div>
                  <strong>{dragEnabled ? "Ready" : "Locked"}</strong>
                  <p>Drag and drop</p>
                </div>
              </div>
            </section>

            <section className="task-controls">
              <div className="custom-box search-box">
                <input
                  id="search-input"
                  type="search"
                  value={searchInputValue}
                  onChange={(event) => {
                    setSearchInputValueLocal(event.target.value);
                    queueSearch(event.target.value);
                  }}
                  placeholder="Search tasks..."
                />
              </div>
              <p className="search-hint">
                {searchPending
                  ? "Updating results after 1 second of inactivity..."
                  : "Search supports fuzzy matching and ranked results."}
              </p>

              <div className="filter-row">
                <div className="filter-group">
                  {(["all", "active", "completed"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`filter-btn ${persistedState.ui.taskFilterStatus === status ? "active" : ""}`}
                      onClick={() => setTaskFilterStatus(status)}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
                <select value={persistedState.ui.sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="manual">Manual order</option>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="incomplete">Incomplete first</option>
                  <option value="priority">Priority first</option>
                </select>
              </div>

              <div className="chip-section">
                <span>Filter tags</span>
                <div className="chip-row">
                  <button
                    className={`chip ${persistedState.ui.taskFilterTags.length === 0 ? "selected" : ""}`}
                    type="button"
                    onClick={() => toggleFilterTag("")}
                  >
                    All tags
                  </button>
                  {tagSummaries.map((tag) => (
                    <button
                      key={tag.name}
                      className={`chip ${persistedState.ui.taskFilterTags.includes(tag.name) ? "selected" : ""}`}
                      type="button"
                      onClick={() => toggleFilterTag(tag.name)}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              <form className="task-creator" onSubmit={handleSubmitTask}>
                <div className="custom-box">
                  <input
                    id="task-input"
                    type="text"
                    placeholder="What needs to be done?"
                    value={drafts.newTask}
                    onChange={(event) => setDraftTaskTitle(event.target.value)}
                  />
                  <select value={drafts.newTaskPriority} onChange={(event) => setDraftPriority(event.target.value as Priority)}>
                    <option value="low">Low priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="high">High priority</option>
                  </select>
                  <button type="submit" className="primary-btn">
                    Add Task
                  </button>
                </div>
                <div className="creator-footnote">
                  <span>{drafts.newTaskTags.length} tags selected</span>
                  <span>{drafts.newTaskPriority} priority</span>
                </div>
              </form>

              {suggestedTags.length > 0 ? (
                <div className="chip-section">
                  <span>Suggested tags</span>
                  <div className="chip-row">
                    {suggestedTags.map((tag) => (
                      <button
                        key={tag.name}
                        className={`chip ${drafts.newTaskTags.includes(tag.name) ? "selected" : ""}`}
                        type="button"
                        onClick={() => toggleCreateTag(tag.name)}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="chip-section">
                <span>Task tags</span>
                <div className="chip-row">
                  {tagSummaries.map((tag) => (
                    <button
                      key={tag.name}
                      className={`chip ${drafts.newTaskTags.includes(tag.name) ? "selected" : ""}`}
                      type="button"
                      onClick={() => toggleCreateTag(tag.name)}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {dragEnabled ? (
              <div className="manual-order-banner">
                <span>Manual order is active. Drag and drop tasks to reorder them.</span>
              </div>
            ) : null}

            <section className={`task-list ${dragEnabled ? "drag-enabled" : ""}`}>
              {persistedState.tasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📝</div>
                  <p>No tasks yet. Add one to get started.</p>
                </div>
              ) : visibleTasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">{persistedState.ui.focusMode ? "🎯" : "🔍"}</div>
                  <p>
                    {persistedState.ui.focusMode
                      ? "No tasks qualify for Focus Mode right now."
                      : "No tasks match your current filters."}
                  </p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    {visibleTasks.map((task) => (
                      <SortableTaskCard
                        key={task.id}
                        task={task}
                        availableTags={availableTags}
                        isDraggingEnabled={dragEnabled}
                        editing={editing}
                        onToggleCompleted={toggleTaskCompleted}
                        onToggleFocus={toggleTaskFocused}
                        onEdit={startEditing}
                        onDelete={deleteTask}
                        onSaveEdit={saveEdit}
                        onCancelEdit={cancelEdit}
                        onEditingTitle={setEditingTitle}
                        onEditingPriority={setEditingPriority}
                        onToggleEditTag={toggleEditTag}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </section>
          </main>
        </div>
      ) : (
        <div className="welcome-screen">
          <div className="welcome-card">
            <div className="welcome-header">
              <h1>✨ Velora</h1>
              <p>Organize your life around what matters</p>
            </div>
            <div className="welcome-content">
              <p>Select your interests to get started</p>
              <div className="interest-grid">
                {starterInterests.map((interest) => (
                <button
                  key={interest}
                  className={`interest-btn ${persistedState.selectedInterests.includes(interest) ? "selected" : ""}`}
                  type="button"
                  onClick={() => toggleOnboardingInterest(interest)}
                >
                  {interest}
                </button>
              ))}
              </div>
              <div className="divider">or add your own</div>
              <div className="custom-box">
                <input
                  id="interest-input"
                  type="text"
                  placeholder="Custom interest..."
                  value={drafts.newInterest}
                  onChange={(event) => setInterestDraft(event.target.value)}
                />
                <button type="button" onClick={() => addInterest(drafts.newInterest)}>
                  Add
                </button>
              </div>
            </div>
            <button
              className="primary-btn continue-btn"
              type="button"
              onClick={() => persistedState.selectedInterests.length > 0 && setOnboardingFinished(true)}
              disabled={persistedState.selectedInterests.length === 0}
            >
              Continue →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTaskDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(timestamp);
}
