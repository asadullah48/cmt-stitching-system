"use client";

import React, { useCallback, useEffect, useState } from "react";
import { cashAccountService, cashEntryService, overheadExpenseService } from "@/hooks/services";
import { formatCurrency } from "@/hooks/utils";
import type {
  CashAccount, CashEntry, CashEntryCreate,
  OverheadExpense, OverheadExpenseCreate, MarkPaidRequest,
  OverheadCategory, OverheadRecurrence,
} from "@/hooks/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<OverheadCategory, string> = {
  rent: "bg-blue-100 text-blue-700",
  wages: "bg-green-100 text-green-700",
  utilities: "bg-yellow-100 text-yellow-700",
  insurance: "bg-purple-100 text-purple-700",
  other: "bg-gray-100 text-gray-600",
};

function isDue(exp: OverheadExpense): boolean {
  return new Date(exp.due_date) <= new Date() && exp.status === "unpaid";
}

// ─── Balance Card ─────────────────────────────────────────────────────────────

function BalanceCard({ account, onAdjust }: { account: CashAccount; onAdjust: (a: CashAccount) => void }) {
  const isCash = account.account_type === "cash";
  return (
    <div className={`rounded-2xl p-5 flex items-center justify-between ${isCash ? "bg-emerald-50 border border-emerald-200" : "bg-blue-50 border border-blue-200"}`}>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{account.name}</p>
        <p className={`text-3xl font-extrabold mt-1 ${isCash ? "text-emerald-700" : "text-blue-700"}`}>
          {formatCurrency(account.current_balance)}
        </p>
        {account.note && <p className="text-xs text-gray-400 mt-1">{account.note}</p>}
      </div>
      <button onClick={() => onAdjust(account)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
        + Entry
      </button>
    </div>
  );
}

// ─── Entry Sheet ──────────────────────────────────────────────────────────────

function EntrySheet({ account, onClose, onSaved }: { account: CashAccount; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CashEntryCreate>({
    account_id: account.id,
    entry_type: "credit",
    amount: 0,
    description: "",
    entry_date: new Date().toISOString().slice(0, 10),
    source: "manual",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await cashEntryService.create(form); onSaved(); onClose(); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Add Entry — {account.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={submit} className="flex-1 px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["credit", "debit"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setForm((p) => ({ ...p, entry_type: t }))}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${form.entry_type === t ? (t === "credit" ? "bg-emerald-600 text-white border-emerald-600" : "bg-red-600 text-white border-red-600") : "bg-white text-gray-600 border-gray-300"}`}>
                  {t === "credit" ? "↑ Credit" : "↓ Debit"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount (PKR)</label>
            <input required type="number" min={1} value={form.amount || ""}
              onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input required value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Received payment from party" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={form.entry_date} onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={saving} className="mt-auto w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "Add Entry"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Expense Sheet ────────────────────────────────────────────────────────────

function ExpenseSheet({ expense, onClose, onSaved }: { expense: OverheadExpense | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<OverheadExpenseCreate>({
    title: expense?.title ?? "",
    category: (expense?.category ?? "other") as OverheadCategory,
    amount: expense?.amount ?? 0,
    due_date: expense?.due_date ?? new Date().toISOString().slice(0, 10),
    description: expense?.description ?? "",
    recurrence: (expense?.recurrence ?? "") as OverheadRecurrence,
    recurrence_days: expense?.recurrence_days ?? undefined,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.description) delete payload.description;
      if (!payload.recurrence) delete payload.recurrence;
      if (!payload.recurrence_days) delete payload.recurrence_days;
      if (expense) { await overheadExpenseService.update(expense.id, payload); }
      else { await overheadExpenseService.create(payload); }
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{expense ? "Edit Expense" : "New Overhead Expense"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Factory Rent March" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as OverheadCategory }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="rent">Rent</option>
                <option value="wages">Wages</option>
                <option value="utilities">Utilities</option>
                <option value="insurance">Insurance</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount (PKR)</label>
              <input required type="number" min={1} value={form.amount || ""}
                onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={2} value={form.description ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Recurrence</label>
            <select value={form.recurrence ?? ""} onChange={(e) => setForm((p) => ({ ...p, recurrence: e.target.value as OverheadRecurrence || undefined }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">One-off</option>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom (every N days)</option>
            </select>
          </div>
          {form.recurrence === "custom" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Every N days</label>
              <input type="number" min={1} value={form.recurrence_days ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, recurrence_days: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <button type="submit" disabled={saving} className="mt-auto w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : expense ? "Save Changes" : "Add Expense"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Pay Modal ────────────────────────────────────────────────────────────────

function PayModal({ expense, accounts, onClose, onPaid }: { expense: OverheadExpense; accounts: CashAccount[]; onClose: () => void; onPaid: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await overheadExpenseService.pay(expense.id, { account_id: accountId }); onPaid(); onClose(); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Mark as Paid</h3>
        <p className="text-sm text-gray-500 mb-4">{expense.title} — {formatCurrency(expense.amount)}</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pay from</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} — {formatCurrency(a.current_balance)}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {saving ? "Paying..." : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OverheadPage() {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [expenses, setExpenses] = useState<OverheadExpense[]>([]);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [runningBalance, setRunningBalance] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<"expenses" | "ledger">("expenses");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [entrySheet, setEntrySheet] = useState<CashAccount | null>(null);
  const [expenseSheet, setExpenseSheet] = useState<OverheadExpense | null | "new">(null);
  const [payModal, setPayModal] = useState<OverheadExpense | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const loadAccounts = useCallback(async () => {
    const data = await cashAccountService.list();
    setAccounts(data);
    if (!selectedAccount && data.length > 0) setSelectedAccount(data[0].id);
  }, [selectedAccount]);

  const loadExpenses = useCallback(async () => {
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    if (categoryFilter) params.category = categoryFilter;
    const data = await overheadExpenseService.list(params);
    setExpenses(data.data);
  }, [statusFilter, categoryFilter]);

  const loadEntries = useCallback(async () => {
    if (!selectedAccount) return;
    const data = await cashEntryService.list({ account_id: selectedAccount, size: 100 });
    setEntries(data.data);
    setRunningBalance((p) => ({ ...p, [selectedAccount]: data.running_balance }));
  }, [selectedAccount]);

  const reload = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([loadAccounts(), loadExpenses(), loadEntries()]); } finally { setLoading(false); }
  }, [loadAccounts, loadExpenses, loadEntries]);

  useEffect(() => { reload(); }, [reload]);

  const unpaidCount = expenses.filter((e) => e.status === "unpaid").length;
  const overdueCount = expenses.filter(isDue).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overhead & Cash</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {unpaidCount} unpaid
            {overdueCount > 0 && <span className="ml-2 text-red-600 font-medium">{overdueCount} overdue</span>}
          </p>
        </div>
        <button onClick={() => setExpenseSheet("new")} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
          + Add Expense
        </button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {accounts.map((a) => <BalanceCard key={a.id} account={a} onAdjust={setEntrySheet} />)}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["expenses", "ledger"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t === "expenses" ? "Overhead Expenses" : "Cash Ledger"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading...</div>
      ) : tab === "expenses" ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Status</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Categories</option>
              <option value="rent">Rent</option>
              <option value="wages">Wages</option>
              <option value="utilities">Utilities</option>
              <option value="insurance">Insurance</option>
              <option value="other">Other</option>
            </select>
            {(statusFilter || categoryFilter) && (
              <button onClick={() => { setStatusFilter(""); setCategoryFilter(""); }} className="text-xs text-blue-600 hover:underline ml-auto">Clear</button>
            )}
          </div>

          {/* Expense list */}
          {expenses.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">No expenses found</div>
          ) : (
            <div className="flex flex-col gap-3">
              {expenses.map((exp) => (
                <div key={exp.id} className={`bg-white border rounded-xl p-4 flex items-center gap-4 ${isDue(exp) ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{exp.title}</p>
                      {exp.recurrence && <span className="text-blue-400 text-sm">↻</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[exp.category]}`}>{exp.category}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${exp.status === "paid" ? "bg-green-100 text-green-700" : isDue(exp) ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {exp.status === "paid" ? "paid" : isDue(exp) ? "overdue" : "unpaid"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Due: {new Date(exp.due_date).toLocaleDateString()}
                      {exp.paid_from_account_name && ` · Paid via ${exp.paid_from_account_name}`}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-800 flex-shrink-0">{formatCurrency(exp.amount)}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {exp.status === "unpaid" && (
                      <button onClick={() => setPayModal(exp)} className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors">
                        Pay →
                      </button>
                    )}
                    <button onClick={() => setExpenseSheet(exp)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={async () => { if (confirm("Delete this expense?")) { await overheadExpenseService.delete(exp.id); reload(); } }}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Account selector */}
          <div className="flex gap-2">
            {accounts.map((a) => (
              <button key={a.id} onClick={() => setSelectedAccount(a.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${selectedAccount === a.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                {a.name}
              </button>
            ))}
          </div>

          {/* Ledger table */}
          {entries.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">No entries yet</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Description</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Credit</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Debit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{new Date(e.entry_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-gray-800">{e.description}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium">{e.entry_type === "credit" ? formatCurrency(e.amount) : "—"}</td>
                      <td className="px-4 py-3 text-right text-red-500 font-medium">{e.entry_type === "debit" ? formatCurrency(e.amount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700">Running Balance</td>
                    <td colSpan={2} className="px-4 py-3 text-right text-base font-bold text-blue-700">{formatCurrency(runningBalance[selectedAccount] ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {entrySheet && <EntrySheet account={entrySheet} onClose={() => setEntrySheet(null)} onSaved={reload} />}
      {expenseSheet !== null && <ExpenseSheet expense={expenseSheet === "new" ? null : expenseSheet} onClose={() => setExpenseSheet(null)} onSaved={reload} />}
      {payModal && <PayModal expense={payModal} accounts={accounts} onClose={() => setPayModal(null)} onPaid={reload} />}
    </div>
  );
}
