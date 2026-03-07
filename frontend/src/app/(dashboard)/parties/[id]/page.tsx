"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { partiesService } from "@/hooks/services";
import { formatDate, formatCurrency, balanceColor, todayInputDate } from "@/hooks/utils";
import { Button, Sheet, Spinner, Input } from "@/components/common";
import { TransactionForm } from "@/components/financial";
import type { Party, PartyLedgerResponse, FinancialTransaction } from "@/hooks/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PartyLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  const [ledger, setLedger] = useState<PartyLedgerResponse | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [txSheet, setTxSheet] = useState(false);

  // Date range filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayInputDate());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerData, partyData] = await Promise.all([
        partiesService.getPartyLedger(id),
        partiesService.getParty(id),
      ]);
      setLedger(ledgerData);
      setParty(partyData);
    } catch {
      router.push("/parties");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // ─── Filtered & computed ledger rows ────────────────────────────────────────

  const { openingBalance, filteredRows, totalDebit, totalCredit, closingBalance } =
    useMemo(() => {
      if (!ledger) return { openingBalance: 0, filteredRows: [] as (FinancialTransaction & { running: number })[], totalDebit: 0, totalCredit: 0, closingBalance: 0 };

      // Sort all transactions ASC by date
      const sorted = [...ledger.transactions].sort(
        (a, b) => a.transaction_date.localeCompare(b.transaction_date) || a.created_at.localeCompare(b.created_at)
      );

      // Compute opening balance = sum of all transactions BEFORE dateFrom
      let opening = 0;
      if (dateFrom) {
        for (const tx of sorted) {
          if (tx.transaction_date < dateFrom) {
            opening += isCredit(tx) ? tx.amount : -tx.amount;
          }
        }
      }

      // Filter transactions within date range
      const inRange = sorted.filter((tx) => {
        if (dateFrom && tx.transaction_date < dateFrom) return false;
        if (dateTo && tx.transaction_date > dateTo) return false;
        return true;
      });

      // Build running balance from opening
      let running = opening;
      let debit = 0;
      let credit = 0;

      const rows = inRange.map((tx) => {
        if (isCredit(tx)) {
          credit += tx.amount;
          running += tx.amount;
        } else {
          debit += tx.amount;
          running -= tx.amount;
        }
        return { ...tx, running };
      });

      return {
        openingBalance: opening,
        filteredRows: rows,
        totalDebit: debit,
        totalCredit: credit,
        closingBalance: running,
      };
    }, [ledger, dateFrom, dateTo]);

  // ─── Print handler ──────────────────────────────────────────────────────────

  const handlePrint = () => {
    window.print();
  };

  // ─── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (!ledger || !party) return null;
  const { balance } = ledger;

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Back nav — hide on print */}
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={() => router.push("/parties")}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Parties
        </button>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handlePrint}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </Button>
          <Button onClick={() => setTxSheet(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Record Transaction
          </Button>
        </div>
      </div>

      {/* ═══════ PRINTABLE LEDGER STATEMENT ═══════ */}
      <div ref={printRef} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-0 print:rounded-none">

        {/* ─── Statement Header ──────────────────────────────────── */}
        <div className="border-b border-gray-200 p-6 pb-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Account Statement</h1>
              <p className="text-sm text-gray-500 mt-0.5">CMT Stitching System</p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>Statement Date: <span className="font-medium text-gray-700">{today}</span></p>
              <p className="mt-0.5">
                Period: <span className="font-medium text-gray-700">
                  {dateFrom ? formatDate(dateFrom) : "All time"}
                </span>
                {" — "}
                <span className="font-medium text-gray-700">
                  {dateTo ? formatDate(dateTo) : "Present"}
                </span>
              </p>
            </div>
          </div>

          {/* Party info row */}
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Account</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{party.name}</p>
              {party.contact_person && (
                <p className="text-sm text-gray-500">{party.contact_person}</p>
              )}
              {party.phone && (
                <p className="text-sm text-gray-500">{party.phone}</p>
              )}
              {party.address && (
                <p className="text-sm text-gray-400 mt-0.5 max-w-xs">{party.address}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Current Balance</p>
              <p className={`text-2xl font-bold mt-0.5 tabular-nums ${balanceColor(balance)}`}>
                PKR {formatCurrency(Math.abs(balance))}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {balance > 0 ? "Receivable" : balance < 0 ? "Payable" : "Settled"}
              </p>
            </div>
          </div>
        </div>

        {/* ─── Date Filters (hidden on print) ────────────────────── */}
        <div className="px-6 py-3 bg-gray-50/60 border-b border-gray-100 flex items-center gap-3 print:hidden">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter</span>
          <Input
            type="date"
            className="w-40 !text-sm !py-1.5"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From date"
          />
          <span className="text-gray-400 text-sm">to</span>
          <Input
            type="date"
            className="w-40 !text-sm !py-1.5"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          {(dateFrom || dateTo !== todayInputDate()) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(todayInputDate()); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Reset
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {filteredRows.length} transaction{filteredRows.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ─── Ledger Table ──────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Reference</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Method</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Debit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Credit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Balance</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {/* Opening Balance Row */}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-2.5 text-gray-600">
                  {dateFrom ? formatDate(dateFrom) : "—"}
                </td>
                <td className="px-4 py-2.5 text-gray-700" colSpan={4}>
                  Opening Balance
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">—</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">—</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                  openingBalance >= 0 ? "text-gray-900" : "text-red-600"
                }`}>
                  {formatCurrency(openingBalance)}
                </td>
              </tr>

              {/* Transaction Rows */}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    No transactions in this period.
                  </td>
                </tr>
              ) : (
                filteredRows.map((tx, i) => (
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
                    <td className="px-4 py-2.5 text-gray-800 max-w-[240px]">
                      <span className="block truncate">{tx.description}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {tx.reference_number ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs capitalize whitespace-nowrap">
                      {tx.payment_method?.replace("_", " ") ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {isDebit(tx) ? (
                        <span className="text-red-600 font-medium">
                          {formatCurrency(tx.amount)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {isCredit(tx) ? (
                        <span className="text-green-600 font-medium">
                          {formatCurrency(tx.amount)}
                        </span>
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

            {/* ─── Summary Footer ────────────────────────────────── */}
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-700" colSpan={5}>
                  Period Total
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-red-700">
                  {formatCurrency(totalDebit)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-green-700">
                  {formatCurrency(totalCredit)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums"></td>
              </tr>
              <tr className="bg-gray-800 text-white font-bold">
                <td className="px-4 py-3" colSpan={5}>
                  Closing Balance
                </td>
                <td className="px-4 py-3 text-right tabular-nums" colSpan={2}>
                  {closingBalance >= 0 ? (
                    <span className="text-green-300">Net Receivable</span>
                  ) : (
                    <span className="text-red-300">Net Payable</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-lg">
                  PKR {formatCurrency(Math.abs(closingBalance))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ─── Footer Note ───────────────────────────────────────── */}
        <div className="px-6 py-3 bg-gray-50/60 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
          <span>Generated by CMT Stitching System</span>
          <span>Printed on {today}</span>
        </div>
      </div>

      {/* ═══════ Quick Stats (hidden on print) ═══════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Total Debit</p>
          <p className="text-xl font-bold mt-1 tabular-nums text-red-600">
            PKR {formatCurrency(totalDebit)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Total Credit</p>
          <p className="text-xl font-bold mt-1 tabular-nums text-green-600">
            PKR {formatCurrency(totalCredit)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Transactions</p>
          <p className="text-xl font-bold mt-1 text-gray-900">{filteredRows.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Payment Terms</p>
          <p className="text-sm font-semibold mt-1 text-gray-900">{party.payment_terms ?? "—"}</p>
        </div>
      </div>

      {/* ═══════ Transaction Sheet ═══════ */}
      <Sheet open={txSheet} onClose={() => setTxSheet(false)} title="Record Transaction">
        <TransactionForm
          partyId={id}
          onSuccess={() => { setTxSheet(false); load(); }}
          onCancel={() => setTxSheet(false)}
        />
      </Sheet>
    </div>
  );
}
