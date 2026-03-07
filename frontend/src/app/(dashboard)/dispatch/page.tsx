"use client";

import React, { useState, useEffect, useCallback } from "react";
import { dispatchService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { Button, FormField, Input, Select, Spinner } from "@/components/common";
import type { DispatchOrder } from "@/hooks/types";

export default function DispatchPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DispatchOrder | null>(null);
  const [saving, setSaving] = useState(false);

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

  const isDispatched = selected?.status === "dispatched";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#1a2744] rounded-2xl px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">CMT Packing &amp; Dispatch Module</h1>
          <p className="text-xs text-blue-300 mt-0.5">Manage packing station and dispatch logistics</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-blue-300">Ready for dispatch</p>
            <p className="text-xl font-bold text-white">{loading ? "…" : orders.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 17H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m0 0h3l2 3v4h-5m0-7v7m0 0H9m3 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-12 gap-4">

        {/* Left: Order Checklist */}
        <div className="col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Order Checklist</h2>
            <p className="text-xs text-gray-400 mt-0.5">Ready for dispatch</p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="w-5 h-5" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <p className="text-xs font-medium text-gray-500">No orders ready</p>
                <p className="text-xs text-gray-300 mt-1">Orders appear here once packing is complete</p>
              </div>
            ) : (
              orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => selectOrder(o)}
                  className={`w-full text-left px-4 py-3 transition-all ${
                    selected?.id === o.id
                      ? "bg-blue-50 border-l-4 border-blue-600"
                      : "hover:bg-gray-50 border-l-4 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      o.status === "dispatched" ? "bg-green-100" : "bg-orange-100"
                    }`}>
                      <svg className={`w-4 h-4 ${o.status === "dispatched" ? "text-green-600" : "text-orange-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{o.order_number}</p>
                      <p className="text-xs text-gray-400 truncate">{o.goods_description}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Qty: {o.total_quantity.toLocaleString()}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      o.status === "dispatched"
                        ? "bg-green-100 text-green-700"
                        : "bg-orange-100 text-orange-600"
                    }`}>
                      {o.status === "dispatched" ? "Dispatched" : "Ready"}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center: Packing Station */}
        <div className="col-span-5 flex flex-col gap-4">
          {!selected ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 17H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m0 0h3l2 3v4h-5m0-7v7m0 0H9m3 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-600">Select an order to manage dispatch</p>
              <p className="text-sm text-gray-400 mt-1">Order details and packing info will appear here</p>
            </div>
          ) : (
            <>
              {/* Packing Station Status */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-4">Packing Station Status</h2>
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isDispatched ? "bg-green-100" : "bg-orange-100"
                  }`}>
                    <svg className={`w-8 h-8 ${isDispatched ? "text-green-600" : "text-orange-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-400">Order</p>
                    <p className="text-lg font-bold text-gray-900">{selected.order_number}</p>
                    <p className="text-sm text-gray-500 truncate">{selected.goods_description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{selected.total_quantity.toLocaleString()} pcs</p>
                  </div>
                  <div className={`px-3 py-2 rounded-xl text-sm font-bold text-center ${
                    isDispatched
                      ? "bg-green-100 text-green-700"
                      : "bg-orange-100 text-orange-600"
                  }`}>
                    {isDispatched ? "Dispatched" : "Packing Ready"}
                  </div>
                </div>
              </div>

              {/* Tracking Number Display */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Tracking ID</h2>
                {trackingNumber ? (
                  <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center justify-between">
                    <p className="font-mono text-sm font-bold text-blue-700">{trackingNumber}</p>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(trackingNumber); showToast("Tracking ID copied"); }}
                      className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                    >
                      Copy
                    </button>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
                    <p className="text-xs text-gray-400">No tracking number assigned yet</p>
                  </div>
                )}
              </div>

              {/* Weight & Carton Info */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex-1">
                <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Shipment Details</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">Carton Count</p>
                    <p className="text-xl font-bold text-gray-800">{cartonCount || "—"}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${totalWeight ? "bg-green-50" : "bg-gray-50"}`}>
                    <p className="text-xs text-gray-400">Total Weight</p>
                    <p className={`text-xl font-bold ${totalWeight ? "text-green-700" : "text-gray-800"}`}>
                      {totalWeight ? `${totalWeight} kg` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Dispatch Form */}
        <div className="col-span-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 h-full">
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-4">Dispatch Details</h2>

            {!selected ? (
              <p className="text-xs text-gray-400 text-center py-8">Select an order from the checklist</p>
            ) : (
              <form onSubmit={handleSave} className="space-y-3.5">
                <FormField label="Select Carrier">
                  <Select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                    <option value="">— Select carrier —</option>
                    {carriers.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </FormField>

                <FormField label="Tracking Number">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter or generate"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={generateTracking}
                      className="flex-shrink-0 px-3 py-2 text-xs bg-[#1a2744] text-white rounded-lg hover:bg-[#243260] transition-colors font-semibold whitespace-nowrap"
                    >
                      Generate
                    </button>
                  </div>
                </FormField>

                <FormField label="Dispatch Date">
                  <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Carton Count">
                    <Input type="number" min="1" placeholder="e.g. 12" value={cartonCount} onChange={(e) => setCartonCount(e.target.value)} />
                  </FormField>
                  <FormField label="Weight (kg)">
                    <Input type="number" step="0.1" min="0" placeholder="e.g. 45.5" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} />
                  </FormField>
                </div>

                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <Button type="submit" loading={saving} className="w-full justify-center bg-[#1a2744] hover:bg-[#243260]">
                    Save Dispatch Info
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSelected(null)} className="w-full justify-center">
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
