"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { partiesService } from "@/hooks/services";
import { formatCurrency, balanceColor } from "@/hooks/utils";
import {
  PageHeader, Button, DataTable, Sheet, Pagination, SearchInput, ConfirmDialog,
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
  const [editParty, setEditParty] = useState<Party | null>(null);
  const [deleteParty, setDeleteParty] = useState<Party | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      setResult(await partiesService.getParties(p, 50));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const handleDelete = async () => {
    if (!deleteParty) return;
    setDeleting(true);
    try {
      await partiesService.deleteParty(deleteParty.id);
      setDeleteParty(null);
      load(page);
    } finally {
      setDeleting(false);
    }
  };

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
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); setEditParty(row); }}
            className="text-xs text-gray-500 hover:text-gray-800 font-medium"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/parties/${row.id}`); }}
            className="text-xs text-blue-600 hover:underline font-medium"
          >
            Ledger
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteParty(row); }}
            className="text-xs text-red-500 hover:text-red-700 font-medium"
          >
            Delete
          </button>
        </div>
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

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search parties by name, contact, phone…"
          className="w-72"
        />
      </div>

      <DataTable
        columns={columns}
        data={result.data.filter((p) =>
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.contact_person ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (p.phone ?? "").includes(search)
        )}
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

      <ConfirmDialog
        open={!!deleteParty}
        title="Delete Party"
        message={`Delete "${deleteParty?.name}"? This cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteParty(null)}
      />

      <Sheet open={!!editParty} onClose={() => setEditParty(null)} title="Edit Party">
        {editParty && (
          <PartyForm
            initialData={editParty}
            partyId={editParty.id}
            onSuccess={() => { setEditParty(null); load(page); }}
            onCancel={() => setEditParty(null)}
          />
        )}
      </Sheet>
    </div>
  );
}
