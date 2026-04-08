"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ordersService, qualityService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { Select, Button, Input, Textarea, FormField, Spinner, SearchInput } from "@/components/common";
import { StatusBadge } from "@/components/common";
import type { Order, QualityReport, DefectLog } from "@/hooks/types";

const DEFECT_TYPES = [
  "Thread Knotting", "Misaligned Seam", "Puckering",
  "Broken Stitch", "Loose Thread", "Fabric Damage", "Other",
];

export default function QualityPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [orderSearch, setOrderSearch] = useState("");
  const [defectType, setDefectType] = useState(DEFECT_TYPES[0]);
  const [defectQty, setDefectQty] = useState("1");
  const [defectNotes, setDefectNotes] = useState("");
  const [loggingDefect, setLoggingDefect] = useState(false);

  useEffect(() => {
    ordersService.getOrders({ size: 100 }).then((r) => setOrders(r.data));
  }, []);

  const loadReport = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingReport(true);
    try {
      setReport(await qualityService.getReport(id));
    } finally {
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOrder) loadReport(selectedOrder.id);
  }, [selectedOrder, loadReport]);

  const toggleCheckpoint = async (cpId: string, passed: boolean) => {
    if (!selectedOrder) return;
    setSavingId(cpId);
    try {
      await qualityService.updateCheckpoint(cpId, passed);
      await loadReport(selectedOrder.id);
      showToast(passed ? "Checkpoint passed ✓" : "Checkpoint marked failed");
    } catch {
      showToast("Failed to update checkpoint", "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleLogDefect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setLoggingDefect(true);
    try {
      await qualityService.logDefect(selectedOrder.id, defectType, parseInt(defectQty) || 1, defectNotes || undefined);
      await loadReport(selectedOrder.id);
      setDefectNotes("");
      setDefectQty("1");
      showToast("Defect logged");
    } catch {
      showToast("Failed to log defect", "error");
    } finally {
      setLoggingDefect(false);
    }
  };

  const passedCount = report?.checkpoints.filter((c) => c.passed).length ?? 0;
  const totalCount = report?.checkpoints.length ?? 0;
  const progressPct = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#1a2744] rounded-2xl px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Quality Control</h1>
          <p className="text-xs text-blue-300 mt-0.5">Inspect orders and log defects</p>
        </div>
        {report && (
          <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
            report.all_passed ? "bg-green-500/20 text-green-300" : "bg-orange-500/20 text-orange-300"
          }`}>
            {report.all_passed ? "✓ All Passed" : `${passedCount}/${totalCount} Passed`}
          </div>
        )}
      </div>

      {/* 3-Panel Layout */}
      <div className="grid grid-cols-12 gap-4" style={{ minHeight: "calc(100vh - 220px)" }}>

        {/* ── Left: Order List ── */}
        <div className="col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-3 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Orders</h2>
              <span className="text-xs text-gray-400">{orders.length}</span>
            </div>
            <SearchInput
              value={orderSearch}
              onChange={setOrderSearch}
              placeholder="Filter orders…"
            />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {orders.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-xs text-gray-400">No orders found</p>
              </div>
            ) : (
              orders
              .filter((o) => !orderSearch || o.order_number.toLowerCase().includes(orderSearch.toLowerCase()) || o.goods_description.toLowerCase().includes(orderSearch.toLowerCase()) || (o.party_name ?? "").toLowerCase().includes(orderSearch.toLowerCase()))
              .map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selectedOrder?.id === o.id
                      ? "bg-blue-50 border-l-2 border-blue-600"
                      : "hover:bg-gray-50 border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-blue-600 truncate">{o.order_number}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-xs text-gray-600 truncate">{o.goods_description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Qty: {o.total_quantity.toLocaleString()}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Center: Job Detail ── */}
        <div className="col-span-5 flex flex-col gap-4">
          {!selectedOrder ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-700">Select an order to begin QC</p>
              <p className="text-xs text-gray-400 mt-1">Checkpoints and defect logs will appear here</p>
            </div>
          ) : (
            <>
              {/* Job ID Card */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Job ID</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{selectedOrder.order_number}</p>
                  </div>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <p className="text-sm text-gray-600 mb-4">{selectedOrder.goods_description}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">Total Quantity</p>
                    <p className="text-lg font-bold text-gray-800 mt-0.5">{selectedOrder.total_quantity.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">QC Progress</p>
                    <p className="text-lg font-bold text-blue-600 mt-0.5">{loadingReport ? "…" : `${progressPct}%`}</p>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-700">QC Checkpoint Progress</p>
                  <span className="text-sm font-bold text-blue-600">{progressPct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                  <span>{passedCount} passed</span>
                  <span>{totalCount - passedCount} remaining</span>
                </div>
              </div>

              {/* Recent Defects */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex-1">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Recent Defect Logs</h3>
                {loadingReport ? (
                  <div className="flex justify-center py-6"><Spinner className="w-5 h-5" /></div>
                ) : (report?.defects.length ?? 0) === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">No defects logged</p>
                ) : (
                  <ul className="space-y-2">
                    {report?.defects.slice(0, 6).map((d: DefectLog) => (
                      <li key={d.id} className="flex items-center justify-between text-sm bg-red-50 rounded-lg px-3 py-2">
                        <span className="text-red-700 font-medium text-xs">{d.defect_type}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">×{d.quantity}</span>
                          <span className="text-xs text-gray-400">{new Date(d.logged_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Right: Checkpoints + Defect Form ── */}
        <div className="col-span-4 flex flex-col gap-4">
          {/* Quality Checkpoints */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-4">Quality Checkpoints</h2>
            {!selectedOrder ? (
              <p className="text-xs text-gray-400 text-center py-6">Select an order first</p>
            ) : loadingReport ? (
              <div className="flex justify-center py-6"><Spinner className="w-5 h-5" /></div>
            ) : (
              <ul className="space-y-2.5">
                {report?.checkpoints.map((cp) => (
                  <li key={cp.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl ${
                    cp.passed ? "bg-green-50" : "bg-gray-50"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        cp.passed ? "bg-green-500" : "bg-gray-200"
                      }`}>
                        {cp.passed ? (
                          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-gray-400" />
                        )}
                      </div>
                      <span className={`text-xs font-medium ${cp.passed ? "text-green-800" : "text-gray-600"}`}>
                        {cp.checkpoint_name}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleCheckpoint(cp.id, !cp.passed)}
                      disabled={savingId === cp.id}
                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors flex-shrink-0 ${
                        cp.passed
                          ? "bg-red-100 text-red-600 hover:bg-red-200"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                    >
                      {savingId === cp.id ? "…" : cp.passed ? "Undo" : "Pass ✓"}
                    </button>
                  </li>
                ))}
                {report?.all_passed && (
                  <div className="mt-2 bg-green-100 text-green-700 text-xs font-semibold px-3 py-2 rounded-xl text-center">
                    ✓ All checkpoints passed — Ready for dispatch
                  </div>
                )}
              </ul>
            )}
          </div>

          {/* Defect Logging */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex-1">
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-4">Log Defect</h2>
            <form onSubmit={handleLogDefect} className="space-y-3">
              <FormField label="Defect Type">
                <Select value={defectType} onChange={(e) => setDefectType(e.target.value)} disabled={!selectedOrder}>
                  {DEFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Quantity">
                  <Input type="number" min="1" value={defectQty} onChange={(e) => setDefectQty(e.target.value)} disabled={!selectedOrder} />
                </FormField>
                <FormField label="Timestamp">
                  <Input type="text" value={new Date().toLocaleTimeString()} readOnly className="bg-gray-50 text-gray-500" />
                </FormField>
              </div>
              <FormField label="Notes">
                <Textarea rows={2} value={defectNotes} onChange={(e) => setDefectNotes(e.target.value)} placeholder="Optional notes" disabled={!selectedOrder} />
              </FormField>
              <Button type="submit" loading={loggingDefect} disabled={!selectedOrder} className="w-full justify-center bg-red-600 hover:bg-red-700">
                Log Defect
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
