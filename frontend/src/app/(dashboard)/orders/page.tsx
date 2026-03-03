"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ordersService, partiesService } from "@/hooks/services";
import { formatDate, ALL_STATUSES, getStatusConfig } from "@/hooks/utils";
import {
  PageHeader, Button, DataTable, StatusBadge,
  Sheet, Pagination, Select, Input,
} from "@/components/common";
import { OrderForm } from "@/components/orders";
import type { Order, Party, OrderFilters, OrderStatus, PaginatedResponse } from "@/hooks/types";
import type { Column } from "@/components/common";

export default function OrdersPage() {
  const router = useRouter();

  const [result, setResult] = useState<PaginatedResponse<Order>>({
    data: [], total: 0, page: 1, size: 20,
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OrderFilters>({ page: 1, size: 20 });
  const [parties, setParties] = useState<Party[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async (f: OrderFilters) => {
    setLoading(true);
    try {
      const data = await ordersService.getOrders(f);
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters);
    partiesService.getParties(1, 200).then((r) => setParties(r.data));
  }, [load, filters]);

  const handleFilterChange = (patch: Partial<OrderFilters>) => {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
  };

  const columns: Column<Order>[] = [
    {
      key: "order_number",
      header: "Order #",
      render: (row) => (
        <span className="font-semibold text-blue-600">{row.order_number}</span>
      ),
    },
    {
      key: "party_name",
      header: "Party",
      render: (row) => (
        <span className="text-gray-700">{row.party_name ?? row.party_reference ?? "—"}</span>
      ),
    },
    {
      key: "goods_description",
      header: "Goods",
      render: (row) => (
        <span className="block max-w-[200px] truncate">{row.goods_description}</span>
      ),
    },
    {
      key: "total_quantity",
      header: "Qty",
      render: (row) => row.total_quantity.toLocaleString(),
      className: "text-right tabular-nums",
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
      render: (row) => (
        <span className={row.delivery_date && new Date(row.delivery_date) < new Date() && row.status !== "dispatched" ? "text-red-600" : "text-gray-600"}>
          {formatDate(row.delivery_date)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/orders/${row.id}`); }}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          View
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={`${result.total} total orders`}
        action={
          <Button onClick={() => setSheetOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Order
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select
          className="w-48"
          value={filters.status ?? ""}
          onChange={(e) =>
            handleFilterChange({ status: (e.target.value as OrderStatus) || undefined })
          }
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {getStatusConfig(s).label}
            </option>
          ))}
        </Select>

        <Select
          className="w-48"
          value={filters.party_id ?? ""}
          onChange={(e) =>
            handleFilterChange({ party_id: e.target.value || undefined })
          }
        >
          <option value="">All parties</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>

        <Input
          type="date"
          className="w-40"
          value={filters.date_from ?? ""}
          onChange={(e) => handleFilterChange({ date_from: e.target.value || undefined })}
          placeholder="From"
        />
        <Input
          type="date"
          className="w-40"
          value={filters.date_to ?? ""}
          onChange={(e) => handleFilterChange({ date_to: e.target.value || undefined })}
          placeholder="To"
        />

        {(filters.status || filters.party_id || filters.date_from || filters.date_to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters({ page: 1, size: 20 })}
          >
            Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={result.data}
        loading={loading}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => router.push(`/orders/${row.id}`)}
        emptyMessage="No orders found. Create your first order to get started."
      />

      <Pagination
        total={result.total}
        page={filters.page ?? 1}
        size={filters.size ?? 20}
        onChange={(p) => setFilters((f) => ({ ...f, page: p }))}
      />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New Order" width="w-[580px]">
        <OrderForm
          parties={parties}
          onSuccess={(order) => {
            setSheetOpen(false);
            router.push(`/orders/${order.id}`);
          }}
          onCancel={() => setSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}
