"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { billService, Bill, BillPaymentUpdate } from "@/hooks/services";
import { useToast } from "@/hooks/toast";

const STATUS_STYLES: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
};

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState<BillPaymentUpdate>({ amount: 0 });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    billService.getById(id)
      .then(setBill)
      .catch(() => showToast("Bill not found", "error"))
      .finally(() => setLoading(false));
  }, [id, showToast]);

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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!bill) return <div className="text-gray-500 text-center py-20">Bill not found</div>;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Toolbar (hidden on print) */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <div className="flex gap-2">
          {bill.payment_status !== "paid" && (
            <button onClick={() => setShowPayment(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              Record Payment
            </button>
          )}
          <button onClick={() => window.print()}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            Print / PDF
          </button>
        </div>
      </div>

      {/* Bill Document */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 print:shadow-none print:border-none">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">BILL</h1>
            <p className="text-xl font-semibold text-blue-600 mt-1">#{bill.bill_number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">CMT Stitching &amp; Packing</p>
            <p className="text-sm text-gray-500">Date: {bill.bill_date}</p>
            <span className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[bill.payment_status]}`}>
              {bill.payment_status}
            </span>
          </div>
        </div>

        {/* Order & Party */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Bill To</p>
            <p className="font-semibold text-gray-900">{bill.party_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Order Reference</p>
            <p className="font-semibold text-gray-900">{bill.order_number}</p>
          </div>
        </div>

        {/* Dispatch Details */}
        {(bill.carrier || bill.tracking_number || bill.carton_count || bill.total_weight) && (
          <div className="bg-gray-50 rounded-lg p-4 mb-8 grid grid-cols-2 gap-4 text-sm">
            {bill.carrier && <div><span className="text-gray-500">Carrier:</span> <span className="font-medium">{bill.carrier}</span></div>}
            {bill.tracking_number && <div><span className="text-gray-500">Tracking:</span> <span className="font-medium">{bill.tracking_number}</span></div>}
            {bill.carton_count && <div><span className="text-gray-500">Cartons:</span> <span className="font-medium">{bill.carton_count}</span></div>}
            {bill.total_weight && <div><span className="text-gray-500">Weight:</span> <span className="font-medium">{bill.total_weight} kg</span></div>}
          </div>
        )}

        {/* Amounts */}
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Amount Due</span>
            <span className="font-semibold">PKR {Number(bill.amount_due).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Amount Paid</span>
            <span className="font-semibold text-green-600">PKR {Number(bill.amount_paid).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
            <span>Outstanding</span>
            <span className={bill.amount_outstanding > 0 ? "text-red-600" : "text-green-600"}>
              PKR {Number(bill.amount_outstanding).toLocaleString()}
            </span>
          </div>
        </div>

        {bill.notes && (
          <div className="mt-6 text-sm text-gray-500 italic border-t border-gray-100 pt-4">
            {bill.notes}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:hidden">
          <form onSubmit={handlePayment} className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Record Payment</h3>
            <p className="text-sm text-gray-500">Outstanding: <strong>PKR {Number(bill.amount_outstanding).toLocaleString()}</strong></p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (PKR)</label>
              <input type="number" required min="1" step="0.01" max={bill.amount_outstanding}
                value={payment.amount || ""}
                onChange={e => setPayment(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select value={payment.payment_method || ""} onChange={e => setPayment(p => ({ ...p, payment_method: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">—</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={payment.notes || ""}
                onChange={e => setPayment(p => ({ ...p, notes: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowPayment(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {submitting ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
