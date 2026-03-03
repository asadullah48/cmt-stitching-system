"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { partiesService } from "@/hooks/services";
import { formatCurrency, balanceColor } from "@/hooks/utils";
import {
  PageHeader, Button, DataTable, Sheet, Pagination,
} from "@/components/common";
import { PartyForm } from "@/components/financial";
import type { Party, PaginatedResponse } from "@/hooks/types";
import type { Column } from "@/components/common";

export default function PartiesPage() {
  const router = useRouter();
  const [result, setResult] = useState<PaginatedResponse<Party>>({
    data: [], total: 0, page: 1, size: 50,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      setResult(await partiesService.getParties(p, 50));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const columns: Column<Party>[] = [
    {
      key: "name",
      header: "Party Name",
      render: (row) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      key: "contact_person",
      header: "Contact",
      render: (row) => row.contact_person ?? "—",
    },
    {
      key: "phone",
      header: "Phone",
      render: (row) => row.phone ?? "—",
    },
    {
      key: "payment_terms",
      header: "Terms",
      render: (row) => row.payment_terms ?? "—",
    },
    {
      key: "balance",
      header: "Balance",
      render: (row) => (
        <span className={`font-semibold tabular-nums ${balanceColor(row.balance)}`}>
          PKR {formatCurrency(row.balance)}
        </span>
      ),
      className: "text-right",
      headerClassName: "text-right",
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/parties/${row.id}`); }}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          Ledger
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Parties"
        subtitle={`${result.total} registered parties`}
        action={
          <Button onClick={() => setSheetOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Party
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={result.data}
        loading={loading}
        keyExtractor={(row) => row.id}
        onRowClick={(row) => router.push(`/parties/${row.id}`)}
        emptyMessage="No parties yet. Add your first party to start creating orders."
      />

      <Pagination
        total={result.total}
        page={page}
        size={50}
        onChange={setPage}
      />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New Party">
        <PartyForm
          onSuccess={() => { setSheetOpen(false); load(page); }}
          onCancel={() => setSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}
