"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ordersService, qualityService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { PageHeader, Select, Button, FormField, Input, Textarea } from "@/components/common";
import type { Order, QualityReport, DefectLog } from "@/hooks/types";

const DEFECT_TYPES = [
  "Thread Knotting", "Misaligned Seam", "Puckering",
  "Broken Stitch", "Loose Thread", "Fabric Damage", "Other",
];

export default function QualityPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Defect form
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

  useEffect(() => { loadReport(selectedOrderId); }, [selectedOrderId, loadReport]);

  const toggleCheckpoint = async (cpId: string, passed: boolean) => {
    setSavingId(cpId);
    try {
      await qualityService.updateCheckpoint(cpId, passed);
      await loadReport(selectedOrderId);
      showToast(passed ? "Checkpoint passed ✓" : "Checkpoint marked failed");
    } catch {
      showToast("Failed to update checkpoint", "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleLogDefect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId) return;
    setLoggingDefect(true);
    try {
      await qualityService.logDefect(selectedOrderId, defectType, parseInt(defectQty) || 1, defectNotes || undefined);
      await loadReport(selectedOrderId);
      setDefectNotes("");
      setDefectQty("1");
      showToast("Defect logged");
    } catch {
      showToast("Failed to log defect", "error");
    } finally {
      setLoggingDefect(false);
    }
  };

  return (
    <div>
      <PageHeader title="Quality Control" subtitle="Inspect orders and log defects" />

      <div className="mb-6 max-w-sm">
        <FormField label="Select Order">
          <Select value={selectedOrderId} onChange={(e) => setSelectedOrderId(e.target.value)}>
            <option value="">— Choose an order —</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>{o.order_number} — {o.goods_description}</option>
            ))}
          </Select>
        </FormField>
      </div>

      {!selectedOrderId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">Select an order to begin QC</p>
          <p className="text-xs text-gray-400 mt-1">Checkpoints and defect logs will appear here</p>
        </div>
      )}

      {selectedOrderId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quality Checkpoints */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Quality Checkpoints</h2>
            {loadingReport ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (
              <ul className="space-y-3">
                {report?.checkpoints.map((cp) => (
                  <li key={cp.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        cp.passed ? "bg-green-100" : "bg-gray-100"
                      }`}>
                        {cp.passed ? (
                          <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-gray-300" />
                        )}
                      </div>
                      <span className={`text-sm ${cp.passed ? "text-gray-900 font-medium" : "text-gray-500"}`}>
                        {cp.checkpoint_name}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleCheckpoint(cp.id, !cp.passed)}
                      disabled={savingId === cp.id}
                      className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                        cp.passed
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-green-50 text-green-700 hover:bg-green-100"
                      }`}
                    >
                      {savingId === cp.id ? "…" : cp.passed ? "Undo" : "Pass"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {report && (
              <div className={`mt-4 px-3 py-2 rounded-lg text-sm font-medium ${
                report.all_passed ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
              }`}>
                {report.all_passed ? "✓ All checkpoints passed" : "⚠ Some checkpoints pending"}
              </div>
            )}
          </div>

          {/* Defect Logging */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Defect Logging</h2>
            <form onSubmit={handleLogDefect} className="space-y-3 mb-5">
              <FormField label="Defect Type">
                <Select value={defectType} onChange={(e) => setDefectType(e.target.value)}>
                  {DEFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormField>
              <FormField label="Quantity">
                <Input type="number" min="1" value={defectQty} onChange={(e) => setDefectQty(e.target.value)} />
              </FormField>
              <FormField label="Notes">
                <Textarea rows={2} value={defectNotes} onChange={(e) => setDefectNotes(e.target.value)} placeholder="Optional notes" />
              </FormField>
              <Button type="submit" loading={loggingDefect} className="w-full justify-center">
                Log Defect
              </Button>
            </form>

            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent Defects</h3>
            {loadingReport ? <p className="text-sm text-gray-400">Loading…</p> : (
              report?.defects.length === 0 ? (
                <p className="text-sm text-gray-400">No defects logged</p>
              ) : (
                <ul className="space-y-2">
                  {report?.defects.slice(0, 5).map((d: DefectLog) => (
                    <li key={d.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{d.defect_type}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">×{d.quantity}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(d.logged_at).toLocaleDateString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
