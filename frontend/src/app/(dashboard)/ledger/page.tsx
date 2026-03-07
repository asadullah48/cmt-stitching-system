"use client";

import React, { useState, useEffect, useCallback } from "react";
import { transactionsService, partiesService } from "@/hooks/services";
import { formatDate, formatCurrency } from "@/hooks/utils";
import {
  PageHeader, Button, DataTable, Sheet, Pagination, Select, Input,
} from "@/components/common";
import { TransactionForm } from "@/components/financial";
import type {
  FinancialTransaction, Party, TransactionFilters, TransactionType, PaginatedResponse,
} from "@/hooks/types";
import type { Column } from "@/components/common";

export default function LedgerPage() {
  const [result, setResult] = useState<PaginatedResponse<FinancialTransaction>>({
    data: [], total: 0, page: 1, size: 30,
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1, size: 30 });
  const [parties, setParties] = useState<Party[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async (f: TransactionFilters) => {
    setLoading(true);
    try {
      setResult(await transactionsService.getTransactions(f));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters);
    partiesService.getParties(1, 200).then((r) => setParties(r.data));
  }, [load, filters]);

  const handleFilter = (patch: Partial<TransactionFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  };

  // Calculate totals for visible rows
  const totalIncome = result.data
    .filter((t) => t.transaction_type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalPayments = result.data
    .filter((t) => t.transaction_type === "payment")
    .reduce((s, t) => s + t.amount, 0);

  const columns: Column<FinancialTransaction>[] = [
    {
      key: "transaction_date",
      header: "Date",
      render: (r) => formatDate(r.transaction_date),
    },
    {
      key: "party_name",
      header: "Party",
      render: (r) => r.party_name ?? "—",
    },
    {
      key: "transaction_type",
      header: "Type",
      render: (r) => (
        <span className={`capitalize text-xs font-medium px-2 py-0.5 rounded-full ${
          r.transaction_type === "income"
            ? "bg-green-50 text-green-700"
            : r.transaction_type === "payment"
            ? "bg-blue-50 text-blue-700"
            : r.transaction_type === "expense"
            ? "bg-red-50 text-red-700"
            : "bg-gray-100 text-gray-600"
        }`}>
          {r.transaction_type}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (r) => (
        <span className="truncate max-w-[220px] block">{r.description}</span>
      ),
    },
    {
      key: "payment_method",
      header: "Method",
      render: (r) => (
        <span className="capitalize text-gray-600 text-xs">
          {r.payment_method?.replace("_", " ") ?? "—"}
        </span>
      ),
    },
    {
      key: "reference_number",
      header: "Ref #",
      render: (r) => (
        <span className="text-gray-500 text-xs">{r.reference_number ?? "—"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (r) => (
        <span className={`font-semibold tabular-nums ${
          r.transaction_type === "income" ? "text-green-600" : "text-orange-600"
        }`}>
          {r.transaction_type === "income" ? "+" : "-"} PKR {formatCurrency(r.amount)}
        </span>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ledger"
        subtitle={`${result.total} transactions`}
        action={
          <Button onClick={() => setSheetOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Transaction
          </Button>
        }
      />

      {/* Summary row */}
      {result.data.length > 0 && (
        <div className="flex gap-4">
          <div className="bg-green-50 rounded-lg px-4 py-2.5">
            <p className="text-xs text-green-600 font-medium">Income (this page)</p>
            <p className="text-base font-bold text-green-700 tabular-nums">
              PKR {formatCurrency(totalIncome)}
            </p>
          </div>
          <div className="bg-orange-50 rounded-lg px-4 py-2.5">
            <p className="text-xs text-orange-600 font-medium">Payments (this page)</p>
            <p className="text-base font-bold text-orange-700 tabular-nums">
              PKR {formatCurrency(totalPayments)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          className="w-44"
          value={filters.party_id ?? ""}
          onChange={(e) => handleFilter({ party_id: e.target.value || undefined })}
        >
          <option value="">All parties</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>

        <Select
          className="w-40"
          value={filters.transaction_type ?? ""}
          onChange={(e) =>
            handleFilter({ transaction_type: (e.target.value as TransactionType) || undefined })
          }
        >
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="payment">Payment</option>
          <option value="expense">Expense</option>
          <option value="adjustment">Adjustment</option>
        </Select>

        <Input
          type="date"
          className="w-40"
          value={filters.date_from ?? ""}
          onChange={(e) => handleFilter({ date_from: e.target.value || undefined })}
        />
        <Input
          type="date"
          className="w-40"
          value={filters.date_to ?? ""}
          onChange={(e) => handleFilter({ date_to: e.target.value || undefined })}
        />

        {(filters.party_id || filters.date_from || filters.date_to || filters.transaction_type) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters({ page: 1, size: 30 })}
          >
            Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={result.data}
        loading={loading}
        keyExtractor={(r) => r.id}
        emptyMessage="No transactions found."
      />

      <Pagination
        total={result.total}
        page={filters.page ?? 1}
        size={filters.size ?? 30}
        onChange={(p) => setFilters((f) => ({ ...f, page: p }))}
      />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New Transaction">
        <TransactionForm
          onSuccess={() => { setSheetOpen(false); load(filters); }}
          onCancel={() => setSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}
