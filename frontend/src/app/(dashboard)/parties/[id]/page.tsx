"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { partiesService, transactionsService } from "@/hooks/services";
import { formatDate, formatCurrency, balanceColor, todayInputDate } from "@/hooks/utils";
import { Button, Sheet, Spinner, Input } from "@/components/common";
import { TransactionForm } from "@/components/financial";
import type { Party, PartyLedgerResponse, FinancialTransaction } from "@/hooks/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDebit(tx: FinancialTransaction) {
  return tx.transaction_type === "payment" || tx.transaction_type === "expense";
}
function isCredit(tx: FinancialTransaction) {
  return tx.transaction_type === "income" || tx.transaction_type === "accessories";
}

// ─── Bill Preview Modal ───────────────────────────────────────────────────────

function BillPreview({
  tx,
  party,
  onClose,
}: {
  tx: FinancialTransaction;
  party: Party;
  onClose: () => void;
}) {
  const billRef = React.useRef<HTMLDivElement>(null);
  const printBill = () => {
    const content = billRef.current?.innerHTML ?? "";
    const win = window.open("", "_blank", "width=700,height=900");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Bill ${tx.reference_number ?? ""}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;padding:32px;color:#111}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a2744;padding-bottom:16px;margin-bottom:20px}
        .logo{font-size:20px;font-weight:700;color:#1a2744}
        .sub{font-size:12px;color:#666;margin-top:2px}
        .bill-no{font-size:14px;font-weight:700;color:#2563eb}
        .section{margin-bottom:18px}
        .label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
        .value{font-size:14px;color:#111}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th{background:#1a2744;color:#fff;padding:8px 12px;text-align:left;font-size:12px}
        td{padding:10px 12px;font-size:13px;border-bottom:1px solid #eee}
        .amount{font-size:22px;font-weight:700;color:#16a34a}
        .footer{margin-top:24px;border-top:1px solid #eee;padding-top:12px;font-size:11px;color:#aaa;text-align:center}
        .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534}
      </style>
    </head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">Bill Preview</span>
          <div className="flex gap-2">
            <button
              onClick={printBill}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2744] text-white text-xs font-medium rounded-lg hover:bg-[#253461] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* bill content */}
        <div ref={billRef} className="p-6">
          {/* header */}
          <div className="header flex items-start justify-between border-b-2 border-[#1a2744] pb-4 mb-5">
            <div>
              <p className="logo text-xl font-bold text-[#1a2744]">CMT Stitching System</p>
              <p className="sub text-xs text-gray-500 mt-0.5">Stitching &amp; Packing Department</p>
            </div>
            <div className="text-right">
              <p className="bill-no text-sm font-bold text-blue-600">
                Bill # {tx.reference_number ?? "—"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Date: {formatDate(tx.transaction_date)}</p>
              <p className="text-xs text-gray-400">Printed: {today}</p>
            </div>
          </div>

          {/* party */}
          <div className="mb-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Bill To</p>
            <p className="text-base font-bold text-gray-900">{party.name}</p>
            {party.contact_person && <p className="text-sm text-gray-500">{party.contact_person}</p>}
            {party.phone && <p className="text-sm text-gray-500">{party.phone}</p>}
          </div>

          {/* table */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#1a2744] text-white">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Description</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Type</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-3 text-gray-800">{tx.description}</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 capitalize">
                    {tx.transaction_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-green-600">
                  PKR {formatCurrency(tx.amount)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* total */}
          <div className="flex justify-end mt-4">
            <div className="bg-gray-50 rounded-lg px-5 py-3 text-right border border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Total Amount</p>
              <p className="text-2xl font-bold text-green-600 tabular-nums">
                PKR {formatCurrency(tx.amount)}
              </p>
            </div>
          </div>

          {/* payment method */}
          {tx.payment_method && (
            <p className="text-xs text-gray-400 mt-3">
              Payment Method: <span className="font-medium text-gray-600 capitalize">{tx.payment_method.replace("_", " ")}</span>
            </p>
          )}

          <p className="text-center text-xs text-gray-300 mt-6 pt-4 border-t border-gray-100">
            Generated by CMT Stitching System
          </p>
        </div>
      </div>
    </div>
  );
}

const TYPE_BADGE: Record<string, string> = {
  income:      "bg-green-100 text-green-700",
  accessories: "bg-teal-100 text-teal-700",
  payment:     "bg-red-100 text-red-700",
  expense:     "bg-orange-100 text-orange-700",
  adjustment:  "bg-purple-100 text-purple-700",
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
  const [editTx, setEditTx] = useState<FinancialTransaction | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [billTx, setBillTx] = useState<FinancialTransaction | null>(null);

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
            opening += isCredit(tx) ? Number(tx.amount) : -Number(tx.amount);
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
          credit += Number(tx.amount);
          running += Number(tx.amount);
        } else {
          debit += Number(tx.amount);
          running -= Number(tx.amount);
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

  // ─── Delete transaction ─────────────────────────────────────────────────────

  const handleDeleteTx = async (txId: string) => {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    setDeletingTxId(txId);
    try {
      await transactionsService.deleteTransaction(txId);
      load();
    } catch {
      alert("Failed to delete transaction.");
    } finally {
      setDeletingTxId(null);
    }
  };

  // ─── Print handler ──────────────────────────────────────────────────────────

  const handlePrint = () => {
    window.print();
  };

  // ─── Download PDF handler ────────────────────────────────────────────────────

  const handleDownloadPdf = () => {
    const content = printRef.current?.innerHTML ?? "";
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Account Statement — ${party?.name ?? ""}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;color:#111;background:#fff}
        @media print{
          @page{size:A4 landscape;margin:15mm}
          body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
        }
        /* hide action column and filter bar */
        .print\\:hidden{display:none!important}
        /* header */
        .border-b{border-bottom:1px solid #e5e7eb}
        .border-gray-200{border-color:#e5e7eb}
        .p-6{padding:24px}
        .pb-5{padding-bottom:20px}
        .flex{display:flex}
        .items-start{align-items:flex-start}
        .items-end{align-items:flex-end}
        .justify-between{justify-content:space-between}
        .text-xl{font-size:20px}
        .text-lg{font-size:18px}
        .text-sm{font-size:13px}
        .text-xs{font-size:11px}
        .text-2xl{font-size:24px}
        .font-bold{font-weight:700}
        .font-semibold{font-weight:600}
        .font-medium{font-weight:500}
        .text-gray-900{color:#111827}
        .text-gray-700{color:#374151}
        .text-gray-600{color:#4b5563}
        .text-gray-500{color:#6b7280}
        .text-gray-400{color:#9ca3af}
        .text-gray-300{color:#d1d5db}
        .text-blue-600{color:#2563eb}
        .text-green-600{color:#16a34a}
        .text-green-300{color:#86efac}
        .text-red-600{color:#dc2626}
        .text-red-300{color:#fca5a5}
        .mt-0\\.5{margin-top:2px}
        .mt-1{margin-top:4px}
        .mt-4{margin-top:16px}
        .max-w-xs{max-width:280px}
        /* uppercase/tracking */
        .uppercase{text-transform:uppercase}
        .tracking-wider{letter-spacing:.05em}
        .tabular-nums{font-variant-numeric:tabular-nums}
        .whitespace-nowrap{white-space:nowrap}
        /* table */
        table{width:100%;border-collapse:collapse}
        thead tr.bg-gray-800{background:#1f2937!important}
        thead tr.bg-gray-800 th{color:#fff!important;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
        thead tr.bg-gray-800 th:last-child{display:none}
        tbody td{padding:8px 12px;font-size:12px;border-bottom:1px solid #f3f4f6}
        tbody td:last-child{display:none}
        tbody tr.bg-gray-50{background:#f9fafb!important}
        tbody tr:nth-child(even){background:#fafafa}
        tfoot tr.bg-gray-50 td{padding:10px 12px;font-size:12px;background:#f9fafb!important;border-top:2px solid #d1d5db}
        tfoot tr.bg-gray-800{background:#1f2937!important}
        tfoot tr.bg-gray-800 td{color:#fff!important;padding:10px 12px;font-size:13px;font-weight:700}
        .text-right{text-align:right}
        .text-left{text-align:left}
        /* badge */
        .inline-flex{display:inline-flex}
        .items-center{align-items:center}
        .px-2{padding-left:8px;padding-right:8px}
        .py-0\\.5{padding-top:2px;padding-bottom:2px}
        .rounded{border-radius:4px}
        .bg-green-100{background:#dcfce7!important}
        .text-green-700{color:#15803d}
        .bg-red-100{background:#fee2e2!important}
        .text-red-700{color:#b91c1c}
        .bg-orange-100{background:#ffedd5!important}
        .text-orange-700{color:#c2410c}
        .bg-purple-100{background:#f3e8ff!important}
        .text-purple-700{color:#7e22ce}
        .bg-gray-100{background:#f3f4f6!important}
        .text-gray-600{color:#4b5563}
        /* footer */
        .px-6{padding-left:24px;padding-right:24px}
        .py-3{padding-top:12px;padding-bottom:12px}
        .border-t{border-top:1px solid #e5e7eb}
        .border-gray-100{border-color:#f3f4f6}
        .overflow-x-auto{overflow-x:auto}
        /* misc */
        .rounded-xl{border-radius:12px}
        .shadow-sm{box-shadow:0 1px 2px rgba(0,0,0,.05)}
        .overflow-hidden{overflow:hidden}
        .divide-y > *+*{border-top:1px solid #f3f4f6}
        .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .block{display:block}
        .capitalize{text-transform:capitalize}
        .border-t-2{border-top:2px solid #d1d5db}
        .max-w-\\[240px\\]{max-width:240px}
        /* hide filter bar explicitly */
        .bg-gray-50\\/60{background:rgba(249,250,251,.6)}
      </style>
    </head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  // ─── WhatsApp Share handler ──────────────────────────────────────────────────

  const handleWhatsAppShare = () => {
    if (!party) return;
    const MAX_TX = 20;
    const total = filteredRows.length;
    const rows = filteredRows.slice(-MAX_TX);

    const periodFrom = dateFrom
      ? new Date(dateFrom).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "All time";
    const periodTo = dateTo
      ? new Date(dateTo).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "Present";

    const balanceLabel =
      closingBalance > 0 ? "Receivable" : closingBalance < 0 ? "Payable" : "Settled";

    const divider = "━━━━━━━━━━━━━━━━━━━";

    const txLines = rows.map((tx) => {
      const date = new Date(tx.transaction_date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const type = tx.transaction_type.charAt(0).toUpperCase() + tx.transaction_type.slice(1);
      const desc = tx.description ?? "—";
      const amount = isDebit(tx)
        ? `Dr PKR ${formatCurrency(tx.amount)}`
        : `Cr PKR ${formatCurrency(tx.amount)}`;
      return `${date} | ${type} | ${desc} | ${amount}`;
    });

    const truncationNote =
      total > MAX_TX ? `_(Showing last ${MAX_TX} of ${total} transactions)_\n` : "";

    const message =
      `*CMT Stitching System — Account Statement*\n` +
      `Party: ${party.name}\n` +
      (party.phone ? `${party.phone}\n` : "") +
      `Period: ${periodFrom} — ${periodTo}\n` +
      `${divider}\n` +
      truncationNote +
      txLines.join("\n") +
      `\n${divider}\n` +
      `Total Debit: PKR ${formatCurrency(totalDebit)}\n` +
      `Total Credit: PKR ${formatCurrency(totalCredit)}\n` +
      `Closing Balance: PKR ${formatCurrency(Math.abs(closingBalance))} (${balanceLabel})\n` +
      `${divider}\n` +
      `_Generated by CMT Stitching System_`;

    window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank");
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
    month: "2-digit",
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
          {/* PDF Download */}
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6" />
            </svg>
            PDF
          </Button>
          {/* Print */}
          <Button variant="secondary" size="sm" onClick={handlePrint}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </Button>
          {/* WhatsApp Share */}
          <button
            onClick={handleWhatsAppShare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </button>
          {/* Record Transaction */}
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
                <th className="px-4 py-2.5 print:hidden" />
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
                <td className="print:hidden" />
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
                    className={`group hover:bg-blue-50/40 transition-colors ${
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
                      {tx.reference_number ? (
                        <button
                          onClick={() => setBillTx(tx)}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {tx.reference_number}
                        </button>
                      ) : "—"}
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
                    <td className="px-2 py-2.5 print:hidden">
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

      {/* ═══════ Edit Transaction Sheet ═══════ */}
      <Sheet open={!!editTx} onClose={() => setEditTx(null)} title="Edit Transaction">
        {editTx && (
          <TransactionForm
            partyId={id}
            initialData={editTx}
            onSuccess={() => { setEditTx(null); load(); }}
            onCancel={() => setEditTx(null)}
          />
        )}
      </Sheet>

      {/* ═══════ Bill Preview Modal ═══════ */}
      {billTx && party && (
        <BillPreview tx={billTx} party={party} onClose={() => setBillTx(null)} />
      )}
    </div>
  );
}
