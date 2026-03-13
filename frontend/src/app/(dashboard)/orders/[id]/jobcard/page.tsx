"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ordersService,
  productionService,
  expensesService,
  billService,
} from "@/hooks/services";
import type { Bill } from "@/hooks/services";
import { formatDate, formatCurrency } from "@/hooks/utils";
import type { Order, ProductionSession, Expense } from "@/hooks/types";

export default function JobCardPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [stitchSessions, setStitchSessions] = useState<ProductionSession[]>([]);
  const [packSessions, setPackSessions] = useState<ProductionSession[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(`jobcard_notes_${id}`);
    if (saved) setNotes(saved);

    Promise.all([
      ordersService.getOrder(id),
      productionService.getSessionsForOrder(id, "stitching"),
      productionService.getSessionsForOrder(id, "packing"),
      expensesService.listByOrder(id),
      billService.getByOrder(id).catch(() => null),
    ]).then(([o, ss, ps, exp, b]) => {
      setOrder(o);
      setStitchSessions(ss);
      setPackSessions(ps);
      setExpenses(exp.data);
      setBill(b);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleNotesChange = (v: string) => {
    setNotes(v);
    localStorage.setItem(`jobcard_notes_${id}`, v);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading job card…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">Order not found.</p>
      </div>
    );
  }

  const qty          = order.total_quantity;
  const stitchParty  = Number(order.stitch_rate_party) * qty;
  const stitchLabor  = Number(order.stitch_rate_labor) * qty;
  const packParty    = (order.pack_rate_party ?? 0) * qty;
  const packLabor    = (order.pack_rate_labor ?? 0) * qty;
  const transport    = Number(order.transport_expense ?? 0);
  const loading_exp  = Number(order.loading_expense ?? 0);
  const misc         = Number(order.miscellaneous_expense ?? 0);
  const rent         = Number(order.rent ?? 0);
  const loadCharges  = Number(order.loading_charges ?? 0);
  const extraExp     = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const totalIncome  = stitchParty + packParty;
  const totalLabor   = stitchLabor + packLabor;
  const totalOps     = transport + loading_exp + misc + rent + loadCharges + extraExp;
  const netProfit    = totalIncome - totalLabor - totalOps;
  const margin       = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

  const stitchHours  = stitchSessions.reduce((s, r) => s + Number(r.duration_hours ?? 0), 0);
  const packHours    = packSessions.reduce((s, r) => s + Number(r.duration_hours ?? 0), 0);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  const Row = ({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) => (
    <div className={`flex justify-between py-1 border-b border-gray-100 text-sm ${bold ? "font-bold" : ""}`}>
      <span className="text-gray-600">{label}{sub && <span className="text-xs text-gray-400 ml-1">{sub}</span>}</span>
      <span className={bold ? "text-gray-900" : "text-gray-800"}>{value}</span>
    </div>
  );

  return (
    <>
      {/* Print controls — hidden on print */}
      <div className="print:hidden fixed top-4 right-4 flex gap-2 z-50">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
        >
          Print / Save PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
        >
          Close
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-8 print:p-0 print:max-w-full font-sans text-gray-900">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex justify-between items-start border-b-2 border-gray-900 pb-4 mb-6">
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase">CMT Stitching &amp; Packing</h1>
            <p className="text-xs text-gray-500 mt-0.5">Internal Cost Analysis &amp; Job Card</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Generated: {today}</p>
            <p className="text-xs text-gray-400 mt-0.5">CONFIDENTIAL — COMPANY USE ONLY</p>
          </div>
        </div>

        {/* ── Order Details ───────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-6 text-sm">
          <div className="flex gap-2">
            <span className="text-gray-400 w-28 flex-shrink-0">Order #</span>
            <span className="font-bold">{order.order_number}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-28 flex-shrink-0">Status</span>
            <span className="font-medium capitalize">{order.status.replace(/_/g, " ")}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-28 flex-shrink-0">Party</span>
            <span className="font-medium">{order.party_name ?? order.party_reference ?? "—"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-28 flex-shrink-0">Party Ref</span>
            <span>{order.party_reference ?? "—"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-28 flex-shrink-0">Goods</span>
            <span>{order.goods_description}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-28 flex-shrink-0">Product</span>
            <span>{order.product_name ?? "—"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-28 flex-shrink-0">Total Qty</span>
            <span className="font-bold">{qty.toLocaleString()} pcs</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-400 w-28 flex-shrink-0">Entry Date</span>
            <span>{formatDate(order.entry_date)}</span>
          </div>
          {order.delivery_date && (
            <div className="flex gap-2">
              <span className="text-gray-400 w-28 flex-shrink-0">Delivery</span>
              <span>{formatDate(order.delivery_date)}</span>
            </div>
          )}
          {order.arrival_date && (
            <div className="flex gap-2">
              <span className="text-gray-400 w-28 flex-shrink-0">Arrival</span>
              <span>{formatDate(order.arrival_date)}</span>
            </div>
          )}
        </div>

        {/* ── Size Breakdown ──────────────────────────────────── */}
        {order.items && order.items.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Size Breakdown</h2>
            <table className="w-full text-sm border border-gray-200 rounded">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Size</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-600">Ordered</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-600">Stitched</th>
                  <th className="px-3 py-1.5 text-right font-semibold text-gray-600">Packed</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-medium">{item.size}</td>
                    <td className="px-3 py-1.5 text-right">{item.quantity}</td>
                    <td className="px-3 py-1.5 text-right">{item.completed_quantity}</td>
                    <td className="px-3 py-1.5 text-right">{item.packed_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Production Summary ──────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Production</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded p-3">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">🧵 Stitching</p>
              <p className="text-sm"><span className="font-bold">{stitchSessions.length}</span> sessions</p>
              <p className="text-sm"><span className="font-bold">{stitchHours.toFixed(1)}h</span> total</p>
              {stitchSessions.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {stitchSessions.map((s) => (
                    <p key={s.id} className="text-xs text-gray-500">
                      {formatDate(s.session_date)} — {s.machines_used} machine{s.machines_used !== 1 ? "s" : ""}, {s.duration_hours ?? 0}h
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="border border-gray-200 rounded p-3">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">📦 Packing</p>
              <p className="text-sm"><span className="font-bold">{packSessions.length}</span> sessions</p>
              <p className="text-sm"><span className="font-bold">{packHours.toFixed(1)}h</span> total</p>
              {packSessions.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {packSessions.map((s) => (
                    <p key={s.id} className="text-xs text-gray-500">
                      {formatDate(s.session_date)} — {s.machines_used} machine{s.machines_used !== 1 ? "s" : ""}, {s.duration_hours ?? 0}h
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Cost Analysis ───────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Cost Analysis</h2>

          {/* Income */}
          <div className="mb-3">
            <p className="text-xs font-semibold text-green-700 uppercase mb-1">Income (Party Charges)</p>
            <Row label="Stitch Rate (Party)" sub={`${order.stitch_rate_party} × ${qty.toLocaleString()}`} value={`PKR ${formatCurrency(stitchParty)}`} />
            {packParty > 0 && <Row label="Pack Rate (Party)" sub={`${order.pack_rate_party} × ${qty.toLocaleString()}`} value={`PKR ${formatCurrency(packParty)}`} />}
            <Row label="Total Income" value={`PKR ${formatCurrency(totalIncome)}`} bold />
          </div>

          {/* Labor */}
          <div className="mb-3">
            <p className="text-xs font-semibold text-orange-700 uppercase mb-1">Labor Cost</p>
            <Row label="Stitch Labor" sub={`${order.stitch_rate_labor} × ${qty.toLocaleString()}`} value={`PKR ${formatCurrency(stitchLabor)}`} />
            {packLabor > 0 && <Row label="Pack Labor" sub={`${order.pack_rate_labor} × ${qty.toLocaleString()}`} value={`PKR ${formatCurrency(packLabor)}`} />}
            <Row label="Total Labor" value={`PKR ${formatCurrency(totalLabor)}`} bold />
          </div>

          {/* Overheads */}
          {(transport + loading_exp + misc + rent + loadCharges) > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-red-700 uppercase mb-1">Overheads</p>
              {transport > 0    && <Row label="Electricity Consumed"        value={`PKR ${formatCurrency(transport)}`} />}
              {loading_exp > 0  && <Row label="Thread Used/pcs"          value={`PKR ${formatCurrency(loading_exp)}`} />}
              {misc > 0         && <Row label="Master Cutting Wage/pcs"  value={`PKR ${formatCurrency(misc)}`} />}
              {rent > 0         && <Row label="Rent"             value={`PKR ${formatCurrency(rent)}`} />}
              {loadCharges > 0  && <Row label="Loading Charges"  value={`PKR ${formatCurrency(loadCharges)}`} />}
            </div>
          )}

          {/* Extra Expenses */}
          {expenses.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-red-700 uppercase mb-1">Extra Expenses</p>
              {expenses.map((e) => (
                <Row
                  key={e.id}
                  label={e.description ?? "Expense"}
                  sub={e.expense_date ? formatDate(e.expense_date) : undefined}
                  value={`PKR ${formatCurrency(e.amount)}`}
                />
              ))}
              <Row label="Total Extra Expenses" value={`PKR ${formatCurrency(extraExp)}`} bold />
            </div>
          )}

          {/* Net Summary */}
          <div className="mt-4 border-t-2 border-gray-900 pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Income</span>
              <span className="font-semibold text-green-700">PKR {formatCurrency(totalIncome)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Labor Cost</span>
              <span className="font-semibold text-orange-700">- PKR {formatCurrency(totalLabor)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Overheads &amp; Expenses</span>
              <span className="font-semibold text-red-700">- PKR {formatCurrency(totalOps)}</span>
            </div>
            <div className="flex justify-between text-base font-black border-t border-gray-300 pt-2 mt-2">
              <span>Net Profit</span>
              <span className={netProfit >= 0 ? "text-green-700" : "text-red-700"}>
                PKR {formatCurrency(netProfit)} ({margin.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        {/* ── Billing Status ──────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Billing</h2>
          {bill ? (
            <div className="border border-gray-200 rounded p-3 space-y-1">
              <Row label="Bill #"          value={bill.bill_number} />
              <Row label="Bill Date"       value={formatDate(bill.bill_date)} />
              <Row label="Amount Billed"   value={`PKR ${formatCurrency(bill.amount_due)}`} />
              {Number(bill.discount ?? 0) > 0 && (
                <Row label="Discount" value={`PKR ${formatCurrency(bill.discount ?? 0)}`} />
              )}
              <Row label="Amount Paid"     value={`PKR ${formatCurrency(bill.amount_paid)}`} />
              <Row label="Balance Due"     value={`PKR ${formatCurrency(Number(bill.amount_due) - Number(bill.amount_paid))}`} bold />
              <Row label="Payment Status"  value={bill.payment_status.toUpperCase()} bold />
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No bill generated yet.</p>
          )}
        </div>

        {/* ── Notes ──────────────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Notes</h2>
          {/* Editable textarea — screen only */}
          <textarea
            className="print:hidden w-full border border-gray-200 rounded p-2 text-sm text-gray-700 resize-y focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-300"
            rows={3}
            placeholder="Add internal notes for this job card…"
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
          />
          {/* Print version — only shown when printing */}
          {notes.trim() && (
            <div className="hidden print:block border border-gray-300 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap">
              {notes}
            </div>
          )}
          {!notes.trim() && (
            <div className="hidden print:block text-sm text-gray-400 italic">No notes.</div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="border-t border-gray-200 pt-4 text-xs text-gray-400 flex justify-between">
          <span>CMT Stitching System — Internal Document</span>
          <span>Printed: {today}</span>
        </div>

      </div>

      <style>{`
        @media print {
          body { margin: 0; }
          @page { margin: 12mm; size: A4; }
        }
      `}</style>
    </>
  );
}
