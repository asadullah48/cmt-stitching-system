"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common";
import { reportsService } from "@/hooks/services";
import type { DailyReport } from "@/hooks/types";

const stageName = (stage: string) => stage.replace("_in_progress", "").replaceAll("_", " ");
const money = (value: number) => `Rs ${Number(value).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

function asText(report: DailyReport): string {
  const lines = [`DAILY REPORT - ${report.date}`, ""];
  lines.push(`Dispatched: ${report.orders_dispatched.length}`);
  report.orders_dispatched.forEach((o) => lines.push(`- ${o.order_number}: ${o.goods_description} (${o.total_quantity})`));
  lines.push("", `Ready for dispatch: ${report.ready_for_dispatch.length}`);
  report.ready_for_dispatch.forEach((o) => lines.push(`- ${o.order_number}: ${o.goods_description} (${o.total_quantity})`));
  lines.push("", "In progress:");
  report.in_progress.forEach((s) => lines.push(`- ${stageName(s.stage)}: ${s.orders.length} orders, ${s.total_quantity} pcs`));
  lines.push("", `Open alterations/tasks: ${report.open_order_todos.length}`);
  report.open_order_todos.forEach((t) => lines.push(`- ${t.order_number}: ${t.title}`));
  lines.push("", `Low stock: ${report.low_stock_items.length}`);
  report.low_stock_items.forEach((i) => lines.push(`- ${i.name}: ${i.current_stock} ${i.unit} (minimum ${i.minimum_stock})`));
  lines.push("", `Overhead due in 7 days: ${money(report.overhead_due_total)}`);
  report.overhead_due.forEach((d) => lines.push(`- ${d.title}: ${money(d.amount)} due ${d.due_date}`));
  return lines.join("\n");
}

export default function ReportsPage() {
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    reportsService.getDaily(date).then(setReport).catch(() => setError("Could not load the daily report.")).finally(() => setLoading(false));
  }, [date]);

  const copyText = useMemo(() => report ? asText(report) : "", [report]);
  const copy = async () => {
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return <div className="space-y-5">
    <PageHeader title="Reports" subtitle="Daily production and operations report" />
    <div className="flex items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <label className="text-sm font-medium text-gray-700">Report date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <button onClick={copy} disabled={!report} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{copied ? "Copied" : "Copy as text"}</button>
    </div>
    {loading && <p className="text-sm text-gray-500">Loading daily report...</p>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {report && !loading && <div className="grid gap-4 lg:grid-cols-2">
      <Section title={`Dispatched (${report.orders_dispatched.length})`} rows={report.orders_dispatched.map((o) => `${o.order_number} - ${o.goods_description} (${o.total_quantity})`)} />
      <Section title={`Ready for dispatch (${report.ready_for_dispatch.length})`} rows={report.ready_for_dispatch.map((o) => `${o.order_number} - ${o.goods_description} (${o.total_quantity})`)} />
      <Section title="In progress" rows={report.in_progress.map((s) => `${stageName(s.stage)}: ${s.orders.length} orders, ${s.total_quantity} pcs`)} />
      <Section title={`Open alterations/tasks (${report.open_order_todos.length})`} rows={report.open_order_todos.map((t) => `${t.order_number} - ${t.title}`)} />
      <Section title={`Low stock (${report.low_stock_items.length})`} rows={report.low_stock_items.map((i) => `${i.name}: ${i.current_stock} ${i.unit} / min ${i.minimum_stock}`)} />
      <Section title={`Overhead due in 7 days - ${money(report.overhead_due_total)}`} rows={report.overhead_due.map((d) => `${d.title}: ${money(d.amount)} due ${d.due_date}`)} />
    </div>}
  </div>;
}

function Section({ title, rows }: { title: string; rows: string[] }) {
  return <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-gray-900">{title}</h2>{rows.length ? <ul className="space-y-2 text-sm text-gray-700">{rows.map((row, i) => <li key={`${row}-${i}`}>{row}</li>)}</ul> : <p className="text-sm text-gray-400">None</p>}</section>;
}
