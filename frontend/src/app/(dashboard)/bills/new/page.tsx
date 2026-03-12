"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { billService, ordersService, BillCreate } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import type { Order } from "@/hooks/types";

export default function NewBillPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [autoMode, setAutoMode] = useState(true);
  const [nextNumber, setNextNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<BillCreate>({
    order_id: params.get("order") || "",
    bill_number: "",
    bill_series: "A",
    bill_date: new Date().toISOString().split("T")[0],
    amount_due: 0,
  });

  // Load packing_complete orders without bills
  useEffect(() => {
    ordersService
      .getOrders({ size: 200, status: "packing_complete" })
      .then((res) => setOrders(res.data))
      .catch(() => {});
  }, []);

  // Fetch next number when series changes
  useEffect(() => {
    if (!autoMode) return;
    billService
      .nextNumber(form.bill_series!)
      .then((res) => setNextNumber(res.next_number))
      .catch(() => {});
  }, [form.bill_series, autoMode]);

  // Auto-calculate amount_due when order is selected
  useEffect(() => {
    if (!form.order_id) return;
    const order = orders.find((o) => o.id === form.order_id);
    if (!order) return;
    const stitch = Number(order.stitch_rate_party) * order.total_quantity;
    const pack = order.pack_rate_party
      ? Number(order.pack_rate_party) * order.total_quantity
      : 0;
    setForm((f) => ({ ...f, amount_due: stitch + pack }));
  }, [form.order_id, orders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: BillCreate = {
        ...form,
        bill_number: autoMode ? undefined : form.bill_number,
      };
      const bill = await billService.create(payload);
      showToast(`Bill ${bill.bill_number} created`, "success");
      router.push(`/bills/${bill.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create bill";
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const set = (k: keyof BillCreate, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Bill</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Creates dispatch record, updates ledger &amp; marks order complete
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5"
      >
        {/* Order */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Order *
          </label>
          <select
            required
            value={form.order_id}
            onChange={(e) => set("order_id", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select an order...</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_number} — {o.party_name ?? "No party"}
              </option>
            ))}
          </select>
        </div>

        {/* Bill Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bill Number *
          </label>
          <div className="flex gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={autoMode}
                onChange={() => setAutoMode(true)}
              />{" "}
              Auto-generate
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={!autoMode}
                onChange={() => setAutoMode(false)}
              />{" "}
              Manual
            </label>
          </div>
          {autoMode ? (
            <div className="flex gap-3 items-center">
              <select
                value={form.bill_series}
                onChange={(e) => set("bill_series", e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {["A", "B", "C", "D", "E"].map((s) => (
                  <option key={s} value={s}>
                    Series {s}
                  </option>
                ))}
              </select>
              <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                Will be assigned:{" "}
                <span className="font-semibold text-blue-600">{nextNumber}</span>
              </div>
            </div>
          ) : (
            <input
              type="text"
              placeholder="e.g. A51 or B07"
              value={form.bill_number}
              onChange={(e) => set("bill_number", e.target.value.toUpperCase())}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase"
              pattern="[A-Za-z]+[0-9]+"
              title="Series letter(s) followed by number, e.g. A51"
            />
          )}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bill Date *
          </label>
          <input
            type="date"
            required
            value={form.bill_date}
            onChange={(e) => set("bill_date", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount Due (PKR) *
          </label>
          <input
            type="number"
            required
            min="0"
            step="0.01"
            value={form.amount_due}
            onChange={(e) =>
              set("amount_due", parseFloat(e.target.value) || 0)
            }
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            Auto-calculated from order rates — adjust if needed
          </p>
        </div>

        {/* Dispatch details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Carrier
            </label>
            <input
              type="text"
              value={form.carrier || ""}
              onChange={(e) => set("carrier", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tracking #
            </label>
            <input
              type="text"
              value={form.tracking_number || ""}
              onChange={(e) => set("tracking_number", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cartons
            </label>
            <input
              type="number"
              min="0"
              value={form.carton_count || ""}
              onChange={(e) =>
                set("carton_count", parseInt(e.target.value) || undefined)
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Weight (kg)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.total_weight || ""}
              onChange={(e) =>
                set("total_weight", parseFloat(e.target.value) || undefined)
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            rows={2}
            value={form.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create Bill"}
          </button>
        </div>
      </form>
    </div>
  );
}
