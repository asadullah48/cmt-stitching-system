"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dashboardService, insightsService, settingsService, cashAccountService } from "@/hooks/services";
import type { Alert, AppSettings, CashAccount } from "@/hooks/types";
import { formatCurrency, formatDate } from "@/hooks/utils";
import { StatusBadge, DataTable } from "@/components/common";
import type { DashboardSummary, Order } from "@/hooks/types";
import type { Column } from "@/components/common";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(ownerName?: string): string {
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return ownerName ? `${timeGreeting}, ${ownerName}!` : `${timeGreeting}!`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color, bg, icon }: {
  label: string; value: number | string; color: string; bg: string; icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl p-5 flex items-center gap-4 ${bg}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/20`}>
        {icon}
      </div>
      <div>
        <p className={`text-3xl font-extrabold ${color} leading-none`}>{value}</p>
        <p className={`text-sm mt-1 ${color} opacity-80 font-medium`}>{label}</p>
      </div>
    </div>
  );
}

function QuickStatPill({ label, value, valueClass }: {
  label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`font-bold text-base leading-none ${valueClass ?? "text-white"}`}>{value}</span>
      <span className="text-xs text-blue-300 leading-none">{label}</span>
    </div>
  );
}

function ProgressBar({ label, value, barColor, textColor }: {
  label: string; value: number; barColor: string; textColor: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${textColor}`}>{value}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function PipelineBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1">
      <span className="text-xs font-bold text-gray-700">{count}</span>
      <div className="w-full flex flex-col justify-end" style={{ height: "80px" }}>
        <div
          className={`w-full rounded-t-md ${color} transition-all duration-700`}
          style={{ height: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 text-center leading-tight">{label}</span>
    </div>
  );
}

function AlertCard({ alert, onDismiss, onView }: {
  alert: Alert;
  onDismiss: () => void;
  onView?: () => void;
}) {
  const isWarning = alert.level === "warning";
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 border-l-4 border text-sm ${
        isWarning
          ? "bg-amber-50 border-l-amber-400 border-amber-200 text-amber-900"
          : "bg-blue-50 border-l-blue-400 border-blue-200 text-blue-900"
      }`}
    >
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        <span className="mt-0.5 flex-shrink-0 text-base leading-none">
          {isWarning ? "⚠️" : "ℹ️"}
        </span>
        <div className="min-w-0">
          <span className="font-semibold">{alert.message}</span>
          {alert.detail && (
            <span className={`text-xs ml-2 ${isWarning ? "text-amber-700" : "text-blue-700"} opacity-80`}>
              — {alert.detail}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
        {alert.link && onView && (
          <button
            onClick={onView}
            className={`text-xs underline underline-offset-2 font-medium ${
              isWarning ? "text-amber-700 hover:text-amber-900" : "text-blue-700 hover:text-blue-900"
            }`}
          >
            View
          </button>
        )}
        <button
          onClick={onDismiss}
          className={`text-lg leading-none font-light transition-opacity ${
            isWarning ? "text-amber-500 hover:text-amber-700" : "text-blue-400 hover:text-blue-700"
          }`}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function AlertSkeleton() {
  return (
    <div className="rounded-xl px-4 py-3 border border-gray-200 bg-gray-50 animate-pulse h-12" />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() => {
    try {
      const today = new Date().toDateString();
      const stored = localStorage.getItem(`dismissed_alerts_${today}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const router = useRouter();

  useEffect(() => {
    dashboardService.getSummary().then(setSummary).finally(() => setLoading(false));
    insightsService.getAlerts()
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setAlertsLoading(false));
    settingsService.get().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    cashAccountService.list().then(setCashAccounts).catch(() => {});
  }, []);

  const dismissAlert = (id: string) => {
    const next = [...dismissedAlerts, id];
    setDismissedAlerts(next);
    try {
      const today = new Date().toDateString();
      localStorage.setItem(`dismissed_alerts_${today}`, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.includes(a.id));

  const pipelineMax = Math.max(
    summary?.pending_orders ?? 0,
    summary?.stitching_in_progress ?? 0,
    summary?.packing_in_progress ?? 0,
    summary?.dispatched ?? 0,
    1
  );

  const recentOrderColumns: Column<Order>[] = [
    {
      key: "order_number", header: "Order #",
      render: (row) => <span className="font-semibold text-blue-600">{row.order_number}</span>,
    },
    {
      key: "party_name", header: "Party",
      render: (row) => <span className="text-gray-700">{row.party_name ?? row.party_reference ?? "—"}</span>,
    },
    {
      key: "goods_description", header: "Goods",
      render: (row) => <span className="truncate max-w-[180px] block text-gray-600">{row.goods_description}</span>,
    },
    {
      key: "total_quantity", header: "Qty",
      render: (row) => <span className="font-medium">{row.total_quantity.toLocaleString()}</span>,
      className: "text-right", headerClassName: "text-right",
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "delivery_date", header: "Delivery", render: (row) => formatDate(row.delivery_date) },
  ];

  const businessName = settings?.business_name ?? "CMT Stitching & Packing";

  return (
    <div className="space-y-6">

      {/* ─── Personal Dashboard Header ───────────────────────────────── */}
      <div className="bg-[#1a2744] rounded-2xl px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Greeting + business name */}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white leading-tight">
              {businessName}
            </h1>
            <p className="text-sm text-blue-300 mt-0.5">
              {getGreeting(settings?.owner_name ?? undefined)}
            </p>
          </div>

          {/* Right: Quick financial stats */}
          <div className="flex items-start gap-6 flex-shrink-0 text-right">
            <QuickStatPill
              label="Orders this month"
              value={loading ? "…" : String(summary?.orders_this_month ?? 0)}
            />
            <QuickStatPill
              label="Billed this month"
              value={loading ? "…" : `PKR ${formatCurrency(summary?.total_revenue_month ?? 0)}`}
            />
            <QuickStatPill
              label="Collected"
              value={loading ? "…" : `PKR ${formatCurrency(summary?.collected_month ?? 0)}`}
              valueClass="text-green-300"
            />
            <QuickStatPill
              label="Outstanding"
              value={loading ? "…" : `PKR ${formatCurrency(summary?.outstanding_total ?? 0)}`}
              valueClass="text-red-300"
            />
          </div>
        </div>
      </div>

      {/* ─── Smart Insights Panel ────────────────────────────────────── */}
      {(alertsLoading || visibleAlerts.length > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Smart Insights</span>
            {!alertsLoading && visibleAlerts.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-full">
                {visibleAlerts.length}
              </span>
            )}
          </div>

          {alertsLoading ? (
            <>
              <AlertSkeleton />
              <AlertSkeleton />
            </>
          ) : (
            visibleAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDismiss={() => dismissAlert(alert.id)}
                onView={alert.link ? () => router.push(alert.link!) : undefined}
              />
            ))
          )}
        </div>
      )}

      {/* All-clear message when alerts loaded and none visible */}
      {!alertsLoading && alerts.length > 0 && visibleAlerts.length === 0 && (
        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 border-l-4 border-l-green-400 border border-green-200 bg-green-50 text-sm text-green-800">
          <span className="text-base leading-none">✅</span>
          <span className="font-medium">All clear — no alerts right now.</span>
        </div>
      )}

      {/* ─── Stat Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Active Orders"
          value={loading ? "…" : (summary?.active_orders ?? 0)}
          color="text-white"
          bg="bg-blue-600"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          label="Pending"
          value={loading ? "…" : (summary?.on_hold_orders ?? 0)}
          color="text-white"
          bg="bg-amber-500"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Dispatched"
          value={loading ? "…" : (summary?.dispatched ?? 0)}
          color="text-white"
          bg="bg-indigo-600"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 17H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m0 0h3l2 3v4h-5m0-7v7m0 0H9m3 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          label="Completed Today"
          value={loading ? "…" : (summary?.completed_today ?? 0)}
          color="text-white"
          bg="bg-green-600"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Cash Position */}
      {cashAccounts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Cash Position</h3>
          <div className="grid grid-cols-2 gap-4">
            {cashAccounts.map((a) => (
              <div key={a.id} className={`rounded-xl p-4 ${a.account_type === "cash" ? "bg-emerald-50" : "bg-blue-50"}`}>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{a.name}</p>
                <p className={`text-2xl font-extrabold mt-1 ${a.account_type === "cash" ? "text-emerald-700" : "text-blue-700"}`}>
                  {formatCurrency(a.current_balance)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Progress + Pipeline ─────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Progress Bars */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5 space-y-5">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Production Progress</h2>
          <ProgressBar
            label="Stitching Progress"
            value={loading ? 0 : (summary?.stitching_progress_pct ?? 0)}
            barColor="bg-blue-500"
            textColor="text-blue-600"
          />
          <ProgressBar
            label="Packing Progress"
            value={loading ? 0 : (summary?.packing_progress_pct ?? 0)}
            barColor="bg-indigo-500"
            textColor="text-indigo-600"
          />
        </div>

        {/* Pipeline Chart */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-5">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Pipeline</h2>
          <div className="flex items-end gap-2 h-28">
            <PipelineBar label="Pending" count={summary?.pending_orders ?? 0} max={pipelineMax} color="bg-gray-300" />
            <PipelineBar label="Stitching" count={summary?.stitching_in_progress ?? 0} max={pipelineMax} color="bg-blue-500" />
            <PipelineBar label="Packing" count={summary?.packing_in_progress ?? 0} max={pipelineMax} color="bg-indigo-500" />
            <PipelineBar label="Dispatched" count={summary?.dispatched ?? 0} max={pipelineMax} color="bg-green-500" />
          </div>
        </div>
      </div>

      {/* ─── Quick Actions ───────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "New Order", color: "bg-blue-600 hover:bg-blue-700", onClick: () => router.push("/orders?new=1"),
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /> },
          { label: "Start Batch", color: "bg-indigo-600 hover:bg-indigo-700", onClick: () => router.push("/production"),
            icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></> },
          { label: "QC Check", color: "bg-green-600 hover:bg-green-700", onClick: () => router.push("/quality"),
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> },
          { label: "Export Report", color: "bg-[#1a2744] hover:bg-[#243260]", onClick: () => router.push("/reports"),
            icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
        ].map(({ label, color, onClick, icon }) => (
          <button
            key={label}
            onClick={onClick}
            className={`flex items-center justify-center gap-2 px-4 py-3 ${color} text-white text-sm font-semibold rounded-xl transition-colors shadow-sm`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
            {label}
          </button>
        ))}
      </div>

      {/* ─── Recent Orders ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Recent Orders</h2>
          <button
            onClick={() => router.push("/orders")}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            View all →
          </button>
        </div>
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
