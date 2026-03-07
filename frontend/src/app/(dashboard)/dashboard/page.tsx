"use client";

import React, { useEffect, useState } from "react";
import { dashboardService } from "@/hooks/services";
import { formatCurrency, formatDate, getStatusConfig } from "@/hooks/utils";
import { SummaryCard, StatusBadge, DataTable } from "@/components/common";
import type { DashboardSummary, Order } from "@/hooks/types";
import type { Column } from "@/components/common";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardService
      .getSummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  const recentOrderColumns: Column<Order>[] = [
    {
      key: "order_number",
      header: "Order #",
      render: (row) => (
        <span className="font-medium text-blue-600">{row.order_number}</span>
      ),
    },
    {
      key: "party_name",
      header: "Party",
      render: (row) => row.party_name ?? row.party_reference ?? "—",
    },
    {
      key: "goods_description",
      header: "Goods",
      render: (row) => (
        <span className="truncate max-w-[180px] block">{row.goods_description}</span>
      ),
    },
    {
      key: "total_quantity",
      header: "Qty",
      render: (row) => row.total_quantity.toLocaleString(),
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "delivery_date",
      header: "Delivery",
      render: (row) => formatDate(row.delivery_date),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of your stitching & packing operations</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Total Orders"
          value={loading ? "…" : (summary?.total_orders ?? 0)}
          subtitle="All time"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <SummaryCard
          title="Stitching"
          value={loading ? "…" : (summary?.stitching_in_progress ?? 0)}
          subtitle="In progress"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <SummaryCard
          title="Packing"
          value={loading ? "…" : (summary?.packing_in_progress ?? 0)}
          subtitle="In progress"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <SummaryCard
          title="Revenue (Month)"
          value={loading ? "…" : `PKR ${formatCurrency(summary?.total_revenue_month ?? 0)}`}
          subtitle="Current month"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Pipeline summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        {(
          [
            "pending",
            "stitching_in_progress",
            "stitching_complete",
            "packing_in_progress",
            "packing_complete",
            "dispatched",
          ] as const
        ).map((s) => {
          const cfg = getStatusConfig(s);
          const countMap = {
            pending: summary?.pending_orders ?? 0,
            stitching_in_progress: summary?.stitching_in_progress ?? 0,
            stitching_complete: summary?.stitching_complete ?? 0,
            packing_in_progress: summary?.packing_in_progress ?? 0,
            packing_complete: summary?.packing_complete ?? 0,
            dispatched: summary?.dispatched ?? 0,
          };
          const count = loading ? "…" : countMap[s];
          return (
            <div
              key={s}
              className={`rounded-lg px-3 py-2.5 ${cfg.bg}`}
            >
              <p className={`text-lg font-semibold ${cfg.text}`}>{count}</p>
              <p className={`text-xs ${cfg.text} opacity-80`}>{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Recent orders */}
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
