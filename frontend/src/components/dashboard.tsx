"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatCurrency } from "@/hooks/utils";
import { SummaryCard, StatusBadge } from "@/components/common";
import type { DashboardSummary, Order } from "@/hooks/types";

// ─── KPIGrid ──────────────────────────────────────────────────────────────────

interface KPIGridProps {
  summary: DashboardSummary;
}

export function KPIGrid({ summary }: KPIGridProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard
        title="Total Orders"
        value={summary.total_orders}
        subtitle="All time"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
      />
      <SummaryCard
        title="Stitching Active"
        value={summary.stitching_in_progress}
        subtitle="In progress"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
      <SummaryCard
        title="Packing Active"
        value={summary.packing_in_progress}
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
        value={`PKR ${formatCurrency(summary.total_revenue_month)}`}
        subtitle="Current month"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    </div>
  );
}

// ─── RecentOrdersTable ────────────────────────────────────────────────────────

interface RecentOrdersTableProps {
  orders: Order[];
}

export function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Recent Orders</h2>
      </div>
      {orders.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No orders yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Order #</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Party</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Goods</th>
              <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivery</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                onClick={() => router.push(`/orders/${order.id}`)}
                className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-5 py-3 font-semibold text-blue-600">{order.order_number}</td>
                <td className="px-5 py-3 text-gray-700">
                  {order.party_name ?? order.party_reference ?? "—"}
                </td>
                <td className="px-5 py-3 text-gray-600 max-w-[180px]">
                  <span className="truncate block">{order.goods_description}</span>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {order.total_quantity.toLocaleString()}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-5 py-3 text-gray-600">{formatDate(order.delivery_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
