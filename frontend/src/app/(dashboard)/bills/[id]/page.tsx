"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { billService, Bill, BillPaymentUpdate, BillCreate, transactionsService } from "@/hooks/services";
import type { FinancialTransaction } from "@/hooks/types";
import { useToast } from "@/hooks/toast";

const STATUS_STYLES: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700 border border-red-200",
  partial: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  paid: "bg-green-100 text-green-700 border border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partially Paid",
  paid: "Paid",
};

function fmt(n: number | undefined | null) {
  return (n ?? 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

interface EditForm {
  bill_date: string;
  goods_description: string;
  discount: number;
  amount_due: number;
  amount_paid: number;
  carrier: string;
  tracking_number: string;
  carton_count: string;
  total_weight: string;
  notes: string;
}

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState<BillPaymentUpdate>({ amount: 0 });
  const [submitting, setSubmitting] = useState(false);

  // Unlinked party payments
  const [unlinkedPayments, setUnlinkedPayments] = useState<FinancialTransaction[]>([]);
  const [loadingUnlinked, setLoadingUnlinked] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Edit mode
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    bill_date: "",
    goods_description: "",
    discount: 0,
    amount_due: 0,
    amount_paid: 0,
    carrier: "",
    tracking_number: "",
    carton_count: "",
    total_weight: "",
    notes: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchUnlinkedPayments = useCallback(async (partyId: string) => {
    setLoadingUnlinked(true);
    try {
      const res = await transactionsService.getTransactions({
        party_id: partyId,
        transaction_type: "payment",
        size: 100,
      });
      // Only show transactions that are not linked to any bill
      setUnlinkedPayments(res.data.filter((t) => !t.bill_id));
    } catch {
      // silently ignore
    } finally {
      setLoadingUnlinked(false);
    }
  }, []);

  useEffect(() => {
    billService
      .getById(id)
      .then((b) => {
        setBill(b);
        if (b.party_id) fetchUnlinkedPayments(b.party_id);
      })
      .catch(() => showToast("Bill not found", "error"))
      .finally(() => setLoading(false));
  }, [id, showToast, fetchUnlinkedPayments]);

  const handleLinkPayment = async (txId: string) => {
    if (!bill) return;
    setLinkingId(txId);
    try {
      await transactionsService.linkToBill(txId, bill.id);
      // Refresh bill to get updated amount_paid
      const updated = await billService.getById(bill.id);
      setBill(updated);
      // Remove from unlinked list
      setUnlinkedPayments((prev) => prev.filter((t) => t.id !== txId));
      showToast("Payment linked to bill", "success");
    } catch {
      showToast("Failed to link payment", "error");
    } finally {
      setLinkingId(null);
    }
  };

  const openEdit = () => {
    if (!bill) return;
    setEditForm({
      bill_date: bill.bill_date,
      goods_description: bill.order_items?.[0]?.description ?? "",
      discount: Number(bill.discount ?? 0),
      amount_due: Number(bill.amount_due),
      amount_paid: Number(bill.amount_paid ?? 0),
      carrier: bill.carrier ?? "",
      tracking_number: bill.tracking_number ?? "",
      carton_count: bill.carton_count != null ? String(bill.carton_count) : "",
      total_weight: bill.total_weight != null ? String(bill.total_weight) : "",
      notes: bill.notes ?? "",
    });
    setShowEdit(true);
  };

  const setEdit = (k: keyof EditForm, v: string | number) =>
    setEditForm((f) => ({ ...f, [k]: v }));

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bill) return;
    setSavingEdit(true);
    try {
      const payload = {
        bill_date: editForm.bill_date,
        goods_description: editForm.goods_description || undefined,
        discount: editForm.discount,
        amount_due: editForm.amount_due,
        amount_paid: editForm.amount_paid,
        carrier: editForm.carrier || undefined,
        tracking_number: editForm.tracking_number || undefined,
        carton_count: editForm.carton_count ? parseInt(editForm.carton_count) : undefined,
        total_weight: editForm.total_weight ? parseFloat(editForm.total_weight) : undefined,
        notes: editForm.notes || undefined,
      };
      const updated = await billService.update(bill.id, payload);
      setBill(updated);
      setShowEdit(false);
      showToast("Bill updated", "success");
    } catch {
      showToast("Failed to update bill", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!bill) return;
    if (!window.confirm(`Delete bill ${bill.bill_number}? This will revert the order to packing_complete and reverse the ledger entry.`)) return;
    setDeleting(true);
    try {
      await billService.delete(bill.id);
      showToast(`Bill ${bill.bill_number} deleted`, "success");
      router.push("/bills");
    } catch {
      showToast("Failed to delete bill", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bill) return;
    setSubmitting(true);
    try {
      const updated = await billService.recordPayment(bill.id, payment);
      setBill(updated);
      setShowPayment(false);
      showToast("Payment recorded", "success");
    } catch {
      showToast("Failed to record payment", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  if (!bill)
    return (
      <div className="text-gray-500 text-center py-20">Bill not found</div>
    );

  const discount = Number(bill.discount ?? 0);
  const subtotal = Number(bill.subtotal ?? bill.amount_due + discount);
  const amountDue = Number(bill.amount_due);
  const amountPaid = Number(bill.amount_paid);
  const outstanding = Number(bill.amount_outstanding ?? amountDue - amountPaid);
  const prevBalance = Number(bill.previous_balance ?? 0);
  const totalOutstanding = amountDue + prevBalance;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Toolbar — hidden on print */}
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back
        </button>
        <div className="flex gap-2">
          {bill.payment_status !== "paid" && (
            <button
              onClick={() => setShowPayment(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              Record Payment
            </button>
          )}
          <button
            onClick={openEdit}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Print / PDF
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {/* Inline Edit Panel */}
      {showEdit && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-6 print:hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Edit Bill</h2>
            <button
              onClick={() => setShowEdit(false)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              ✕ Cancel
            </button>
          </div>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400 font-normal">(shown on invoice for all line items)</span>
              </label>
              <input
                type="text"
                value={editForm.goods_description}
                onChange={(e) => setEdit("goods_description", e.target.value)}
                placeholder="e.g. Bed Rail Covers (Parachute + Kim Kim Net)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bill Date</label>
                <input
                  type="date"
                  required
                  value={editForm.bill_date}
                  onChange={(e) => setEdit("bill_date", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Discount (PKR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.discount || ""}
                  onChange={(e) => setEdit("discount", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount Due (PKR)</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={editForm.amount_due}
                  onChange={(e) => setEdit("amount_due", parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid (PKR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.amount_paid}
                  onChange={(e) => setEdit("amount_paid", parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Set to manually reconcile collected payments</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
                <input
                  type="text"
                  value={editForm.carrier}
                  onChange={(e) => setEdit("carrier", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tracking #</label>
                <input
                  type="text"
                  value={editForm.tracking_number}
                  onChange={(e) => setEdit("tracking_number", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cartons</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.carton_count}
                  onChange={(e) => setEdit("carton_count", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.total_weight}
                  onChange={(e) => setEdit("total_weight", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={2}
                value={editForm.notes}
                onChange={(e) => setEdit("notes", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {savingEdit ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invoice Document */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 print:shadow-none print:border-none print:rounded-none">

        {/* ── Invoice Header ── */}
        <div className="flex items-start justify-between pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1a2744] tracking-tight">
              CMT Stitching &amp; Packing
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Stitching &amp; Packing Department</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold text-gray-400 uppercase tracking-widest">Invoice</p>
            <p className="text-xl font-bold text-blue-600 mt-1">#{bill.bill_number}</p>
            <p className="text-sm text-gray-500 mt-1">
              Date:{" "}
              {new Date(bill.bill_date).toLocaleDateString("en-PK", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <span
              className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                STATUS_STYLES[bill.payment_status]
              }`}
            >
              {STATUS_LABELS[bill.payment_status]}
            </span>
          </div>
        </div>

        {/* ── Bill To + Order Reference ── */}
        <div className="grid grid-cols-2 gap-8 py-6 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Bill To
            </p>
            <p className="text-lg font-bold text-gray-900">{bill.party_name ?? "—"}</p>
            {bill.party_contact_person && (
              <p className="text-sm text-gray-600 mt-0.5">{bill.party_contact_person}</p>
            )}
            {bill.party_phone && (
              <p className="text-sm text-gray-600">{bill.party_phone}</p>
            )}
            {bill.party_address && (
              <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{bill.party_address}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Order Reference
            </p>
            <p className="text-base font-semibold text-gray-900">{bill.order_number ?? "—"}</p>
            <p className="text-sm text-gray-500 mt-1">Bill Date: {bill.bill_date}</p>
            {bill.carrier && (
              <p className="text-sm text-gray-500">Carrier: {bill.carrier}</p>
            )}
            {bill.tracking_number && (
              <p className="text-sm text-gray-500">Tracking: {bill.tracking_number}</p>
            )}
            {bill.carton_count != null && (
              <p className="text-sm text-gray-500">Cartons: {bill.carton_count}</p>
            )}
            {bill.total_weight != null && (
              <p className="text-sm text-gray-500">Weight: {bill.total_weight} kg</p>
            )}
          </div>
        </div>

        {/* ── Items Table ── */}
        <div className="mt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-semibold text-gray-600 w-8">#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Description</th>
                <th className="text-center px-3 py-2.5 font-semibold text-gray-600 w-16">Size</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-600 w-20">Qty</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-600 w-24">Stitch Rate</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-600 w-24">Pack Rate</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-600 w-28">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bill.order_items && bill.order_items.length > 0 ? (
                bill.order_items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2.5 text-gray-800">{item.description}</td>
                    <td className="px-3 py-2.5 text-center text-gray-700">{item.size}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmt(item.quantity)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">PKR {fmt(item.stitch_rate)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {item.pack_rate > 0 ? `PKR ${fmt(item.pack_rate)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                      PKR {fmt(item.amount)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-2.5 text-gray-400">1</td>
                  <td className="px-3 py-2.5 text-gray-800" colSpan={5}>
                    Stitching &amp; Packing Services
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                    PKR {fmt(subtotal)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Totals Section ── */}
        <div className="mt-6 flex justify-end">
          <div className="w-80 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>PKR {fmt(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-amber-700">
                <span>Discount</span>
                <span>- PKR {fmt(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-gray-300 pt-2 mt-2 text-gray-900">
              <span>Amount Due</span>
              <span>PKR {fmt(amountDue)}</span>
            </div>
            <div className="flex justify-between text-sm text-green-700">
              <span>Amount Paid</span>
              <span>PKR {fmt(amountPaid)}</span>
            </div>
            <div
              className={`flex justify-between text-base font-bold border-t border-gray-300 pt-2 mt-1 ${
                outstanding > 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              <span>Balance Due</span>
              <span>PKR {fmt(outstanding)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {bill.notes && (
          <div className="mt-6 text-sm text-gray-500 italic border-t border-gray-100 pt-4">
            Note: {bill.notes}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
          Thank you for your business. Generated by CMT Stitching System.
        </div>
      </div>

      {/* Unlinked Party Payments */}
      {bill.payment_status !== "paid" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 print:hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Unlinked Party Payments</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Payment transactions for {bill.party_name ?? "this party"} not yet linked to any bill
              </p>
            </div>
            {bill.party_id && (
              <button
                onClick={() => fetchUnlinkedPayments(bill.party_id!)}
                disabled={loadingUnlinked}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {loadingUnlinked ? "Loading…" : "Refresh"}
              </button>
            )}
          </div>
          {loadingUnlinked ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : unlinkedPayments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No unlinked payment transactions found for this party.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Date</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Description</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Method</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Amount</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {unlinkedPayments.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{tx.transaction_date}</td>
                      <td className="px-3 py-2 text-gray-700">{tx.description ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-500 capitalize">{tx.payment_method ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-700">
                        PKR {fmt(tx.amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleLinkPayment(tx.id)}
                          disabled={linkingId === tx.id}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60"
                        >
                          {linkingId === tx.id ? "Linking…" : "Link to this Bill"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:hidden">
          <form
            onSubmit={handlePayment}
            className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              Record Payment
            </h3>
            <p className="text-sm text-gray-500">
              Outstanding:{" "}
              <strong>PKR {fmt(outstanding)}</strong>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (PKR)
              </label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                max={outstanding}
                value={payment.amount || ""}
                onChange={(e) =>
                  setPayment((p) => ({
                    ...p,
                    amount: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                value={payment.payment_method || ""}
                onChange={(e) =>
                  setPayment((p) => ({ ...p, payment_method: e.target.value }))
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">—</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <input
                type="text"
                value={payment.notes || ""}
                onChange={(e) =>
                  setPayment((p) => ({ ...p, notes: e.target.value }))
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {submitting ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </form>
        </div>
      )}

      <style jsx global>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:border-none {
            border: none !important;
          }
          .print\\:rounded-none {
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
