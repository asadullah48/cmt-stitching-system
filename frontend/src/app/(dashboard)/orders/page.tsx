"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ordersService, partiesService, billService } from "@/hooks/services";
import { formatDate, ALL_STATUSES, getStatusConfig } from "@/hooks/utils";
import {
  PageHeader, Button, DataTable, StatusBadge,
  Sheet, Pagination, Select, Input, SearchInput,
} from "@/components/common";
import { OrderForm } from "@/components/orders";
import type { Order, Party, OrderFilters, OrderStatus, PaginatedResponse } from "@/hooks/types";
import type { Column } from "@/components/common";
import type { Bill } from "@/hooks/services";

// ─── CSV Template ─────────────────────────────────────────────────────────────

const CSV_HEADERS = "party_name,goods_description,total_quantity,stitch_rate_party,stitch_rate_labor,pack_rate_party,pack_rate_labor,entry_date";
const CSV_EXAMPLE = "Asad Kapra,Shirts,500,15,10,5,3,2025-02-10";

function downloadCsvTemplate() {
  const content = `${CSV_HEADERS}\n${CSV_EXAMPLE}\n`;
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cmt_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Bulk Import Modal ────────────────────────────────────────────────────────

interface BulkImportResult {
  created: number;
  errors: Array<{ row: number; message: string }>;
}

function BulkImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith(".csv")) { alert("Please select a .csv file"); return; }
    setSelectedFile(file);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const res = await ordersService.bulkImport(selectedFile);
      setResult(res);
      if (res.created > 0) onSuccess();
    } catch {
      setResult({ created: 0, errors: [{ row: 0, message: "Upload failed. Please check your file and try again." }] });
    } finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Bulk Import Orders</h2>
            <p className="text-xs text-gray-500 mt-0.5">Upload a CSV file to create multiple orders at once</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-sm font-medium text-blue-800">Download template first</p>
            <button onClick={downloadCsvTemplate} className="flex-shrink-0 ml-3 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Template</button>
          </div>
          {!result && (
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : selectedFile ? "border-green-400 bg-green-50" : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
              {selectedFile ? (
                <p className="text-sm font-semibold text-green-700">{selectedFile.name} — Click to change</p>
              ) : (
                <p className="text-sm font-medium text-gray-600">Drag & drop CSV or click to browse</p>
              )}
            </div>
          )}
          {result && (
            <div className={`rounded-xl border p-4 ${result.errors.length === 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
              <p className="text-sm font-semibold text-gray-800">{result.created > 0 ? `${result.created} order(s) created` : "No orders were created"}</p>
              {result.errors.length > 0 && result.errors.map((err, i) => <p key={i} className="text-xs text-red-600 mt-1">Row {err.row}: {err.message}</p>)}
              <button onClick={() => { setSelectedFile(null); setResult(null); }} className="text-xs text-blue-600 underline mt-2">Import another</button>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">{result?.created ? "Done" : "Cancel"}</button>
          {!result && (
            <button onClick={handleUpload} disabled={!selectedFile || uploading} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {uploading ? "Importing…" : "Upload & Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bills View ───────────────────────────────────────────────────────────────

const SERIES_BADGE: Record<string, string> = {
  A: "bg-blue-100 text-blue-700",
  B: "bg-purple-100 text-purple-700",
  C: "bg-orange-100 text-orange-700",
};

const SERIES_ORDER: Record<string, number> = { B: 0, A: 1, C: 2 };

function billSortKey(b: Bill) {
  return (SERIES_ORDER[b.bill_series] ?? 9) * 10000 + b.bill_sequence;
}

function ExtrasCell({ bill }: { bill: Bill }) {
  if (bill.bill_series !== "B") return null;
  const accQty = Number(bill.accessories_qty ?? 0);
  const orderQty = Number(bill.order_total_quantity ?? 0);
  if (!accQty) return <span className="text-gray-400 text-xs">—</span>;
  const extras = accQty - orderQty;
  if (extras > 0) return <span className="text-green-600 font-semibold text-xs">+{extras.toLocaleString()} EXTRA</span>;
  if (extras === 0) return <span className="text-gray-500 text-xs font-medium">CONSUMED</span>;
  return <span className="text-orange-600 text-xs">SHORT {Math.abs(extras)}</span>;
}

function BillsTable({ bills, router, loading }: { bills: Bill[]; router: ReturnType<typeof useRouter>; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{["Order #", "Lot #", "Party", "Goods", "Qty", "Status", "Delivery", "Bill #"].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                {Array.from({ length: 8 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Group bills by order_number, preserving first-seen order
  const orderNums: string[] = [];
  const grouped: Record<string, Bill[]> = {};
  for (const b of bills) {
    const key = b.order_number ?? b.id;
    if (!grouped[key]) { grouped[key] = []; orderNums.push(key); }
    grouped[key].push(b);
  }
  // Sort bills within each order: B → A → C
  for (const key of orderNums) grouped[key].sort((a, b) => billSortKey(a) - billSortKey(b));

  if (orderNums.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
        No bills found
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
          <tr>
            {["Order #", "Lot #", "Party", "Goods", "Qty", "Status", "Delivery", "Bill #"].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orderNums.map((orderNum, groupIdx) => {
            const groupBills = grouped[orderNum];
            const isEven = groupIdx % 2 === 0;
            return groupBills.map((bill, rowIdx) => {
              const isFirst = rowIdx === 0;
              const isLast = rowIdx === groupBills.length - 1;
              const qty = bill.bill_series === "B"
                ? Number(bill.accessories_qty ?? 0)
                : Number(bill.order_total_quantity ?? 0);
              const goods = bill.bill_series === "B"
                ? (bill.notes || "Accessories")
                : bill.bill_series === "C"
                  ? `Packing — ${bill.goods_description ?? ""}`
                  : (bill.goods_description ?? "—");

              return (
                <tr
                  key={bill.id}
                  className={`cursor-pointer transition-colors hover:bg-blue-50 ${isEven ? "bg-white" : "bg-gray-50/40"} ${isLast ? "border-b-2 border-gray-200" : "border-b border-gray-100"}`}
                  onClick={() => router.push(`/bills/${bill.id}`)}
                >
                  {/* Order # — only show on first row of group */}
                  <td className="px-4 py-2.5">
                    {isFirst ? (
                      <span className="font-semibold text-[#1a2744] text-xs">{orderNum}</span>
                    ) : (
                      <span className="text-gray-300 text-xs pl-2">↳</span>
                    )}
                  </td>
                  {/* Lot # */}
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {bill.lot_number != null ? `Lot #${bill.lot_number}${bill.sub_suffix ?? ""}` : "—"}
                  </td>
                  {/* Party */}
                  <td className="px-4 py-2.5 text-gray-700 text-xs">{bill.party_name ?? "—"}</td>
                  {/* Goods */}
                  <td className="px-4 py-2.5 max-w-[220px]">
                    <span className="block truncate text-gray-800 text-xs">{goods}</span>
                  </td>
                  {/* Qty */}
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 text-xs">
                    {qty > 0 ? qty.toLocaleString() : "—"}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-2.5">
                    {bill.bill_series === "B" ? (
                      <ExtrasCell bill={bill} />
                    ) : (
                      <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        Delivered
                      </span>
                    )}
                  </td>
                  {/* Delivery */}
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {bill.delivery_date ? formatDate(bill.delivery_date) : "—"}
                  </td>
                  {/* Bill # */}
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${SERIES_BADGE[bill.bill_series] ?? "bg-gray-100 text-gray-600"}`}>
                      {bill.bill_number}
                    </span>
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter();

  const [view, setView] = useState<"bills" | "orders">("bills");
  const [result, setResult] = useState<PaginatedResponse<Order>>({ data: [], total: 0, page: 1, size: 20 });
  const [bills, setBills] = useState<Bill[]>([]);
  const [billsTotal, setBillsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OrderFilters>({ page: 1, size: 20 });
  const [billsPage, setBillsPage] = useState(1);
  const [parties, setParties] = useState<Party[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [partyFilter, setPartyFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  const loadOrders = useCallback(async (f: OrderFilters) => {
    setLoading(true);
    try {
      const data = await ordersService.getOrders(f);
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBills = useCallback(async (page: number, party_id?: string) => {
    setLoading(true);
    try {
      const res = await billService.list({
        size: 50,
        page,
        party_id: party_id || undefined,
      });
      setBills(res.data);
      setBillsTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    partiesService.getParties(1, 100).then((r) => setParties(r.data));
  }, []);

  useEffect(() => {
    if (view === "orders") loadOrders(filters);
    else loadBills(billsPage, partyFilter);
  }, [view, filters, billsPage, partyFilter, loadOrders, loadBills]);

  const handleFilterChange = (patch: Partial<OrderFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  };

  // Filter bills client-side by search
  const visibleBills = searchFilter
    ? bills.filter((b) =>
        (b.order_number ?? "").toLowerCase().includes(searchFilter.toLowerCase()) ||
        (b.party_name ?? "").toLowerCase().includes(searchFilter.toLowerCase()) ||
        (b.goods_description ?? "").toLowerCase().includes(searchFilter.toLowerCase()) ||
        (b.bill_number ?? "").toLowerCase().includes(searchFilter.toLowerCase()) ||
        (b.notes ?? "").toLowerCase().includes(searchFilter.toLowerCase())
      )
    : bills;

  const columns: Column<Order>[] = [
    {
      key: "order_number",
      header: "Order #",
      render: (row) => (
        <span className="font-semibold text-blue-600">
          {row.order_number}
          {row.sub_suffix && <span className="ml-1.5 text-xs font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{row.sub_suffix}</span>}
        </span>
      ),
    },
    {
      key: "lot_number",
      header: "Lot #",
      render: (row) => <span className="text-gray-500 text-xs">{row.lot_number ? `Lot #${row.lot_number}` : "—"}</span>,
    },
    {
      key: "party_name",
      header: "Party",
      render: (row) => <span className="text-gray-700">{row.party_name ?? row.party_reference ?? "—"}</span>,
    },
    {
      key: "goods_description",
      header: "Goods",
      render: (row) => <span className="block max-w-[200px] truncate">{row.goods_description}</span>,
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
        <button onClick={(e) => { e.stopPropagation(); router.push(`/orders/${row.id}`); }} className="text-xs text-blue-600 hover:underline font-medium">
          View
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={view === "bills" ? `${billsTotal} bills` : `${result.total} orders`}
        action={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
              <button
                onClick={() => setView("bills")}
                className={`px-3 py-1.5 transition-colors ${view === "bills" ? "bg-[#1a2744] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                Bill Book
              </button>
              <button
                onClick={() => setView("orders")}
                className={`px-3 py-1.5 transition-colors ${view === "orders" ? "bg-[#1a2744] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                Orders
              </button>
            </div>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Bulk Import
            </button>
            <Button onClick={() => setSheetOpen(true)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Order
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={view === "bills" ? searchFilter : (filters.search ?? "")}
          onChange={(v) => {
            if (view === "bills") setSearchFilter(v);
            else handleFilterChange({ search: v || undefined });
          }}
          placeholder="Order #, goods, party, bill…"
          className="w-56"
        />

        <Select
          className="w-44"
          value={partyFilter}
          onChange={(e) => {
            setPartyFilter(e.target.value);
            if (view === "orders") handleFilterChange({ party_id: e.target.value || undefined });
            setBillsPage(1);
          }}
        >
          <option value="">All parties</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>

        {view === "orders" && (
          <>
            <Select
              className="w-44"
              value={filters.status ?? ""}
              onChange={(e) => handleFilterChange({ status: (e.target.value as OrderStatus) || undefined })}
            >
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{getStatusConfig(s).label}</option>
              ))}
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" className="w-36" value={filters.date_from ?? ""} onChange={(e) => handleFilterChange({ date_from: e.target.value || undefined })} />
              <span className="text-gray-400 text-sm">–</span>
              <Input type="date" className="w-36" value={filters.date_to ?? ""} onChange={(e) => handleFilterChange({ date_to: e.target.value || undefined })} />
            </div>
          </>
        )}

        {(partyFilter || searchFilter || filters.status || filters.date_from || filters.date_to || filters.search) && (
          <button
            onClick={() => { setFilters({ page: 1, size: 20 }); setPartyFilter(""); setSearchFilter(""); setBillsPage(1); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-auto"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Table */}
      {view === "bills" ? (
        <>
          <BillsTable bills={visibleBills} router={router} loading={loading} />
          <Pagination
            total={billsTotal}
            page={billsPage}
            size={50}
            onChange={setBillsPage}
          />
        </>
      ) : (
        <>
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
        </>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New Order" width="w-[580px]">
        <OrderForm
          parties={parties}
          onSuccess={(order) => { setSheetOpen(false); router.push(`/orders/${order.id}`); }}
          onCancel={() => setSheetOpen(false)}
        />
      </Sheet>

      {importOpen && (
        <BulkImportModal
          onClose={() => setImportOpen(false)}
          onSuccess={() => { loadOrders(filters); loadBills(billsPage, partyFilter); }}
        />
      )}
    </div>
  );
}
