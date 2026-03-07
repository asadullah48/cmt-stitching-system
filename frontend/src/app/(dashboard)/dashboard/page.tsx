"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dashboardService } from "@/hooks/services";
import { formatCurrency, formatDate, getStatusConfig } from "@/hooks/utils";
import { StatusBadge, DataTable } from "@/components/common";
import type { DashboardSummary, Order } from "@/hooks/types";
import type { Column } from "@/components/common";

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-col gap-1">
      <span className={`text-3xl font-bold ${color}`}>{value}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

function ProgressBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-bold ${colorClass}`}>{value}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${colorClass.replace("text-", "bg-")}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    dashboardService.getSummary().then(setSummary).finally(() => setLoading(false));
  }, []);

  const recentOrderColumns: Column<Order>[] = [
    {
      key: "order_number", header: "Order #",
      render: (row) => <span className="font-medium text-blue-600">{row.order_number}</span>,
    },
    {
      key: "party_name", header: "Party",
      render: (row) => row.party_name ?? row.party_reference ?? "—",
    },
    {
      key: "goods_description", header: "Goods",
      render: (row) => <span className="truncate max-w-[180px] block">{row.goods_description}</span>,
    },
    {
      key: "total_quantity", header: "Qty",
      render: (row) => row.total_quantity.toLocaleString(),
      className: "text-right", headerClassName: "text-right",
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "delivery_date", header: "Delivery", render: (row) => formatDate(row.delivery_date) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">CMT Stitching & Packing System Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Live operations overview</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Active Orders" value={loading ? "…" : (summary?.active_orders ?? 0)} color="text-blue-600" />
        <StatCard label="On Hold" value={loading ? "…" : (summary?.on_hold_orders ?? 0)} color="text-orange-500" />
        <StatCard label="Completed Today" value={loading ? "…" : (summary?.completed_today ?? 0)} color="text-green-600" />
      </div>

      {/* Progress Bars */}
      <div className="grid grid-cols-2 gap-4">
        <ProgressBar label="Stitching Progress" value={loading ? 0 : (summary?.stitching_progress_pct ?? 0)} colorClass="text-blue-600" />
        <ProgressBar label="Packing Progress" value={loading ? 0 : (summary?.packing_progress_pct ?? 0)} colorClass="text-indigo-600" />
      </div>

      {/* Pipeline + Revenue */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Revenue (Month)</p>
          <p className="text-lg font-bold text-gray-900">
            PKR {loading ? "…" : formatCurrency(summary?.total_revenue_month ?? 0)}
          </p>
        </div>
        {(["pending", "stitching_in_progress", "packing_in_progress", "dispatched"] as const).map((s) => {
          const cfg = getStatusConfig(s);
          const countMap: Record<string, number> = {
            pending: summary?.pending_orders ?? 0,
            stitching_in_progress: summary?.stitching_in_progress ?? 0,
            packing_in_progress: summary?.packing_in_progress ?? 0,
            dispatched: summary?.dispatched ?? 0,
          };
          return (
            <div key={s} className={`rounded-xl px-4 py-3 ${cfg.bg}`}>
              <p className={`text-lg font-bold ${cfg.text}`}>{loading ? "…" : countMap[s]}</p>
              <p className={`text-xs ${cfg.text} opacity-80`}>{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => router.push("/orders?new=1")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Order
        </button>
        <button
          onClick={() => router.push("/production")}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Start Batch
        </button>
        <button
          onClick={() => router.push("/quality")}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          QC Check
        </button>
        <button
          onClick={() => router.push("/dispatch")}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export Report
        </button>
      </div>

      {/* Recent Orders */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Orders</h2>
        <DataTable
          columns={recentOrderColumns}
          data={summary?.recent_orders ?? []}
          loading={loading}
          keyExtractor={(row) => row.id}
          emptyMessage="No orders yet"
        />
      </div>
    </div>
  );
}
