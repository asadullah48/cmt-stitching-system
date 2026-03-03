"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { partiesService } from "@/hooks/services";
import { formatDate, formatCurrency, balanceColor } from "@/hooks/utils";
import {
  PageHeader, Button, Sheet, Spinner, DataTable,
} from "@/components/common";
import { TransactionForm } from "@/components/financial";
import type { PartyLedgerResponse, FinancialTransaction } from "@/hooks/types";
import type { Column } from "@/components/common";

export default function PartyLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [ledger, setLedger] = useState<PartyLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [txSheet, setTxSheet] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLedger(await partiesService.getPartyLedger(id));
    } catch {
      router.push("/parties");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<FinancialTransaction>[] = [
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
            : r.transaction_type === "payment"
            ? "bg-blue-50 text-blue-700"
            : "bg-gray-100 text-gray-600"
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
      key: "reference_number",
      header: "Ref #",
      render: (r) => r.reference_number ?? "—",
    },
    {
      key: "payment_method",
      header: "Method",
      render: (r) => (
        <span className="capitalize text-gray-600">{r.payment_method ?? "—"}</span>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (!ledger) return null;

  const { party, transactions, balance } = ledger;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/parties")}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Parties
      </button>

      <PageHeader
        title={party.name}
        subtitle={party.contact_person ?? party.phone ?? ""}
        action={
          <Button onClick={() => setTxSheet(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Record Transaction
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Current Balance</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${balanceColor(balance)}`}>
            PKR {formatCurrency(balance)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Transactions</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{transactions.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Phone</p>
          <p className="text-sm font-semibold mt-1 text-gray-900">{party.phone ?? "—"}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Payment Terms</p>
          <p className="text-sm font-semibold mt-1 text-gray-900">{party.payment_terms ?? "—"}</p>
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Transaction History</h2>
        <DataTable
          columns={columns}
          data={transactions}
          keyExtractor={(r) => r.id}
          emptyMessage="No transactions yet for this party."
        />
      </div>

      <Sheet open={txSheet} onClose={() => setTxSheet(false)} title="Record Transaction">
        <TransactionForm
          partyId={id}
          onSuccess={() => { setTxSheet(false); load(); }}
          onCancel={() => setTxSheet(false)}
        />
      </Sheet>
    </div>
  );
}
