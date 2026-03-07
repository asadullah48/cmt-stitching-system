"use client";

import React, { useState, useEffect, useCallback } from "react";
import { productionService, ordersService } from "@/hooks/services";
import { formatDate } from "@/hooks/utils";
import { PageHeader, Button, Sheet, DataTable, Select, Input } from "@/components/common";
import { SessionForm } from "@/components/production";
import type { ProductionSession, Order, Department } from "@/hooks/types";
import type { Column } from "@/components/common";

export default function ProductionPage() {
  const [department, setDepartment] = useState<Department>("stitching");
  const [orderSearch, setOrderSearch] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [sessions, setSessions] = useState<ProductionSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Load orders for selection
  useEffect(() => {
    ordersService
      .getOrders({ size: 200, status: department === "stitching" ? "stitching_in_progress" : "packing_in_progress" })
      .then((r) => setOrders(r.data));
  }, [department]);

  const loadSessions = useCallback(async () => {
    if (!selectedOrderId) return;
    setLoading(true);
    try {
      setSessions(
        await productionService.getSessionsForOrder(selectedOrderId, department)
      );
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId, department]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const filteredOrders = orders.filter((o) =>
    !orderSearch ||
    o.order_number.toLowerCase().includes(orderSearch.toLowerCase()) ||
    (o.party_name ?? "").toLowerCase().includes(orderSearch.toLowerCase())
  );

  const columns: Column<ProductionSession>[] = [
    {
      key: "session_date",
      header: "Date",
      render: (r) => formatDate(r.session_date),
    },
    {
      key: "machines_used",
      header: "Machines",
      render: (r) => r.machines_used,
      className: "text-center",
      headerClassName: "text-center",
    },
    {
      key: "start_time",
      header: "Start",
      render: (r) => r.start_time ?? "—",
    },
    {
      key: "end_time",
      header: "End",
      render: (r) => r.end_time ?? "—",
    },
    {
      key: "duration_hours",
      header: "Hours",
      render: (r) => r.duration_hours != null ? `${r.duration_hours}h` : "—",
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "notes",
      header: "Notes",
      render: (r) => (
        <span className="text-xs text-gray-500 truncate max-w-[200px] block">
          {r.notes ?? "—"}
        </span>
      ),
    },
  ];

  const totalMachines = sessions.reduce((s, r) => s + r.machines_used, 0);
  const totalHours = sessions.reduce((s, r) => s + (r.duration_hours ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Production" subtitle="Track stitching and packing sessions" />

      {/* Department toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(["stitching", "packing"] as Department[]).map((d) => (
          <button
            key={d}
            onClick={() => { setDepartment(d); setSelectedOrderId(""); setSessions([]); }}
            className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
              department === d
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Order selection */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Select Order</h2>
        <div className="flex gap-3">
          <Input
            placeholder="Search by order # or party…"
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            className="w-64"
          />
          <Select
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
            className="w-72"
          >
            <option value="">— Pick an order —</option>
            {filteredOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_number} — {o.party_name ?? o.party_reference ?? "No party"}
              </option>
            ))}
          </Select>
          {selectedOrderId && (
            <Button onClick={() => setSheetOpen(true)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Log Session
            </Button>
          )}
        </div>
      </div>

      {/* Empty state when no order selected */}
      {!selectedOrderId && (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">Select an order above to view or log sessions</p>
        </div>
      )}

      {/* Sessions list */}
      {selectedOrderId && (
        <div className="space-y-3">
          {/* Summary row */}
          {sessions.length > 0 && (
            <div className="flex gap-4">
              <div className="bg-blue-50 rounded-lg px-4 py-2.5">
                <p className="text-xs text-blue-600 font-medium">Sessions</p>
                <p className="text-lg font-bold text-blue-700">{sessions.length}</p>
              </div>
              <div className="bg-blue-50 rounded-lg px-4 py-2.5">
                <p className="text-xs text-blue-600 font-medium">Total Machines</p>
                <p className="text-lg font-bold text-blue-700">{totalMachines}</p>
              </div>
              {totalHours > 0 && (
                <div className="bg-blue-50 rounded-lg px-4 py-2.5">
                  <p className="text-xs text-blue-600 font-medium">Total Hours</p>
                  <p className="text-lg font-bold text-blue-700">{totalHours}h</p>
                </div>
              )}
            </div>
          )}

          <DataTable
            columns={columns}
            data={sessions}
            loading={loading}
            keyExtractor={(r) => r.id}
            emptyMessage={`No ${department} sessions for this order yet.`}
          />
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Log ${department === "stitching" ? "Stitching" : "Packing"} Session`}
      >
        {selectedOrderId && (
          <SessionForm
            orderId={selectedOrderId}
            department={department}
            onSuccess={() => { setSheetOpen(false); loadSessions(); }}
            onCancel={() => setSheetOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}
