"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { transactionsService, partiesService, shareLinksService, ShareLink, ShareLinkCreate } from "@/hooks/services";
import { formatDate, formatCurrency } from "@/hooks/utils";
import {
  Button, Sheet, Pagination, Select, Input, Spinner,
} from "@/components/common";
import { TransactionForm } from "@/components/financial";
import type {
  FinancialTransaction, Party, TransactionFilters, TransactionType, PaginatedResponse,
} from "@/hooks/types";

// Debit = invoices/bills raised (party owes us) + expenses we incurred
// Credit = cash/bank payments received from party
const DEBIT_TYPES = new Set(["income", "accessories", "packing", "expense_material", "expense_transport", "expense_misc", "expense", "purchase", "stock_consumption"]);
const CREDIT_TYPES = new Set(["payment", "adjustment"]);

function isDebit(tx: FinancialTransaction) {
  return DEBIT_TYPES.has(tx.transaction_type);
}
function isCredit(tx: FinancialTransaction) {
  return CREDIT_TYPES.has(tx.transaction_type);
}

const TYPE_BADGE: Record<string, string> = {
  income:            "bg-green-100 text-green-700",
  accessories:       "bg-teal-100 text-teal-700",
  packing:           "bg-blue-100 text-blue-700",
  expense_material:  "bg-orange-100 text-orange-700",
  expense_transport: "bg-orange-100 text-orange-700",
  expense_misc:      "bg-orange-100 text-orange-700",
  expense:           "bg-orange-100 text-orange-700",
  payment:           "bg-red-100 text-red-700",
  purchase:          "bg-indigo-100 text-indigo-700",
  stock_consumption: "bg-amber-100 text-amber-700",
  adjustment:        "bg-purple-100 text-purple-700",
};

const TYPE_LABEL: Record<string, string> = {
  income:            "Income",
  accessories:       "Accessories",
  packing:           "Packing",
  expense_material:  "Exp. Material",
  expense_transport: "Exp. Transport",
  expense_misc:      "Exp. Misc",
  expense:           "Expense",
  payment:           "Payment",
  purchase:          "Purchase",
  stock_consumption: "Stock Consumption",
  adjustment:        "Adjustment",
};

export default function LedgerPage() {
  const [result, setResult] = useState<PaginatedResponse<FinancialTransaction>>({
    data: [], total: 0, page: 1, size: 100,
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1, size: 100 });
  const [parties, setParties] = useState<Party[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTx, setEditTx] = useState<FinancialTransaction | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [reconcileMode, setReconcileMode] = useState(false);
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [shareForm, setShareForm] = useState<ShareLinkCreate>({ party_id: "", date_from: "", date_to: "" });
  const [sharingLoading, setSharingLoading] = useState(false);
  const [newLink, setNewLink] = useState<ShareLink | null>(null);

  // Load reconciliation marks from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("ledger_reconcile_marks");
      if (stored) setMarkedIds(new Set(JSON.parse(stored)));
    } catch { /* ignore */ }
  }, []);

  const toggleMark = (txId: string) => {
    setMarkedIds((prev) => {
      const next = new Set(prev);
      next.has(txId) ? next.delete(txId) : next.add(txId);
      localStorage.setItem("ledger_reconcile_marks", JSON.stringify([...next]));
      return next;
    });
  };

  const clearMarks = () => {
    setMarkedIds(new Set());
    localStorage.removeItem("ledger_reconcile_marks");
  };

  const load = useCallback(async (f: TransactionFilters) => {
    setLoading(true);
    try {
      setResult(await transactionsService.getTransactions(f));
    } catch {
      // silently keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters);
    partiesService.getParties(1, 100).then((r) => setParties(r.data ?? [])).catch(() => {});
  }, [load, filters]);

  const loadShareLinks = useCallback(async (partyId: string) => {
    try {
      setShareLinks(await shareLinksService.listByParty(partyId));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setShareForm((f) => ({ ...f, party_id: filters.party_id ?? "" }));
    setNewLink(null);
    if (filters.party_id) loadShareLinks(filters.party_id);
    else setShareLinks([]);
  }, [filters.party_id, loadShareLinks]);

  const handleCreateShareLink = async () => {
    if (!shareForm.party_id || !shareForm.date_from || !shareForm.date_to) return;
    setSharingLoading(true);
    try {
      const link = await shareLinksService.create(shareForm);
      setNewLink(link);
      loadShareLinks(shareForm.party_id);
    } catch {
      alert("Failed to create share link.");
    } finally {
      setSharingLoading(false);
    }
  };

  const handleRevokeLink = async (id: string) => {
    if (!confirm("Revoke this link? Anyone with the URL will lose access.")) return;
    try {
      await shareLinksService.revoke(id);
      if (shareForm.party_id) loadShareLinks(shareForm.party_id);
      if (newLink?.id === id) setNewLink(null);
    } catch {
      alert("Failed to revoke link.");
    }
  };

  const handleFilter = (patch: Partial<TransactionFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  };

  const handleDeleteTx = async (txId: string) => {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    setDeletingTxId(txId);
    try {
      await transactionsService.deleteTransaction(txId);
      load(filters);
    } catch {
      alert("Failed to delete transaction.");
    } finally {
      setDeletingTxId(null);
    }
  };

  // Page totals + running balance per row
  // Debit (invoices raised) increases what party owes; Credit (payments received) reduces it
  const { totalDebit, totalCredit, rows } = useMemo(() => {
    let debit = 0, credit = 0, running = 0;
    const rows = result.data.map((tx) => {
      if (isDebit(tx))  { debit  += Number(tx.amount); running += Number(tx.amount); }
      else              { credit += Number(tx.amount); running -= Number(tx.amount); }
      return { ...tx, running };
    });
    return { totalDebit: debit, totalCredit: credit, rows };
  }, [result.data]);

  // netBalance > 0 means outstanding receivable (debit > credit = party still owes us)
  const netBalance = totalDebit - totalCredit;
  const hasFilters = !!(filters.party_id || filters.date_from || filters.date_to || filters.transaction_type);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  const colSpan = reconcileMode ? 9 : 8;

  return (
    <div className="space-y-4">
      {/* ─── Statement Header ─────────────────────────────── */}
      <div className="bg-[#1a2744] rounded-2xl px-6 py-4 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-bold text-white">General Ledger</h1>
          <p className="text-xs text-blue-300 mt-0.5">
            CMT Stitching System · {result.total} transaction{result.total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.print()}
            className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReconcileMode((v) => !v)}
            className={reconcileMode
              ? "!bg-amber-500 !text-white !border-amber-600 hover:!bg-amber-600"
              : "!bg-white/10 !text-white !border-white/20 hover:!bg-white/20"
            }
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {reconcileMode ? "Reconciling…" : "Reconcile"}
          </Button>
          {reconcileMode && markedIds.size > 0 && (
            <button
              onClick={clearMarks}
              className="text-xs text-amber-300 hover:text-white font-medium"
            >
              Clear {markedIds.size} mark{markedIds.size !== 1 ? "s" : ""}
            </button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShareSheetOpen(true)}
            disabled={!filters.party_id}
            title={!filters.party_id ? "Select a party to share their statement" : "Share party statement"}
            className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </Button>
          <Button onClick={() => setSheetOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Transaction
          </Button>
        </div>
      </div>
      {/* Print-only statement header */}
      <div className="hidden print:block bg-white rounded-xl border border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">General Ledger Statement</h1>
            <p className="text-sm text-gray-500">CMT Stitching System</p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p>Statement Date: <span className="font-medium text-gray-700">{today}</span></p>
          </div>
        </div>
      </div>

      {/* ─── Filters (hidden on print) ─────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm print:hidden">
        <div className="px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</span>

          <Select
            className="w-44 !text-sm !py-1.5"
            value={filters.party_id ?? ""}
            onChange={(e) => handleFilter({ party_id: e.target.value || undefined })}
          >
            <option value="">All parties</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>

          <Select
            className="w-36 !text-sm !py-1.5"
            value={filters.transaction_type ?? ""}
            onChange={(e) =>
              handleFilter({ transaction_type: (e.target.value as TransactionType) || undefined })
            }
          >
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="packing">Packing</option>
            <option value="accessories">Accessories</option>
            <option value="payment">Payment</option>
            <option value="expense_material">Expense Material</option>
            <option value="expense_transport">Expense Transport</option>
            <option value="expense_misc">Expense Miscellaneous</option>
            <option value="adjustment">Adjustment</option>
          </Select>

          <Input
            type="date"
            className="w-40 !text-sm !py-1.5"
            value={filters.date_from ?? ""}
            onChange={(e) => handleFilter({ date_from: e.target.value || undefined })}
          />
          <span className="text-gray-400 text-sm">to</span>
          <Input
            type="date"
            className="w-40 !text-sm !py-1.5"
            value={filters.date_to ?? ""}
            onChange={(e) => handleFilter({ date_to: e.target.value || undefined })}
          />

          {hasFilters && (
            <button
              onClick={() => setFilters({ page: 1, size: 30 })}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear all
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400">
            {result.data.length} shown of {result.total}
          </span>
        </div>
      </div>

      {/* ─── Main Ledger Card ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-0 print:rounded-none">

        {/* Print-only statement header */}
        <div className="hidden print:block border-b border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">General Ledger</h1>
              <p className="text-sm text-gray-500 mt-0.5">CMT Stitching System</p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>Statement Date: <span className="font-medium text-gray-700">{today}</span></p>
              {(filters.date_from || filters.date_to) && (
                <p className="mt-0.5">
                  Period:{" "}
                  <span className="font-medium text-gray-700">
                    {filters.date_from ? formatDate(filters.date_from) : "All time"}
                  </span>
                  {" — "}
                  <span className="font-medium text-gray-700">
                    {filters.date_to ? formatDate(filters.date_to) : "Present"}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Summary strip */}
        <div className="px-4 py-3 bg-gray-50/60 border-b border-gray-100 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-gray-500">Total Debit:</span>
            <span className="text-sm font-bold tabular-nums text-red-600">
              PKR {formatCurrency(totalDebit)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-500">Total Credit:</span>
            <span className="text-sm font-bold tabular-nums text-green-600">
              PKR {formatCurrency(totalCredit)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Net (page):</span>
            <span className={`text-sm font-bold tabular-nums ${netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
              {netBalance >= 0 ? "+" : "−"} PKR {formatCurrency(Math.abs(netBalance))}
            </span>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Party</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Reference</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Method</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Debit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Credit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Balance</th>
                {reconcileMode && <th className="px-2 py-2.5 print:hidden w-8" />}
              <th className="px-4 py-2.5 print:hidden sticky right-0 bg-gray-800" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={colSpan + 1} className="px-4 py-12 text-center">
                    <Spinner className="w-5 h-5 mx-auto" />
                  </td>
                </tr>
              ) : result.data.length === 0 ? (
                <tr>
                  <td colSpan={colSpan + 1} className="px-4 py-12 text-center text-gray-400">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                rows.map((tx, i) => {
                  const isMarked = markedIds.has(tx.id);
                  return (
                  <tr
                    key={tx.id}
                    className={`group transition-colors ${
                      isMarked
                        ? "bg-green-50 hover:bg-green-100/70"
                        : i % 2 === 0
                          ? "bg-white hover:bg-blue-50/40"
                          : "bg-gray-50/30 hover:bg-blue-50/40"
                    }`}
                  >
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {formatDate(tx.transaction_date)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {CREDIT_TYPES.has(tx.transaction_type) && !tx.bill_id && (
                          <span
                            title="Unlinked payment — not applied to any bill. Edit this transaction to link it to a bill."
                            className="inline-flex items-center text-amber-500"
                          >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_BADGE[tx.transaction_type] ?? "bg-gray-100 text-gray-600"}`}>
                          {TYPE_LABEL[tx.transaction_type] ?? tx.transaction_type}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-800 font-medium whitespace-nowrap">
                      {tx.party_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 max-w-[200px]">
                      <span className="block truncate">{tx.description}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {tx.reference_number ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs capitalize whitespace-nowrap">
                      {tx.payment_method?.replace("_", " ") ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {isDebit(tx) ? (
                        <span className="text-red-600 font-medium">{formatCurrency(tx.amount)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {isCredit(tx) ? (
                        <span className="text-green-600 font-medium">{formatCurrency(tx.amount)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${
                      tx.running >= 0 ? "text-gray-900" : "text-red-600"
                    }`}>
                      {formatCurrency(tx.running)}
                    </td>
                    {reconcileMode && (
                      <td className="px-2 py-2.5 print:hidden text-center">
                        <button
                          onClick={() => toggleMark(tx.id)}
                          title={isMarked ? "Unmark" : "Mark as reconciled"}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isMarked
                              ? "bg-green-500 border-green-600 text-white"
                              : "border-gray-300 hover:border-green-400"
                          }`}
                        >
                          {isMarked && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-2 py-2.5 print:hidden sticky right-0 bg-inherit border-l border-gray-100">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditTx(tx)}
                          className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteTx(tx.id)}
                          disabled={deletingTxId === tx.id}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-gray-700" colSpan={6}>
                    Page Total
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-700">
                    {formatCurrency(totalDebit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-700">
                    {formatCurrency(totalCredit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-400 text-xs font-normal">
                    page net
                  </td>
                </tr>
                <tr className="bg-[#1a2744] text-white font-bold">
                  <td className="px-4 py-3" colSpan={6}>
                    Net Balance (this page)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" colSpan={2}>
                    {netBalance >= 0 ? (
                      <span className="text-green-300">Net Receivable</span>
                    ) : (
                      <span className="text-red-300">Net Payable</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-lg">
                    PKR {formatCurrency(Math.abs(netBalance))}
                  </td>
                </tr>
                <tr>
                  <td colSpan={9} className="px-4 py-2 text-center text-xs text-gray-400 italic border-t border-gray-100">
                    This is a computer-generated statement and does not require a signature.
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-2 bg-gray-50/60 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
          <span>Generated by CMT Stitching System</span>
          <span>Printed on {today}</span>
        </div>
      </div>

      {/* Pagination */}
      <div className="print:hidden">
        <Pagination
          total={result.total}
          page={filters.page ?? 1}
          size={filters.size ?? 30}
          onChange={(p) => setFilters((f) => ({ ...f, page: p }))}
        />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New Transaction">
        <TransactionForm
          onSuccess={() => { setSheetOpen(false); load(filters); }}
          onCancel={() => setSheetOpen(false)}
        />
      </Sheet>

      <Sheet open={!!editTx} onClose={() => setEditTx(null)} title="Edit Transaction">
        {editTx && (
          <TransactionForm
            initialData={editTx}
            onSuccess={() => { setEditTx(null); load(filters); }}
            onCancel={() => setEditTx(null)}
          />
        )}
      </Sheet>

      <Sheet open={shareSheetOpen} onClose={() => { setShareSheetOpen(false); setNewLink(null); }} title="Share Statement">
        <div className="space-y-5 p-1">
          <p className="text-sm text-gray-500">
            Generate a read-only link for{" "}
            <span className="font-medium text-gray-800">
              {parties.find((p) => p.id === filters.party_id)?.name ?? "this party"}
            </span>
            . Anyone with the link can view the statement without logging in.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
              <input
                type="date"
                value={shareForm.date_from}
                onChange={(e) => setShareForm((f) => ({ ...f, date_from: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input
                type="date"
                value={shareForm.date_to}
                onChange={(e) => setShareForm((f) => ({ ...f, date_to: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <Button
            onClick={handleCreateShareLink}
            disabled={sharingLoading || !shareForm.date_from || !shareForm.date_to}
            className="w-full"
          >
            {sharingLoading ? "Generating…" : "Generate Link"}
          </Button>

          {newLink && (() => {
            const url = `${window.location.origin}/share/${newLink.token}`;
            const partyName = parties.find((p) => p.id === newLink.party_id)?.name ?? "Party";
            const waText = encodeURIComponent(
              `Dear ${partyName},\n\nPlease find your account statement for the period ${newLink.date_from} to ${newLink.date_to}:\n${url}\n\nThis is a read-only link.`
            );
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Link Ready</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={url}
                    className="flex-1 text-xs border border-blue-200 rounded-lg px-3 py-2 bg-white text-gray-700 truncate"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(url)}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
                  >
                    Copy
                  </button>
                </div>
                <a
                  href={`https://wa.me/?text=${waText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.857L.057 23.882l6.187-1.623A11.935 11.935 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.805 9.805 0 01-5.034-1.388l-.361-.214-3.732.979 1.001-3.641-.235-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                  </svg>
                  Share on WhatsApp
                </a>
              </div>
            );
          })()}

          {shareLinks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Links</p>
              <div className="space-y-2">
                {shareLinks.filter((l) => !l.is_revoked).map((l) => (
                  <div key={l.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <p className="text-xs font-medium text-gray-700">{l.date_from} → {l.date_to}</p>
                    </div>
                    <button
                      onClick={() => handleRevokeLink(l.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
                {shareLinks.filter((l) => !l.is_revoked).length === 0 && (
                  <p className="text-xs text-gray-400 italic">No active links for this party.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
