"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Clock, Truck, CheckCircle2,
  Plus, Play, ShieldCheck, FileDown,
  AlertTriangle, Info, X,
} from "lucide-react";
import { dashboardService, insightsService, settingsService, cashAccountService } from "@/hooks/services";
import type { Alert, AppSettings, CashAccount } from "@/hooks/types";
import { formatCurrency, formatDate } from "@/hooks/utils";
import { StatusBadge, DataTable } from "@/components/common";
import type { DashboardSummary, Order } from "@/hooks/types";
import type { Column } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(ownerName?: string): string {
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return ownerName ? `${timeGreeting}, ${ownerName}!` : `${timeGreeting}!`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, icon, loading }: {
  label: string; value: number | string; icon: React.ReactNode; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="size-9 rounded-lg bg-muted flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-20 mt-1" />
          ) : (
            <p className="text-3xl font-semibold tracking-tight leading-none mt-1">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickStatPill({ label, value, valueClass, loading }: {
  label: string; value: string; valueClass?: string; loading?: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      {loading ? (
        <Skeleton className="h-4 w-20 bg-white/10" />
      ) : (
        <span className={`font-semibold text-base leading-none tabular-nums ${valueClass ?? "text-white"}`}>
          {value}
        </span>
      )}
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
  const Icon = isWarning ? AlertTriangle : Info;
  const accent = isWarning
    ? "border-l-amber-500 bg-amber-50/60"
    : "border-l-primary bg-primary/5";
  const iconColor = isWarning ? "text-amber-600" : "text-primary";
  const detailColor = isWarning ? "text-amber-700" : "text-primary/80";
  return (
    <Card size="sm" className={`border-l-4 ${accent} ring-0`}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <Icon className={`size-4 mt-0.5 shrink-0 ${iconColor}`} />
          <div className="min-w-0 text-sm">
            <span className="font-medium text-foreground">{alert.message}</span>
            {alert.detail && (
              <span className={`text-xs ml-2 ${detailColor}`}>— {alert.detail}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {alert.link && onView && (
            <Button variant="link" size="xs" onClick={onView}>View</Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <X />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertSkeleton() {
  return <Skeleton className="h-12 rounded-xl" />;
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
          <div className="flex items-stretch gap-5 flex-shrink-0 text-right h-10">
            <QuickStatPill
              label="Orders this month"
              value={String(summary?.orders_this_month ?? 0)}
              loading={loading}
            />
            <Separator orientation="vertical" className="bg-white/15" />
            <QuickStatPill
              label="Billed this month"
              value={`PKR ${formatCurrency(summary?.total_revenue_month ?? 0)}`}
              loading={loading}
            />
            <Separator orientation="vertical" className="bg-white/15" />
            <QuickStatPill
              label="Collected"
              value={`PKR ${formatCurrency(summary?.collected_month ?? 0)}`}
              valueClass="text-green-300"
              loading={loading}
            />
            <Separator orientation="vertical" className="bg-white/15" />
            <QuickStatPill
              label="Outstanding"
              value={`PKR ${formatCurrency(summary?.outstanding_total ?? 0)}`}
              valueClass="text-red-300"
              loading={loading}
            />
          </div>
        </div>
      </div>

      {/* ─── Smart Insights Panel ────────────────────────────────────── */}
      {(alertsLoading || visibleAlerts.length > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Smart Insights
            </span>
            {!alertsLoading && visibleAlerts.length > 0 && (
              <Badge variant="secondary">{visibleAlerts.length}</Badge>
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
        <Card size="sm" className="border-l-4 border-l-green-500 bg-green-50/60 ring-0">
          <CardContent className="flex items-center gap-2.5">
            <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            <span className="text-sm font-medium text-foreground">
              All clear — no alerts right now.
            </span>
          </CardContent>
        </Card>
      )}

      {/* ─── Stat Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Active Orders"
          value={summary?.active_orders ?? 0}
          icon={<ClipboardList className="size-5" />}
          loading={loading}
        />
        <StatCard
          label="Pending"
          value={summary?.on_hold_orders ?? 0}
          icon={<Clock className="size-5" />}
          loading={loading}
        />
        <StatCard
          label="Dispatched"
          value={summary?.dispatched ?? 0}
          icon={<Truck className="size-5" />}
          loading={loading}
        />
        <StatCard
          label="Completed Today"
          value={summary?.completed_today ?? 0}
          icon={<CheckCircle2 className="size-5" />}
          loading={loading}
        />
      </div>

      {/* Cash Position */}
      {cashAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Cash Position
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {cashAccounts.map((a) => (
              <div
                key={a.id}
                className={`rounded-xl p-4 ${a.account_type === "cash" ? "bg-emerald-50" : "bg-blue-50"}`}
              >
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{a.name}</p>
                <p className={`text-2xl font-semibold tracking-tight mt-1 ${a.account_type === "cash" ? "text-emerald-700" : "text-blue-700"}`}>
                  {formatCurrency(a.current_balance)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── Progress + Pipeline ─────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Progress Bars */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              Production Progress
              <Badge variant="secondary" className="text-[10px] font-medium normal-case tracking-normal">Live</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
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
          </CardContent>
        </Card>

        {/* Pipeline Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              Pipeline
              <Badge variant="secondary" className="text-[10px] font-medium normal-case tracking-normal">Now</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-28">
              <PipelineBar label="Pending" count={summary?.pending_orders ?? 0} max={pipelineMax} color="bg-gray-300" />
              <PipelineBar label="Stitching" count={summary?.stitching_in_progress ?? 0} max={pipelineMax} color="bg-blue-500" />
              <PipelineBar label="Packing" count={summary?.packing_in_progress ?? 0} max={pipelineMax} color="bg-indigo-500" />
              <PipelineBar label="Dispatched" count={summary?.dispatched ?? 0} max={pipelineMax} color="bg-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Quick Actions ───────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <Button size="lg" className="h-12" onClick={() => router.push("/orders?new=1")}>
          <Plus /> New Order
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12"
          onClick={() => router.push("/production")}
        >
          <Play /> Start Batch
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12"
          onClick={() => router.push("/quality")}
        >
          <ShieldCheck /> QC Check
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12"
          onClick={() => router.push("/reports")}
        >
          <FileDown /> Export Report
        </Button>
      </div>

      {/* ─── Recent Orders ──────────────────────────────────── */}
      <Card className="p-0 gap-0 overflow-hidden">
        <CardHeader className="px-5 py-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Recent Orders
            </CardTitle>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => router.push("/orders")}
            >
              View all →
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={recentOrderColumns}
            data={summary?.recent_orders ?? []}
            loading={loading}
            keyExtractor={(row) => row.id}
            emptyMessage="No orders yet"
          />
        </CardContent>
      </Card>
    </div>
  );
}
