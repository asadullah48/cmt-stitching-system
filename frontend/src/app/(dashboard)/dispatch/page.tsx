"use client";

import React, { useState, useEffect, useCallback } from "react";
import { dispatchService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { PageHeader, Button, FormField, Input, Select } from "@/components/common";
import type { DispatchOrder } from "@/hooks/types";

export default function DispatchPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DispatchOrder | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [cartonCount, setCartonCount] = useState("");
  const [totalWeight, setTotalWeight] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c] = await Promise.all([dispatchService.getReadyOrders(), dispatchService.getCarriers()]);
      setOrders(o);
      setCarriers(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectOrder = (o: DispatchOrder) => {
    setSelected(o);
    setCarrier(o.carrier ?? "");
    setTrackingNumber(o.tracking_number ?? "");
    setDispatchDate(o.dispatch_date ?? "");
    setCartonCount(o.carton_count?.toString() ?? "");
    setTotalWeight(o.total_weight?.toString() ?? "");
  };

  const generateTracking = () => {
    if (!selected) return;
    const prefix = carrier || "CMT";
    setTrackingNumber(`${prefix.toUpperCase()}-${selected.id.slice(0, 8).toUpperCase()}`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await dispatchService.updateDispatch(selected.id, {
        carrier: carrier || undefined,
        tracking_number: trackingNumber || undefined,
        dispatch_date: dispatchDate || undefined,
        carton_count: cartonCount ? parseInt(cartonCount) : undefined,
        total_weight: totalWeight ? parseFloat(totalWeight) : undefined,
      });
      setSelected(updated);
      await load();
      showToast("Dispatch info saved");
    } catch {
      showToast("Failed to save dispatch info", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Packing & Dispatch" subtitle="Manage dispatch details and tracking" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Checklist */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">
            Order Checklist
            <span className="ml-2 text-xs font-normal text-gray-400">Ready for dispatch</span>
          </h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : orders.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No orders ready for dispatch</p>
              <p className="text-xs text-gray-300 mt-1">Orders reach here once packing is complete</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {orders.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => selectOrder(o)}
                    className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
                      selected?.id === o.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{o.order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        o.status === "dispatched" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-600"
                      }`}>
                        {o.status === "dispatched" ? "Dispatched" : "Ready"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{o.goods_description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Qty: {o.total_quantity.toLocaleString()}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Dispatch Details */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center justify-center min-h-[300px]">
              <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 17H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m0 0h3l2 3v4h-5m0-7v7m0 0H9m3 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">Select an order to manage dispatch</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{selected.order_number}</h2>
                  <p className="text-sm text-gray-500">{selected.goods_description} · {selected.total_quantity.toLocaleString()} pcs</p>
                </div>
                {selected.tracking_number && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Tracking ID</p>
                    <p className="text-sm font-mono font-medium text-blue-600">{selected.tracking_number}</p>
                  </div>
                )}
              </div>

              <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                <FormField label="Carrier">
                  <Select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                    <option value="">— Select carrier —</option>
                    {carriers.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </FormField>

                <FormField label="Tracking Number">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Auto-generate or enter"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={generateTracking}
                      className="flex-shrink-0 px-3 py-2 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium whitespace-nowrap"
                    >
                      Generate
                    </button>
                  </div>
                </FormField>

                <FormField label="Dispatch Date">
                  <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
                </FormField>

                <FormField label="Carton Count">
                  <Input type="number" min="1" placeholder="e.g. 12" value={cartonCount} onChange={(e) => setCartonCount(e.target.value)} />
                </FormField>

                <FormField label="Total Weight (kg)">
                  <Input type="number" step="0.1" min="0" placeholder="e.g. 45.5" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} />
                </FormField>

                <div className="col-span-2 flex gap-3 pt-2 border-t border-gray-100">
                  <Button type="submit" loading={saving} className="flex-1 justify-center">
                    Save Dispatch Info
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSelected(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
