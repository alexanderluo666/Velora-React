import { useEffect, type FormEvent } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityLabel = task.priority[0].toUpperCase() + task.priority.slice(1);

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
    <div ref={setNodeRef} style={style} className={`task-card ${task.completed ? "completed" : ""}`}>
      <div className="task-main">
        {isDraggingEnabled ? (
          <button className="drag-handle" type="button" {...attributes} {...listeners} aria-label="Drag task to reorder">
            ≡
          </button>
        ) : null}
        <button className="task-checkbox" type="button" onClick={() => onToggleCompleted(task.id)}>
          {task.completed ? "✓" : ""}
        </button>
        <div className="task-meta">
          <div className="task-title-row">
            <h3>{task.title}</h3>
            <span className={`priority-badge priority-${task.priority}`}>{priorityLabel}</span>
            {task.focusPinned ? <span className="focus-badge">Pinned</span> : null}
          </div>
          <div className="task-tags">
            {task.tags.map((tag) => (
              <span key={tag} className="task-tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="task-actions">
        <button className="ghost-btn" type="button" onClick={() => onToggleFocus(task.id)}>
          {task.focusPinned ? "Unfocus" : "Focus"}
        </button>
        <button className="ghost-btn" type="button" onClick={() => onEdit(task)}>
          ✎
        </button>
        <button className="danger-btn" type="button" onClick={() => onDelete(task.id)}>
          ✕
        </button>
      </div>
    </div>
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

  const sensors = useSensors(useSensor(PointerSensor));
  const dragEnabled = !persistedState.ui.focusMode && !persistedState.ui.searchQuery.trim() && persistedState.ui.sortMode === "manual" && editing.taskId === null;
  const completedCount = persistedState.tasks.filter((task) => task.completed).length;
  const totalCount = persistedState.tasks.length;
  const searchPending = searchInputValue !== persistedState.ui.searchQuery;

  useEffect(() => {
    if (!pendingFocusSelector) return;
    const element = document.querySelector<HTMLInputElement>(pendingFocusSelector);
    element?.focus();
  }, [pendingFocusSelector]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorderTasks(String(active.id), String(over.id));
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
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
