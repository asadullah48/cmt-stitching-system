"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { billService, ordersService, partiesService, accessoryService, BillCreate } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import type { Order, Party } from "@/hooks/types";

function NewBillForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [autoMode, setAutoMode] = useState(true);
  const [nextNumber, setNextNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [subtotal, setSubtotal] = useState(0);
  const initSeries = params.get("series")?.toUpperCase() || "A";
  const initBillType = (initSeries === "D" || initSeries === "E" || params.get("party")) ? "standalone" : "order";
  const [billType, setBillType] = useState<"order" | "standalone">(initBillType as "order" | "standalone");
  const [parties, setParties] = useState<Party[]>([]);

  const urlOrderId = params.get("order") || "";
  const urlSeries = params.get("series")?.toUpperCase() || "A";
  const urlPartyId = params.get("party") || "";

  const [form, setForm] = useState<BillCreate & { discount: number }>({
    order_id: urlOrderId,
    party_id: urlPartyId,
    description: "",
    bill_number: "",
    bill_series: urlSeries,
    bill_date: new Date().toISOString().split("T")[0],
    amount_due: 0,
    discount: 0,
  });

  // Load all orders across pages (backend max size=100)
  useEffect(() => {
    async function loadAllOrders() {
      try {
        const first = await ordersService.getOrders({ size: 100, page: 1 });
        let all = first.data;
        const totalPages = Math.ceil(first.total / 100);
        if (totalPages > 1) {
          const rest = await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              ordersService.getOrders({ size: 100, page: i + 2 })
            )
          );
          all = [...all, ...rest.flatMap((r) => r.data)];
        }
        setOrders(all);
        if (urlOrderId && !all.find((o) => o.id === urlOrderId)) {
          ordersService.getOrder(urlOrderId).then((order) => {
            setOrders((prev) => prev.find((o) => o.id === urlOrderId) ? prev : [...prev, order]);
          }).catch(() => {});
        }
      } catch {
        // silently ignore
      } finally {
        setLoadingOrders(false);
      }
    }
    loadAllOrders();
  }, [urlOrderId]);

  useEffect(() => {
    partiesService.getParties(1, 200).then((r) => setParties(r.data ?? [])).catch(() => {});
  }, []);

  // Fetch next number when series changes
  useEffect(() => {
    if (!autoMode) return;
    billService
      .nextNumber(form.bill_series!)
      .then((res) => setNextNumber(res.next_number))
      .catch(() => {});
  }, [form.bill_series, autoMode]);

  // Auto-calculate amount_due when order or series changes
  useEffect(() => {
    if (!form.order_id) return;
    const order = orders.find((o) => o.id === form.order_id);
    if (!order) return;

    // B sub-orders bill additional charges manually — no auto stitch/pack calc
    if (order.sub_suffix === "B") {
      setSubtotal(0);
      setForm((f) => ({ ...f, amount_due: 0 }));
      return;
    }

    const seriesUpper = (form.bill_series ?? "A").toUpperCase();
    const isASeries = seriesUpper === "A";
    const isBSeries = seriesUpper === "B";
    const isCSeries = seriesUpper === "C";
    const isDSeries = seriesUpper === "D" || seriesUpper === "E";

    // D/E series: manual amount — skip auto-calc entirely
    if (isDSeries) return;

    // A-series: stitching only
    // B-series: accessories only
    // C-series: packing only
    const stitch = isASeries ? Number(order.stitch_rate_party) * order.total_quantity : 0;
    const pack   = isCSeries ? Number(order.pack_rate_party ?? 0) * order.total_quantity : 0;

    if (isBSeries) {
      accessoryService.list(form.order_id).then((accessories) => {
        const accessoryTotal = accessories.reduce(
          (sum, a) => sum + Number(a.total_qty) * Number(a.unit_price),
          0
        );
        setSubtotal(accessoryTotal);
        setForm((f) => ({ ...f, amount_due: accessoryTotal - (f.discount || 0) }));
      }).catch(() => {
        setSubtotal(0);
        setForm((f) => ({ ...f, amount_due: 0 }));
      });
    } else {
      const computed = stitch + pack;
      setSubtotal(computed);
      setForm((f) => ({ ...f, amount_due: computed - (f.discount || 0) }));
    }
  }, [form.order_id, form.bill_series, orders]);

  // Recalculate amount_due when discount changes — only for order-linked bills
  // Standalone/D-series: user enters amount_due directly; discount field is informational only
  useEffect(() => {
    if (billType !== "order") return;
    setForm((f) => ({ ...f, amount_due: Math.max(0, subtotal - f.discount) }));
  }, [form.discount, subtotal, billType]);

  // Reset amounts when switching to standalone mode (no auto-calc applies)
  useEffect(() => {
    if (billType === "standalone") {
      setSubtotal(0);
      setForm((f) => ({ ...f, amount_due: 0, discount: 0 }));
    }
  }, [billType]);

  // D/E series are misc/one-off — auto-switch to standalone
  useEffect(() => {
    const s = (form.bill_series ?? "A").toUpperCase();
    if (s === "D" || s === "E") setBillType("standalone");
  }, [form.bill_series]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (billType === "order" && !form.order_id) {
        showToast("Select an order", "error");
        setSubmitting(false);
        return;
      }
      if (billType === "standalone" && !form.party_id) {
        showToast("Select a party", "error");
        setSubmitting(false);
        return;
      }
      if (billType === "standalone" && !form.description?.trim()) {
        showToast("Enter a description", "error");
        setSubmitting(false);
        return;
      }
      const payload: BillCreate = {
        ...form,
        order_id: billType === "order" ? form.order_id : undefined,
        party_id: billType === "standalone" ? form.party_id : undefined,
        description: billType === "standalone" ? form.description : undefined,
        bill_number: autoMode ? undefined : form.bill_number,
        discount: form.discount || 0,
      };
      const bill = await billService.create(payload);
      showToast(`Bill ${bill.bill_number} created`, "success");
      router.push(`/bills/${bill.id}`);
    } catch (err: unknown) {
      const axiosDetail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const msg = axiosDetail || (err instanceof Error ? err.message : "Failed to create bill");
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const set = (k: string, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Bill</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {billType === "order"
            ? "Posts to party ledger & links to order. First bill also marks order dispatched."
            : "Standalone misc bill — posts to party ledger, no order required"}
        </p>
        <div className="flex gap-3 mt-2">
          {(["order", "standalone"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setBillType(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                billType === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t === "order" ? "Linked to Order" : "Standalone (misc)"}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5"
      >
        {/* Order */}
        {billType === "order" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Order *
            </label>
            {loadingOrders ? (
              <div className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500">
                <svg className="animate-spin w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Loading orders… (first load may take up to 30 seconds)
              </div>
            ) : (
              <>
                <select value={form.order_id} onChange={(e) => set("order_id", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select an order...</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number} — {o.party_name ?? "No party"} ({o.status})
                    </option>
                  ))}
                </select>
                {!loadingOrders && orders.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No orders found.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Standalone fields */}
        {billType === "standalone" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Party *
              </label>
              <select
                value={form.party_id ?? ""}
                onChange={(e) => set("party_id", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select a party...</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Misc stitching charges — April 2026"
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

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
                {[
                  { value: "A", label: "Series A — Stitching" },
                  { value: "B", label: "Series B — Accessories" },
                  { value: "C", label: "Series C — Packing" },
                  { value: "D", label: "Series D — Misc / One-off" },
                  { value: "E", label: "Series E" },
                ].map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
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

        {/* Amount section */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Discount (PKR)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.discount || ""}
              onChange={(e) => set("discount", parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Amount summary */}
          {billType === "order" && subtotal > 0 && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>PKR {subtotal.toLocaleString()}</span>
              </div>
              {(form.discount || 0) > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Discount</span>
                  <span>- PKR {(form.discount || 0).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1 mt-1">
                <span>Amount Due</span>
                <span className="text-blue-600">PKR {form.amount_due.toLocaleString()}</span>
              </div>
            </div>
          )}

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
            {billType === "order" && (
              <p className="text-xs text-gray-400 mt-1">
                Auto-calculated from order rates minus discount — adjust if needed
              </p>
            )}
          </div>
        </div>

        {/* Dispatch details */}
        {billType === "order" && (
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
        )}

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

export default function NewBillPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    }>
      <NewBillForm />
    </Suspense>
  );
}
