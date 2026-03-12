"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { billService, Bill } from "@/hooks/services";
import { useToast } from "@/hooks/toast";

const STATUS_STYLES: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
};

export default function BillsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [bills, setBills] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterSeries, setFilterSeries] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await billService.list({
        page,
        size: 20,
        series: filterSeries || undefined,
        payment_status: filterStatus || undefined,
      });
      setBills(res.data);
      setTotal(res.total);
    } catch {
      showToast("Failed to load bills", "error");
    } finally {
      setLoading(false);
    }
  }, [page, filterSeries, filterStatus, showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bills</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} bills total</p>
        </div>
        <button
          onClick={() => router.push("/bills/new")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + New Bill
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterSeries}
          onChange={e => { setFilterSeries(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Series</option>
          {["A", "B", "C", "D"].map(s => (
            <option key={s} value={s}>Series {s}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Bill #", "Order #", "Party", "Date", "Amount Due", "Paid", "Outstanding", "Status", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">No bills found</td>
              </tr>
            ) : bills.map(bill => (
              <tr key={bill.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/bills/${bill.id}`)}>
                <td className="px-4 py-3 font-semibold text-blue-600">{bill.bill_number}</td>
                <td className="px-4 py-3 text-gray-600">{bill.order_number}</td>
                <td className="px-4 py-3 text-gray-700">{bill.party_name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{bill.bill_date}</td>
                <td className="px-4 py-3 font-medium">PKR {Number(bill.amount_due).toLocaleString()}</td>
                <td className="px-4 py-3 text-green-700">PKR {Number(bill.amount_paid).toLocaleString()}</td>
                <td className="px-4 py-3 text-red-700">PKR {Number(bill.amount_outstanding).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[bill.payment_status]}`}>
                    {bill.payment_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={e => { e.stopPropagation(); router.push(`/bills/${bill.id}`); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-end gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">← Prev</button>
          <span className="px-3 py-1.5 text-sm text-gray-600">Page {page}</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
