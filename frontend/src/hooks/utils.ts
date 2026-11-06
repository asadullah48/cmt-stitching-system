import type { OrderStatus } from "./types";

// ─── Currency ────────────────────────────────────────────────────────────────

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-PK", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const parts = date.split("T")[0].split("-");
  if (parts.length !== 3) return date;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

export function toInputDate(date: string | null | undefined): string {
  if (!date) return "";
  return date.split("T")[0];
}

export function todayInputDate(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Status ──────────────────────────────────────────────────────────────────

type StatusConfig = {
  label: string;
  bg: string;
  text: string;
  dot: string;
};

const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  cutting_in_progress: {
    label: "Cutting",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    dot: "bg-cyan-500",
  },
  cutting_complete: {
    label: "Cut Done",
    bg: "bg-sky-50",
    text: "text-sky-700",
    dot: "bg-sky-500",
  },
  stitching_in_progress: {
    label: "Stitching",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  stitching_complete: {
    label: "Stitch Done",
    bg: "bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
  },
  packing_in_progress: {
    label: "Packing",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  packing_complete: {
    label: "Pack Done",
    bg: "bg-teal-50",
    text: "text-teal-700",
    dot: "bg-teal-500",
  },
  dispatched: {
    label: "Dispatched",
    bg: "bg-gray-100",
    text: "text-gray-600",
    dot: "bg-gray-400",
  },
};

export function getStatusConfig(status: OrderStatus): StatusConfig {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
}

export const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "cutting_in_progress",
  "cutting_complete",
  "stitching_in_progress",
  "stitching_complete",
  "packing_in_progress",
  "packing_complete",
  "dispatched",
];

// ─── className merge ──────────────────────────────────────────────────────────

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ─── Numbers ─────────────────────────────────────────────────────────────────

export function formatQuantity(n: number | null | undefined): string {
  if (n == null) return "0";
  return n.toLocaleString();
}

export function balanceColor(balance: number): string {
  if (balance > 0) return "text-green-600";
  if (balance < 0) return "text-red-600";
  return "text-gray-500";
}
