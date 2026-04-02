"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ordersService, productionService, transactionsService, partiesService, productService, expensesService, billService, accessoryService } from "@/hooks/services";
import type { Bill } from "@/hooks/services";
import { formatDate, formatCurrency } from "@/hooks/utils";
import { useToast } from "@/hooks/toast";
import {
  StatusBadge, Button, Sheet, ConfirmDialog, Spinner, FormField, Input,
} from "@/components/common";
import { OrderStatusSelect, OrderItemsTable, OrderForm } from "@/components/orders";
import { SessionForm } from "@/components/production";
import { TransactionForm } from "@/components/financial";
import type { Order, ProductionSession, Department, Party, OrderMaterials, MaterialRequirement, Expense, OrderAccessory, AccessoryCreate } from "@/hooks/types";

// ─── Stage Config ─────────────────────────────────────────────────────────────

const STAGE_INDEX: Record<string, number> = {
  pending: 0,
  stitching_in_progress: 1,
  stitching_complete: 1,
  packing_in_progress: 2,
  packing_complete: 2,
  dispatched: 3,
};

const STAGES = [
  { key: "order",    label: "Order Placed",  icon: "📋" },
  { key: "stitch",   label: "Stitching",     icon: "🧵" },
  { key: "packing",  label: "Packing",       icon: "📦" },
  { key: "dispatch", label: "Dispatched",    icon: "🚚" },
];

const PACKING_STAGE_OPTIONS = [
  { key: "packing",          label: "Packing" },
  { key: "loading",          label: "Loading" },
  { key: "ready_to_invoice", label: "Ready to Invoice" },
  { key: "invoiced",         label: "Invoiced" },
];

// ─── Sub-Order B Stage Tracker ────────────────────────────────────────────────

function SubOrderStageTracker({
  order,
  onStageChange,
}: {
  order: Order;
  onStageChange: () => void;
}) {
  const { showToast } = useToast();
  const stages = order.sub_stages ?? [];
  const current = order.current_stage;

  const advance = async (stage: string) => {
    try {
      await ordersService.advanceStage(order.id, stage);
      showToast("Stage updated");
      onStageChange();
    } catch {
      showToast("Failed to update stage", "error");
    }
  };

  const stageLabels: Record<string, string> = {
    packing: "Packing",
    loading: "Loading",
    ready_to_invoice: "Ready to Invoice",
    invoiced: "Invoiced",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Sub-Order Progress</h3>
      <div className="flex items-center gap-2 flex-wrap">
        {stages.map((stage, idx) => {
          const currentIdx = current ? stages.indexOf(current) : -1;
          const isDone = currentIdx >= idx;
          const isCurrent = stage === current;
          return (
            <React.Fragment key={stage}>
              <button
                onClick={() => advance(stage)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isCurrent
                    ? "bg-blue-600 text-white"
                    : isDone
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {stageLabels[stage] ?? stage}
              </button>
              {idx < stages.length - 1 && (
                <span className="text-gray-300 text-xs">→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function allocatedDays(entry: string, delivery: string | null | undefined): number | null {
  if (!entry || !delivery) return null;
  return Math.round((new Date(delivery).getTime() - new Date(entry).getTime()) / 86_400_000);
}

// ─── Material Requirements Panel ─────────────────────────────────────────────

function MaterialRow({ req }: { req: MaterialRequirement }) {
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="py-2 pr-4 text-sm text-gray-800">{req.inventory_item_name}</td>
      <td className="py-2 pr-4 text-sm text-right tabular-nums text-gray-700">
        {Number(req.required).toFixed(2)} {req.unit}
      </td>
      <td className="py-2 pr-4 text-sm text-right tabular-nums text-gray-700">
        {Number(req.in_stock).toFixed(2)} {req.unit}
      </td>
      <td className="py-2 text-right">
        {req.sufficient ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            OK
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01" />
            </svg>
            Short {Number(req.shortfall).toFixed(2)}
          </span>
        )}
      </td>
    </tr>
  );
}

function MaterialRequirementsPanel({ materials, onEdit }: { materials: OrderMaterials | null; onEdit: () => void }) {
  const [matTab, setMatTab] = useState<"stitching" | "packing">("stitching");

  if (!materials) return null;

  if (!materials.product_name) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Material Requirements</h2>
            <p className="text-xs text-gray-500 mb-3">Track accessories, zip, fabric, and other materials needed for this order.</p>
            <div className="space-y-1.5 text-xs text-gray-500">
              <p className="font-medium text-gray-600">To add materials (e.g. Zip, Thread):</p>
              <p>1. <a href="/inventory" className="text-blue-600 hover:underline">Inventory</a> → add items like &ldquo;Zip&rdquo;, &ldquo;Thread&rdquo;, &ldquo;Lace&rdquo;</p>
              <p>2. <a href="/products" className="text-blue-600 hover:underline">Products</a> → create a product template → add those items to its BOM</p>
              <p>3. Click <strong>Edit Order</strong> below → assign the Product Template</p>
            </div>
          </div>
          <button
            onClick={onEdit}
            className="flex-shrink-0 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            Edit Order
          </button>
        </div>
      </div>
    );
  }

  const rows = matTab === "stitching" ? materials.stitching : materials.packing;
  const consumed = matTab === "stitching" ? materials.stitching_consumed : materials.packing_consumed;
  const allOk = rows.every((r) => r.sufficient);
  const shortCount = rows.filter((r) => !r.sufficient).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Material Requirements</h2>
          <p className="text-xs text-gray-400 mt-0.5">{materials.product_name} · {materials.order_quantity} pcs</p>
        </div>
        {consumed && (
          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
            Auto-consumed
          </span>
        )}
      </div>

      {/* Summary banner */}
      {rows.length > 0 && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
          allOk ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
        }`}>
          {allOk
            ? "✓ All materials sufficient"
            : `⚠ ${shortCount} item${shortCount > 1 ? "s" : ""} short — check inventory`}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {(["stitching", "packing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMatTab(t)}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors capitalize ${
              matTab === t ? "bg-[#1a2744] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {t} ({(t === "stitching" ? materials.stitching : materials.packing).length})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No BOM items defined for {matTab}.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-2 text-left text-xs font-medium text-gray-500">Material</th>
              <th className="pb-2 text-right text-xs font-medium text-gray-500">Required</th>
              <th className="pb-2 text-right text-xs font-medium text-gray-500">In Stock</th>
              <th className="pb-2 text-right text-xs font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((req) => <MaterialRow key={req.inventory_item_id} req={req} />)}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Pipeline Header ──────────────────────────────────────────────────────────

function PipelineHeader({ order }: { order: Order }) {
  const activeIdx = STAGE_INDEX[order.status] ?? 0;
  const isFullyDispatched = order.status === "dispatched";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between relative">
        {/* Gray connecting line behind steps */}
        <div className="absolute left-0 right-0 top-5 h-0.5 bg-gray-200 mx-16 z-0" />
        {/* Blue filled line animating to cover completed steps */}
        <div
          className="absolute left-0 top-5 h-0.5 bg-blue-500 z-0 transition-all duration-700"
          style={{
            width: `${(activeIdx / 3) * 100}%`,
            marginLeft: "4rem",
            marginRight: "4rem",
          }}
        />

        {STAGES.map((stage, idx) => {
          const done    = idx < activeIdx || isFullyDispatched;
          const active  = idx === activeIdx && !isFullyDispatched;
          const pending = idx > activeIdx;

          return (
            <div key={stage.key} className="flex flex-col items-center gap-2 z-10 flex-1">
              {/* Circle */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-500
                  ${done    ? "bg-green-500 border-green-500 text-white" : ""}
                  ${active  ? "bg-blue-600 border-blue-600 text-white animate-pulse" : ""}
                  ${pending ? "bg-white border-gray-300 text-gray-400" : ""}
                `}
              >
                {done ? "✓" : stage.icon}
              </div>
              {/* Label */}
              <span
                className={`text-xs font-semibold text-center ${
                  done ? "text-green-600" : active ? "text-blue-700" : "text-gray-400"
                }`}
              >
                {stage.label}
              </span>
              {/* Date/state hint */}
              <span className="text-xs text-gray-400 text-center">
                {idx === 0 && formatDate(order.entry_date)}
                {idx === 1 && (active ? `${allocatedDays(order.entry_date, order.delivery_date) ?? "—"} days` : done ? "Complete" : "Pending")}
                {idx === 2 && (active ? "In Progress" : done ? "Complete" : "Pending")}
                {idx === 3 && (done ? "Dispatched" : "Pending")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stitching Card ───────────────────────────────────────────────────────────

function StitchingCard({
  order,
  sessions,
  onLogSession,
  onStatusChange,
}: {
  order: Order;
  sessions: ProductionSession[];
  onLogSession: () => void;
  onStatusChange: (updated: Order) => void;
}) {
  const status    = order.status;
  const isActive  = status === "stitching_in_progress";
  const isDone    = ["stitching_complete", "packing_in_progress", "packing_complete", "dispatched"].includes(status);
  const isPending = status === "pending";

  const totalHours    = sessions.reduce((s, r) => s + (Number(r.duration_hours) ?? 0), 0);
  const totalMachines = sessions.reduce((s, r) => s + r.machines_used, 0);
  const daysElapsed   = isDone || isActive ? allocatedDays(order.entry_date, order.delivery_date) : null;

  const laborCost = order.stitch_rate_labor * order.total_quantity;
  const partyCost = order.stitch_rate_party * order.total_quantity;

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-300
        ${isActive ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-200"}
        ${isPending ? "opacity-60" : ""}
      `}
    >
      {/* Card header */}
      <div
        className={`px-5 py-3.5 flex items-center justify-between
          ${isActive ? "bg-blue-50" : isDone ? "bg-green-50" : "bg-gray-50"}
        `}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🧵</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Stitching</h3>
            <p className="text-xs text-gray-500">
              {isActive && daysElapsed !== null
                ? `Day ${daysElapsed} · ${sessions.length} sessions · ${totalHours}h`
                : ""}
              {isDone ? `Completed · ${sessions.length} sessions · ${totalHours}h` : ""}
              {isPending ? "Waiting to start" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              In Progress
            </span>
          )}
          {isDone && (
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
              ✓ Complete
            </span>
          )}
        </div>
      </div>

      {/* Body — only show when active or done */}
      {!isPending && (
        <div className="p-5 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Sessions",  value: sessions.length },
              { label: "Hours",     value: `${totalHours}h` },
              { label: "Machines",  value: totalMachines },
              { label: "Days",      value: daysElapsed ?? "—" },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-gray-900 tabular-nums">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Cost breakdown */}
          <div className="bg-gray-50 rounded-lg p-3.5 space-y-1.5">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Cost Breakdown</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Party Charge ({formatCurrency(order.stitch_rate_party)} × {order.total_quantity.toLocaleString()})
              </span>
              <span className="font-semibold text-gray-900 tabular-nums">PKR {formatCurrency(partyCost)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Labor Cost ({formatCurrency(order.stitch_rate_labor)} × {order.total_quantity.toLocaleString()})
              </span>
              <span className="font-semibold text-orange-600 tabular-nums">PKR {formatCurrency(laborCost)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-2 mt-1">
              <span className="text-gray-700">Net Stitching</span>
              <span className={partyCost - laborCost >= 0 ? "text-green-600" : "text-red-600"}>
                PKR {formatCurrency(partyCost - laborCost)}
              </span>
            </div>
          </div>

          {/* Last 3 sessions preview */}
          {sessions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Sessions</p>
              <div className="space-y-1.5">
                {sessions
                  .slice(-3)
                  .reverse()
                  .map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2"
                    >
                      <span>{formatDate(s.session_date)}</span>
                      <span>{s.machines_used} machines</span>
                      <span>{s.duration_hours != null ? `${s.duration_hours}h` : "—"}</span>
                      <span className="text-gray-400 truncate max-w-[120px]">{s.notes ?? ""}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {isActive && (
              <>
                <button
                  onClick={onLogSession}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  + Log Session
                </button>
                <OrderStatusSelect
                  orderId={order.id}
                  currentStatus={order.status}
                  onChange={onStatusChange}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Pending body — show status select so user can start stitching */}
      {isPending && (
        <div className="p-5">
          <div className="flex gap-2">
            <OrderStatusSelect
              orderId={order.id}
              currentStatus={order.status}
              onChange={onStatusChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Packing Card ─────────────────────────────────────────────────────────────

function PackingCard({
  order,
  sessions,
  expenses,
  onLogSession,
  onStatusChange,
  onAddExpense,
  onDeleteExpense,
}: {
  order: Order;
  sessions: ProductionSession[];
  expenses: Expense[];
  onLogSession: () => void;
  onStatusChange: (updated: Order) => void;
  onAddExpense: (amount: number, description: string, date: string) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
}) {
  const status      = order.status;
  const isActive    = status === "packing_in_progress";
  const isDone      = ["packing_complete", "dispatched"].includes(status);
  const isReachable = ["stitching_complete", "packing_in_progress", "packing_complete", "dispatched"].includes(status);
  const hasPacking  = order.pack_rate_party != null || order.pack_rate_labor != null;

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expDate, setExpDate] = useState(new Date().toISOString().split("T")[0]);
  const [savingExp, setSavingExp] = useState(false);

  const totalHours    = sessions.reduce((s, r) => s + (Number(r.duration_hours) ?? 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const packParty     = (order.pack_rate_party ?? 0) * order.total_quantity;
  const packLabor     = (order.pack_rate_labor ?? 0) * order.total_quantity;

  const handleSaveExpense = async () => {
    const amt = parseFloat(expAmount);
    if (!amt || amt <= 0) return;
    setSavingExp(true);
    try {
      await onAddExpense(amt, expDesc, expDate);
      setExpAmount(""); setExpDesc(""); setExpDate(new Date().toISOString().split("T")[0]);
      setShowExpenseForm(false);
    } finally {
      setSavingExp(false);
    }
  };

  if (!isReachable) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 opacity-50">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📦</span>
          <h3 className="text-sm font-semibold text-gray-400">Packing — Pending</h3>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-300
        ${isActive ? "border-blue-300 ring-1 ring-blue-200" : isDone ? "border-green-200" : "border-gray-200"}
      `}
    >
      {/* Header */}
      <div
        className={`px-5 py-3.5 flex items-center justify-between
          ${isActive ? "bg-blue-50" : isDone ? "bg-green-50" : "bg-gray-50"}
        `}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📦</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Packing</h3>
            <p className="text-xs text-gray-500">
              {isActive
                ? `${sessions.length} sessions · ${totalHours}h · PKR ${formatCurrency(totalExpenses)} expenses`
                : isDone
                ? `Completed · ${sessions.length} sessions`
                : "Ready to start"}
            </p>
          </div>
        </div>
        {isActive && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </span>
        )}
        {isDone && (
          <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
            ✓ Complete
          </span>
        )}
        {!isActive && !isDone && (
          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
            Ready
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Sessions", value: sessions.length },
            { label: "Hours",    value: `${totalHours}h` },
            { label: "Expenses", value: `PKR ${formatCurrency(totalExpenses)}` },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
              <p className="text-base font-bold text-gray-900 tabular-nums">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Cost breakdown — only show if packing rates exist */}
        {hasPacking && (
          <div className="bg-gray-50 rounded-lg p-3.5 space-y-1.5">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Pack Cost Breakdown</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Party Charge</span>
              <span className="font-semibold text-gray-900 tabular-nums">PKR {formatCurrency(packParty)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Labor Cost</span>
              <span className="font-semibold text-orange-600 tabular-nums">PKR {formatCurrency(packLabor)}</span>
            </div>
          </div>
        )}

        {/* Expenses list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Expenses — PKR {formatCurrency(totalExpenses)}
            </p>
            <button
              onClick={() => setShowExpenseForm((v) => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {showExpenseForm ? "Cancel" : "+ Add Expense"}
            </button>
          </div>

          {showExpenseForm && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Amount (PKR) *</label>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Date *</label>
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Description</label>
                <input
                  type="text" placeholder="e.g. Thread, packaging material, transport…"
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
                />
              </div>
              <button
                onClick={handleSaveExpense}
                disabled={savingExp || !expAmount}
                className="w-full py-1.5 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700 disabled:opacity-60"
              >
                {savingExp ? "Saving…" : "Save Expense"}
              </button>
            </div>
          )}

          {expenses.length > 0 && (
            <div className="space-y-1.5">
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between text-xs bg-orange-50 rounded-lg px-3 py-2 group"
                >
                  <div className="min-w-0">
                    <span className="text-gray-700">{e.description ?? "Expense"}</span>
                    {e.expense_date && (
                      <span className="text-gray-400 ml-2">{formatDate(e.expense_date)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-semibold text-orange-700">PKR {formatCurrency(e.amount)}</span>
                    <button
                      onClick={() => onDeleteExpense(e.id)}
                      className=" text-gray-400 hover:text-red-600 p-0.5"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {expenses.length === 0 && !showExpenseForm && (
            <p className="text-xs text-gray-400 italic">No expenses recorded yet.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {isActive && (
            <button
              onClick={onLogSession}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + Log Session
            </button>
          )}
          {(isActive || (isReachable && !isDone)) && (
            <OrderStatusSelect
              orderId={order.id}
              currentStatus={order.status}
              onChange={onStatusChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dispatch Card ────────────────────────────────────────────────────────────

function DispatchCard({
  order,
  bill,
  router,
}: {
  order: Order;
  bill: Bill | null;
  router: ReturnType<typeof useRouter>;
}) {
  const isReady      = ["stitching_complete", "packing_complete", "dispatched"].includes(order.status);
  const isDispatched = order.status === "dispatched";

  if (!isReady) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 opacity-50">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🚚</span>
          <h3 className="text-sm font-semibold text-gray-400">Dispatch &amp; Bill — Pending</h3>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden
        ${isDispatched ? "border-green-200" : "border-amber-200"}
      `}
    >
      <div
        className={`px-5 py-3.5 flex items-center justify-between
          ${isDispatched ? "bg-green-50" : "bg-amber-50"}
        `}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🚚</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Dispatch &amp; Bill</h3>
            <p className="text-xs text-gray-500">
              {isDispatched ? "Dispatched" : "Ready to dispatch"}
            </p>
          </div>
        </div>
        {isDispatched ? (
          <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
            ✓ Dispatched
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Action Required
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {bill ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Bill #",  value: bill.bill_number },
                { label: "Amount",  value: `PKR ${formatCurrency(bill.amount_due)}` },
                { label: "Status",  value: bill.payment_status.toUpperCase() },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-sm font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/bills/${bill.id}`)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                View Bill
              </button>
              {bill.payment_status !== "paid" && (
                <button
                  onClick={() => router.push(`/bills/${bill.id}`)}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Record Payment
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-4">
              Order is ready — create a bill to mark as dispatched
            </p>
            <button
              onClick={() => router.push(`/bills/new?order=${order.id}`)}
              className="px-6 py-2.5 bg-[#1a2744] text-white rounded-lg text-sm font-semibold hover:bg-[#253461] transition-colors"
            >
              Create Bill
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cost Summary Panel ───────────────────────────────────────────────────────

function CostSummaryPanel({
  order,
  expenses,
  bill,
}: {
  order: Order;
  expenses: Expense[];
  bill: Bill | null;
}) {
  const qty         = order.total_quantity;
  const stitchParty = order.stitch_rate_party * qty;
  const stitchLabor = order.stitch_rate_labor * qty;
  const packParty   = (order.pack_rate_party ?? 0) * qty;
  const packLabor   = (order.pack_rate_labor ?? 0) * qty;

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const transport     = Number(order.transport_expense ?? 0);
  const loading       = Number(order.loading_expense ?? 0);
  const misc          = Number(order.miscellaneous_expense ?? 0);
  const rent          = Number(order.rent ?? 0);
  const loadCharges   = Number(order.loading_charges ?? 0);

  const totalIncome = stitchParty + packParty;
  const totalLabor  = stitchLabor + packLabor;
  const totalOps    = transport + loading + misc + rent + loadCharges + totalExpenses;
  const netProfit   = totalIncome - totalLabor - totalOps;
  const billed      = bill ? Number(bill.amount_due) : 0;
  const paid        = bill ? Number(bill.amount_paid) : 0;

  const cols: { label: string; value: number; color: string }[] = [
    { label: "Income (Party)", value: totalIncome,  color: "text-green-400" },
    { label: "Labor Cost",     value: totalLabor,   color: "text-orange-400" },
    { label: "Expenses",       value: totalOps,     color: "text-red-400" },
    { label: "Net Profit",     value: netProfit,    color: netProfit >= 0 ? "text-green-300" : "text-red-400" },
    { label: "Billed",         value: billed,       color: "text-blue-300" },
    { label: "Collected",      value: paid,         color: "text-green-300" },
  ];

  return (
    <div className="bg-[#1a2744] rounded-xl p-5 text-white">
      <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider mb-4">Cost Summary</p>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
        {cols.map((c) => (
          <div key={c.label} className="text-center">
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>
              PKR {formatCurrency(c.value)}
            </p>
            <p className="text-xs text-blue-300 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Info + Rate helpers ──────────────────────────────────────────────────────

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-4 py-3">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function RateItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900">PKR {value}</p>
    </div>
  );
}

// ─── Accessories Panel ────────────────────────────────────────────────────────

function AccessoriesPanel({
  orderId,
  accessories,
  onReload,
}: {
  orderId: string;
  accessories: OrderAccessory[];
  onReload: () => void;
}) {
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccessoryCreate>({
    name: "", total_qty: 0, unit_price: 0, from_stock: 0, purchased_qty: 0,
  });

  const totalAccessoryCharge = accessories.reduce((s, a) => s + Number(a.total_charge), 0);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await accessoryService.create(orderId, form);
      setForm({ name: "", total_qty: 0, unit_price: 0, from_stock: 0, purchased_qty: 0 });
      setShowForm(false);
      onReload();
      showToast("Accessory added");
    } catch {
      showToast("Failed to add accessory", "error");
    } finally { setSaving(false); }
  };

  const handleDelete = async (accessoryId: string) => {
    try {
      await accessoryService.delete(orderId, accessoryId);
      onReload();
      showToast("Removed");
    } catch { showToast("Failed to remove", "error"); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Accessories</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {accessories.length > 0
              ? `${accessories.length} item${accessories.length > 1 ? "s" : ""} · PKR ${formatCurrency(totalAccessoryCharge)} billed to party`
              : "Zip, thread, fabric, etc. charged to party"}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Add"}
        </Button>
      </div>

      {accessories.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Item</th>
                <th className="px-4 py-2.5 text-right">Total Qty</th>
                <th className="px-4 py-2.5 text-right">Unit Price</th>
                <th className="px-4 py-2.5 text-right">Charge</th>
                <th className="px-4 py-2.5 text-right">From Stock</th>
                <th className="px-4 py-2.5 text-right">Purchased</th>
                <th className="px-4 py-2.5 text-right">Buy Cost/u</th>
                <th className="px-4 py-2.5 text-right">Spend</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {accessories.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{Number(a.total_qty).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">PKR {formatCurrency(a.unit_price)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-700">PKR {formatCurrency(a.total_charge)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{Number(a.from_stock).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{Number(a.purchased_qty).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                    {a.purchase_cost != null ? `PKR ${formatCurrency(a.purchase_cost)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-orange-600">
                    {a.total_purchase_spend != null ? `PKR ${formatCurrency(a.total_purchase_spend)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-blue-50">
                <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total accessory charge to party</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold text-blue-700 tabular-nums">
                  PKR {formatCurrency(totalAccessoryCharge)}
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">New Accessory</p>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[140px]">
              <FormField label="Item Name" required>
                <Input placeholder="e.g. Zip" value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </FormField>
            </div>
            <div>
              <FormField label="Total Qty" required>
                <Input type="number" min="0" step="0.01" className="w-24" value={form.total_qty || ""}
                  onChange={(e) => setForm((p) => ({ ...p, total_qty: parseFloat(e.target.value) || 0 }))} required />
              </FormField>
            </div>
            <div>
              <FormField label="Unit Price (PKR)" required>
                <Input type="number" min="0" step="0.01" className="w-28" value={form.unit_price || ""}
                  onChange={(e) => setForm((p) => ({ ...p, unit_price: parseFloat(e.target.value) || 0 }))} required />
              </FormField>
            </div>
            <div>
              <FormField label="From Stock">
                <Input type="number" min="0" step="0.01" className="w-24" value={form.from_stock || ""}
                  onChange={(e) => setForm((p) => ({ ...p, from_stock: parseFloat(e.target.value) || 0 }))} />
              </FormField>
            </div>
            <div>
              <FormField label="Purchased Qty">
                <Input type="number" min="0" step="0.01" className="w-24" value={form.purchased_qty || ""}
                  onChange={(e) => setForm((p) => ({ ...p, purchased_qty: parseFloat(e.target.value) || 0 }))} />
              </FormField>
            </div>
            <div>
              <FormField label="Buy Cost/unit">
                <Input type="number" min="0" step="0.01" className="w-28" value={form.purchase_cost ?? ""}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setForm((p) => ({ ...p, purchase_cost: isNaN(v) ? undefined : v }));
                  }} />
              </FormField>
            </div>
            <div className="pb-0.5">
              <Button type="submit" loading={saving} disabled={!form.name || !form.total_qty || !form.unit_price}>
                Add
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { showToast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [stitchSessions, setStitchSessions] = useState<ProductionSession[]>([]);
  const [packSessions, setPackSessions] = useState<ProductionSession[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bill, setBill] = useState<Bill | null>(null);
  const [sessionSheet, setSessionSheet] = useState<Department | null>(null);
  const [txSheet, setTxSheet] = useState(false);
  const [editSheet, setEditSheet] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [materials, setMaterials] = useState<OrderMaterials | null>(null);
  const [accessories, setAccessories] = useState<OrderAccessory[]>([]);
  const [subOrderSheetOpen, setSubOrderSheetOpen] = useState(false);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [creatingSubOrder, setCreatingSubOrder] = useState(false);

  const loadOrder = useCallback(async () => {
    try {
      setOrder(await ordersService.getOrder(id));
    } catch {
      router.push("/orders");
    }
  }, [id, router]);

  const loadSessions = useCallback(async () => {
    const [s, p] = await Promise.all([
      productionService.getSessionsForOrder(id, "stitching"),
      productionService.getSessionsForOrder(id, "packing"),
    ]);
    setStitchSessions(s);
    setPackSessions(p);
  }, [id]);

  const loadTransactions = useCallback(async () => {
    try {
      await transactionsService.getTransactions({ order_id: id, size: 100 });
    } catch { /* ignore */ }
  }, [id]);

  const loadAccessories = useCallback(async () => {
    if (!id) return;
    try {
      const data = await accessoryService.list(id as string);
      setAccessories(data);
    } catch { /* silent */ }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadOrder(), loadSessions(), loadTransactions()]).finally(() =>
      setLoading(false)
    );
    partiesService.getParties(1, 100).then((r) => setParties(r.data));
    productService.getOrderMaterials(id).then(setMaterials).catch(() => setMaterials(null));
    expensesService.listByOrder(id).then((r) => setExpenses(r.data)).catch(() => {});
    billService.getByOrder(id).then(setBill).catch(() => {});
    loadAccessories();
  }, [loadOrder, loadSessions, loadTransactions, loadAccessories, id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await ordersService.deleteOrder(id);
      router.push("/orders");
    } finally {
      setDeleting(false);
      setDeleteDialog(false);
    }
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      const cloned = await ordersService.cloneOrder(id);
      showToast(`Order cloned as ${cloned.order_number}`);
      router.push(`/orders/${cloned.id}`);
    } catch {
      showToast("Failed to clone order", "error");
    } finally {
      setCloning(false);
    }
  };

  const handleAddExpense = async (amount: number, description: string, date: string) => {
    const expense = await expensesService.create({
      order_id: id,
      amount,
      description: description || undefined,
      expense_date: date,
    });
    setExpenses((prev) => [...prev, expense]);
    showToast("Expense added");
  };

  const handleDeleteExpense = async (expenseId: string) => {
    await expensesService.delete(expenseId);
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    showToast("Expense removed");
  };

  const handleCreateSubOrder = async () => {
    if (!order) return;
    if (selectedStages.length === 0) {
      showToast("Select at least one stage", "error");
      return;
    }
    setCreatingSubOrder(true);
    try {
      const subOrder = await ordersService.createOrder({
        party_id: order.party_id ?? undefined,
        party_reference: order.party_reference ?? undefined,
        goods_description: order.goods_description,
        total_quantity: order.total_quantity,
        stitch_rate_party: order.stitch_rate_party,
        stitch_rate_labor: order.stitch_rate_labor,
        pack_rate_party: order.pack_rate_party ?? undefined,
        pack_rate_labor: order.pack_rate_labor ?? undefined,
        entry_date: order.entry_date,
        items: order.items.map((i) => ({ size: i.size, quantity: i.quantity })),
        sub_suffix: "B",
        parent_order_id: order.id,
        sub_stages: selectedStages,
      });
      showToast("Sub-order B created");
      router.push(`/orders/${subOrder.id}`);
    } catch {
      showToast("Failed to create sub-order", "error");
    } finally {
      setCreatingSubOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="space-y-5">
      {/* Back button + order number/status + Edit/Clone/Delete buttons */}
      <div>
        <button
          onClick={() => router.push("/orders")}
          className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Orders
        </button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{order.order_number}</h1>
              <StatusBadge status={order.status} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.open(`/orders/${id}/jobcard`, "_blank")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Job Card
            </button>
            <Button size="sm" onClick={() => setEditSheet(true)}>
              Edit
            </Button>
            <button
              onClick={handleClone}
              disabled={cloning}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {cloning ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Cloning…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Clone
                </>
              )}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeleteDialog(true)}
            >
              Delete
            </Button>
            {!order.sub_suffix && (
              <button
                onClick={() => setSubOrderSheetOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
              >
                + Sub-Order B
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Party + goods description header card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">
              {order.party_name ?? order.party_reference ?? "No party"}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{order.goods_description}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 flex-shrink-0">
            <InfoCard label="Qty"      value={order.total_quantity.toLocaleString()} />
            <InfoCard label="Entry"    value={formatDate(order.entry_date)} />
            <InfoCard label="Delivery" value={formatDate(order.delivery_date ?? "")} />
          </div>
          {order.lot_number && (
            <div>
              <span className="text-xs text-gray-500">Lot #</span>
              <p className="font-semibold text-gray-900">{order.lot_number}</p>
            </div>
          )}
        </div>

        {/* Rates */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex gap-8">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stitching Rates</p>
              <div className="flex gap-6">
                <RateItem label="Party Rate" value={formatCurrency(order.stitch_rate_party)} />
                <RateItem label="Labor Rate" value={formatCurrency(order.stitch_rate_labor)} />
              </div>
            </div>
            {(order.pack_rate_party != null || order.pack_rate_labor != null) && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Packing Rates</p>
                <div className="flex gap-6">
                  <RateItem label="Party Rate" value={formatCurrency(order.pack_rate_party)} />
                  <RateItem label="Labor Rate" value={formatCurrency(order.pack_rate_labor)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Header */}
      {order.sub_suffix === "B" ? (
        <SubOrderStageTracker order={order} onStageChange={loadOrder} />
      ) : (
        <PipelineHeader order={order} />
      )}

      {/* Stage Cards */}
      <StitchingCard
        order={order}
        sessions={stitchSessions}
        onLogSession={() => setSessionSheet("stitching")}
        onStatusChange={setOrder}
      />

      <PackingCard
        order={order}
        sessions={packSessions}
        expenses={expenses}
        onLogSession={() => setSessionSheet("packing")}
        onStatusChange={setOrder}
        onAddExpense={handleAddExpense}
        onDeleteExpense={handleDeleteExpense}
      />

      <DispatchCard order={order} bill={bill} router={router} />

      {/* Colour Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Colour Breakdown</h2>
        <OrderItemsTable
          items={order.items}
          onSave={async (items) => {
            const updated = await ordersService.updateItems(order.id, items);
            setOrder(updated);
            showToast("Colour breakdown saved");
          }}
        />
      </div>

      {/* Accessories */}
      <AccessoriesPanel
        orderId={order.id}
        accessories={accessories}
        onReload={loadAccessories}
      />

      {/* Material Requirements */}
      <MaterialRequirementsPanel materials={materials} onEdit={() => setEditSheet(true)} />

      {/* Cost Summary */}
      <CostSummaryPanel order={order} expenses={expenses} bill={bill} />

      {/* Sheets */}
      <Sheet
        open={!!sessionSheet}
        onClose={() => setSessionSheet(null)}
        title={`Log ${sessionSheet === "stitching" ? "Stitching" : "Packing"} Session`}
      >
        {sessionSheet && (
          <SessionForm
            orderId={id}
            department={sessionSheet}
            onSuccess={() => { setSessionSheet(null); loadSessions(); }}
            onCancel={() => setSessionSheet(null)}
          />
        )}
      </Sheet>

      <Sheet open={txSheet} onClose={() => setTxSheet(false)} title="Record Payment">
        <TransactionForm
          orderId={id}
          partyId={order.party_id ?? undefined}
          onSuccess={() => { setTxSheet(false); loadTransactions(); }}
          onCancel={() => setTxSheet(false)}
        />
      </Sheet>

      <Sheet open={editSheet} onClose={() => setEditSheet(false)} title="Edit Order" width="w-[580px]">
        <OrderForm
          parties={parties}
          orderId={order.id}
          initialData={order}
          onSuccess={(updated) => { setEditSheet(false); setOrder(updated); showToast("Order updated"); }}
          onCancel={() => setEditSheet(false)}
        />
      </Sheet>

      <Sheet open={subOrderSheetOpen} onClose={() => setSubOrderSheetOpen(false)} title="Create Sub-Order B">
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            Create a B sub-order for additional charges (packing, loading, etc.)
          </p>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Select stages to include:</p>
            {PACKING_STAGE_OPTIONS.map((stage) => (
              <label key={stage.key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStages.includes(stage.key)}
                  onChange={(e) => {
                    setSelectedStages((prev) =>
                      e.target.checked
                        ? [...prev, stage.key]
                        : prev.filter((s) => s !== stage.key)
                    );
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-800">{stage.label}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleCreateSubOrder}
              loading={creatingSubOrder}
              disabled={selectedStages.length === 0}
            >
              Create Sub-Order B
            </Button>
            <Button variant="secondary" onClick={() => setSubOrderSheetOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={deleteDialog}
        title="Delete Order"
        message={`Are you sure you want to delete order ${order.order_number}? This action cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog(false)}
      />
    </div>
  );
}
