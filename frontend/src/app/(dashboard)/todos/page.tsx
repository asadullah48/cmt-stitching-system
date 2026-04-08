"use client";

import React, { useCallback, useEffect, useState } from "react";
import { todoService } from "@/hooks/services";
import type {
  Todo, TodoCreate, TodoUpdate,
  TodoStatus, TodoPriority, TodoCategory, TodoRecurrence,
  TodoFilters,
} from "@/hooks/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dueBadge(todo: Todo) {
  if (todo.status === "completed" || !todo.due_date) return null;
  const due = new Date(todo.due_date);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffMs < 0)
    return <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Overdue</span>;
  if (diffDays < 1)
    return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">Today</span>;
  if (diffDays <= 3)
    return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">Soon</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{due.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>;
}

const PRIORITY_COLORS: Record<TodoPriority, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const CATEGORY_LABELS: Record<TodoCategory, string> = {
  billing: "Billing",
  maintenance: "Maintenance",
  workflow: "Workflow",
  order: "Order",
  other: "Other",
};

// ─── Todo Card ────────────────────────────────────────────────────────────────

function TodoCard({
  todo,
  onComplete,
  onDelete,
  onEdit,
}: {
  todo: Todo;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <button
          onClick={() => onComplete(todo.id)}
          disabled={todo.status === "completed"}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
            todo.status === "completed"
              ? "bg-green-500 border-green-500"
              : "border-gray-300 hover:border-blue-500"
          }`}
        >
          {todo.status === "completed" && (
            <svg className="w-full h-full text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium ${todo.status === "completed" ? "line-through text-gray-400" : "text-gray-900"}`}>
              {todo.title}
            </p>
            {todo.recurrence && (
              <span title={`Repeats ${todo.recurrence}`} className="text-blue-400">↻</span>
            )}
          </div>

          {todo.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{todo.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[todo.priority]}`}>
              {todo.priority}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
              {CATEGORY_LABELS[todo.category]}
            </span>
            {todo.order_number && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                #{todo.order_number}
              </span>
            )}
            {dueBadge(todo)}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(todo)}
            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(todo.id)}
            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function Column({
  title,
  statusKey,
  todos,
  color,
  onComplete,
  onDelete,
  onEdit,
}: {
  title: string;
  statusKey: TodoStatus;
  todos: Todo[];
  color: string;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
}) {
  const filtered = todos.filter((t) => t.status === statusKey);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{filtered.length}</span>
      </div>
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-xs text-gray-400">
            No items
          </div>
        ) : (
          filtered.map((t) => (
            <TodoCard key={t.id} todo={t} onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Edit/Create Sheet ────────────────────────────────────────────────────────

function TodoSheet({
  todo,
  onClose,
  onSave,
}: {
  todo: Todo | null;
  onClose: () => void;
  onSave: (data: TodoCreate | TodoUpdate) => Promise<void>;
}) {
  const isEdit = !!todo;
  const [form, setForm] = useState<TodoCreate>({
    title: todo?.title ?? "",
    description: todo?.description ?? "",
    status: (todo?.status ?? "pending") as TodoStatus,
    priority: (todo?.priority ?? "medium") as TodoPriority,
    category: (todo?.category ?? "other") as TodoCategory,
    due_date: todo?.due_date ?? "",
    recurrence: (todo?.recurrence ?? "") as TodoRecurrence,
    recurrence_days: todo?.recurrence_days ?? undefined,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: TodoCreate = { ...form };
      if (!payload.description) delete payload.description;
      if (!payload.due_date) delete payload.due_date;
      if (!payload.recurrence) delete payload.recurrence;
      if (!payload.recurrence_days) delete payload.recurrence_days;
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? "Edit Todo" : "New Todo"}</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="What needs to be done?"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Optional details..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as TodoPriority }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as TodoCategory }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="billing">Billing</option>
                <option value="maintenance">Maintenance</option>
                <option value="workflow">Workflow</option>
                <option value="order">Order</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as TodoStatus }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="datetime-local"
              value={form.due_date ? form.due_date.slice(0, 16) : ""}
              onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value ? e.target.value + ":00" : "" }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Recurrence</label>
            <select
              value={form.recurrence ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, recurrence: e.target.value as TodoRecurrence || undefined }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No recurrence</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom (every N days)</option>
            </select>
          </div>

          {form.recurrence === "custom" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Every N days</label>
              <input
                type="number"
                min={1}
                value={form.recurrence_days ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, recurrence_days: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 15"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-auto w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Todo"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Quick Add ────────────────────────────────────────────────────────────────

export function QuickAddTodo({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TodoCategory>("other");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await todoService.create({
        title: title.trim(),
        category,
        priority,
        due_date: dueDate || undefined,
      });
      setTitle("");
      setDueDate("");
      setOpen(false);
      onCreated?.();
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center text-2xl transition-colors"
        title="Quick add todo"
      >
        +
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Quick Add Todo</h3>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <input
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TodoCategory)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="billing">Billing</option>
            <option value="maintenance">Maintenance</option>
            <option value="workflow">Workflow</option>
            <option value="order">Order</option>
            <option value="other">Other</option>
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TodoPriority)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add Todo"}
        </button>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TodoFilters>({});
  const [editTodo, setEditTodo] = useState<Todo | null | "new">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await todoService.list(filters);
      setTodos(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleComplete = async (id: string) => {
    await todoService.complete(id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this todo?")) return;
    await todoService.delete(id);
    load();
  };

  const handleSave = async (data: TodoCreate | TodoUpdate) => {
    if (editTodo === "new") {
      await todoService.create(data as TodoCreate);
    } else if (editTodo) {
      await todoService.update(editTodo.id, data);
    }
    load();
  };

  const overdueCount = todos.filter(
    (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Todos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} total{overdueCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">{overdueCount} overdue</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setEditTodo("new")}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <span>+ New Todo</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
        <select
          value={filters.status ?? ""}
          onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value as TodoStatus || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={filters.priority ?? ""}
          onChange={(e) => setFilters((p) => ({ ...p, priority: e.target.value as TodoPriority || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filters.category ?? ""}
          onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value as TodoCategory || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          <option value="billing">Billing</option>
          <option value="maintenance">Maintenance</option>
          <option value="workflow">Workflow</option>
          <option value="order">Order</option>
          <option value="other">Other</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.overdue_only ?? false}
            onChange={(e) => setFilters((p) => ({ ...p, overdue_only: e.target.checked || undefined }))}
            className="rounded"
          />
          Overdue only
        </label>
        {(filters.status || filters.priority || filters.category || filters.overdue_only) && (
          <button
            onClick={() => setFilters({})}
            className="text-xs text-blue-600 hover:underline ml-auto"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Column title="Pending" statusKey="pending" todos={todos} color="bg-gray-400"
            onComplete={handleComplete} onDelete={handleDelete} onEdit={setEditTodo} />
          <Column title="In Progress" statusKey="in_progress" todos={todos} color="bg-blue-500"
            onComplete={handleComplete} onDelete={handleDelete} onEdit={setEditTodo} />
          <Column title="Completed" statusKey="completed" todos={todos} color="bg-green-500"
            onComplete={handleComplete} onDelete={handleDelete} onEdit={setEditTodo} />
        </div>
      )}

      {editTodo !== null && (
        <TodoSheet
          todo={editTodo === "new" ? null : editTodo}
          onClose={() => setEditTodo(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
