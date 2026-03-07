"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ordersService, productionService, transactionsService } from "@/hooks/services";
import { formatDate, formatCurrency } from "@/hooks/utils";
import {
  StatusBadge, Button, Sheet, ConfirmDialog, Spinner,
  DataTable, EmptyState,
} from "@/components/common";
import { OrderStatusSelect, OrderItemsTable } from "@/components/orders";
import { SessionForm } from "@/components/production";
import { TransactionForm } from "@/components/financial";
import type { Order, ProductionSession, FinancialTransaction, Department } from "@/hooks/types";
import type { Column } from "@/components/common";

type Tab = "stitching" | "packing" | "transactions";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("stitching");
  const [stitchSessions, setStitchSessions] = useState<ProductionSession[]>([]);
  const [packSessions, setPackSessions] = useState<ProductionSession[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [sessionSheet, setSessionSheet] = useState<Department | null>(null);
  const [txSheet, setTxSheet] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      const res = await transactionsService.getTransactions({ order_id: id, size: 100 });
      setTransactions(res.data);
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadOrder(), loadSessions(), loadTransactions()]).finally(() =>
      setLoading(false)
    );
  }, [loadOrder, loadSessions, loadTransactions]);

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

  const sessionColumns: Column<ProductionSession>[] = [
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
        <span className="text-gray-500 text-xs">{r.notes ?? "—"}</span>
      ),
    },
  ];

  const txColumns: Column<FinancialTransaction>[] = [
    {
      key: "transaction_date",
      header: "Date",
      render: (r) => formatDate(r.transaction_date),
    },
    {
      key: "transaction_type",
      header: "Type",
      render: (r) => (
        <span className={`capitalize text-xs font-medium px-2 py-0.5 rounded-full ${
          r.transaction_type === "income"
            ? "bg-green-50 text-green-700"
            : "bg-orange-50 text-orange-700"
        }`}>
          {r.transaction_type}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (r) => r.description,
    },
    {
      key: "amount",
      header: "Amount",
      render: (r) => (
        <span className={`font-semibold tabular-nums ${
          r.transaction_type === "income" ? "text-green-600" : "text-orange-600"
        }`}>
          PKR {formatCurrency(r.amount)}
        </span>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="space-y-6">
      {/* Back + header */}
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
            <p className="text-sm text-gray-500 mt-0.5">
              {order.party_name ?? order.party_reference ?? "No party"} · {order.goods_description}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeleteDialog(true)}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard label="Total Quantity" value={order.total_quantity.toLocaleString()} />
        <InfoCard label="Entry Date" value={formatDate(order.entry_date)} />
        <InfoCard label="Arrival Date" value={formatDate(order.arrival_date)} />
        <InfoCard label="Delivery Date" value={formatDate(order.delivery_date)} />
      </div>

      {/* Rates */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Rates</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stitching</p>
            <div className="flex gap-6">
              <RateItem label="Party Rate" value={formatCurrency(order.stitch_rate_party)} />
              <RateItem label="Labor Rate" value={formatCurrency(order.stitch_rate_labor)} />
            </div>
          </div>
          {(order.pack_rate_party != null || order.pack_rate_labor != null) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Packing</p>
              <div className="flex gap-6">
                <RateItem label="Party Rate" value={formatCurrency(order.pack_rate_party)} />
                <RateItem label="Labor Rate" value={formatCurrency(order.pack_rate_labor)} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status update */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Update Status</h2>
        <OrderStatusSelect
          orderId={order.id}
          currentStatus={order.status}
          onChange={(updated) => setOrder(updated)}
        />
      </div>

      {/* Items table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Size Breakdown</h2>
        <OrderItemsTable items={order.items} />
      </div>

      {/* Sessions + Transactions tabs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {(["stitching", "packing", "transactions"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "stitching"
                ? `Stitching (${stitchSessions.length})`
                : t === "packing"
                ? `Packing (${packSessions.length})`
                : `Transactions (${transactions.length})`}
            </button>
          ))}

          <div className="ml-auto px-4 flex items-center gap-2">
            {tab === "stitching" && (
              <Button size="sm" onClick={() => setSessionSheet("stitching")}>
                + Log Session
              </Button>
            )}
            {tab === "packing" && (
              <Button size="sm" onClick={() => setSessionSheet("packing")}>
                + Log Session
              </Button>
            )}
            {tab === "transactions" && (
              <Button size="sm" onClick={() => setTxSheet(true)}>
                + Record Payment
              </Button>
            )}
          </div>
        </div>

        <div className="p-4">
          {tab === "stitching" && (
            stitchSessions.length === 0
              ? <EmptyState message="No stitching sessions logged yet." />
              : <DataTable
                  columns={sessionColumns}
                  data={stitchSessions}
                  keyExtractor={(r) => r.id}
                />
          )}
          {tab === "packing" && (
            packSessions.length === 0
              ? <EmptyState message="No packing sessions logged yet." />
              : <DataTable
                  columns={sessionColumns}
                  data={packSessions}
                  keyExtractor={(r) => r.id}
                />
          )}
          {tab === "transactions" && (
            transactions.length === 0
              ? <EmptyState message="No transactions recorded for this order." />
              : <DataTable
                  columns={txColumns}
                  data={transactions}
                  keyExtractor={(r) => r.id}
                />
          )}
        </div>
      </div>

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
