"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { transactionsService, partiesService } from "@/hooks/services";
import { formatDate, formatCurrency, todayInputDate } from "@/hooks/utils";
import {
  PageHeader, Button, Sheet, Pagination, Select, Input, Spinner,
} from "@/components/common";
import { TransactionForm } from "@/components/financial";
import type {
  FinancialTransaction, Party, TransactionFilters, TransactionType, PaginatedResponse,
} from "@/hooks/types";

function isDebit(tx: FinancialTransaction) {
  return tx.transaction_type === "payment" || tx.transaction_type === "expense";
}
function isCredit(tx: FinancialTransaction) {
  return tx.transaction_type === "income";
}

const TYPE_BADGE: Record<string, string> = {
  income:     "bg-green-100 text-green-700",
  payment:    "bg-red-100 text-red-700",
  expense:    "bg-orange-100 text-orange-700",
  adjustment: "bg-purple-100 text-purple-700",
};

export default function LedgerPage() {
  const [result, setResult] = useState<PaginatedResponse<FinancialTransaction>>({
    data: [], total: 0, page: 1, size: 30,
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1, size: 30 });
  const [parties, setParties] = useState<Party[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async (f: TransactionFilters) => {
    setLoading(true);
    try {
      setResult(await transactionsService.getTransactions(f));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters);
    partiesService.getParties(1, 100).then((r) => setParties(r.data));
  }, [load, filters]);

  const handleFilter = (patch: Partial<TransactionFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  };

  // Page totals + running balance per row
  const { totalDebit, totalCredit, rows } = useMemo(() => {
    let debit = 0, credit = 0, running = 0;
    const rows = result.data.map((tx) => {
      if (isCredit(tx)) { credit += tx.amount; running += tx.amount; }
      else               { debit  += tx.amount; running -= tx.amount; }
      return { ...tx, running };
    });
    return { totalDebit: debit, totalCredit: credit, rows };
  }, [result.data]);

  const netBalance = totalCredit - totalDebit;
  const hasFilters = !!(filters.party_id || filters.date_from || filters.date_to || filters.transaction_type);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  const colSpan = 8;

  return (
    <div className="space-y-4">
      <PageHeader
        title="General Ledger"
        subtitle={`${result.total} transaction${result.total !== 1 ? "s" : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </Button>
            <Button onClick={() => setSheetOpen(true)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Transaction
            </Button>
          </div>
        }
      />

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
            <option value="payment">Payment</option>
            <option value="expense">Expense</option>
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
                rows.map((tx, i) => (
                  <tr
                    key={tx.id}
                    className={`hover:bg-blue-50/40 transition-colors ${
                      i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                    }`}
                  >
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {formatDate(tx.transaction_date)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${TYPE_BADGE[tx.transaction_type] ?? "bg-gray-100 text-gray-600"}`}>
                        {tx.transaction_type}
                      </span>
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
                  </tr>
                ))
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
                <tr className="bg-gray-800 text-white font-bold">
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
    </div>
  );
}
