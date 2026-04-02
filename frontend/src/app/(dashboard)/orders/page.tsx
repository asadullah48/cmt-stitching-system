"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ordersService, partiesService } from "@/hooks/services";
import { formatDate, ALL_STATUSES, getStatusConfig } from "@/hooks/utils";
import {
  PageHeader, Button, DataTable, StatusBadge,
  Sheet, Pagination, Select, Input, SearchInput,
} from "@/components/common";
import { OrderForm } from "@/components/orders";
import type { Order, Party, OrderFilters, OrderStatus, PaginatedResponse } from "@/hooks/types";
import type { Column } from "@/components/common";

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
    if (!file.name.endsWith(".csv")) {
      alert("Please select a .csv file");
      return;
    }
    setSelectedFile(file);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Bulk Import Orders</h2>
            <p className="text-xs text-gray-500 mt-0.5">Upload a CSV file to create multiple orders at once</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Template Download */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
            <div>
              <p className="text-sm font-medium text-blue-800">Download template first</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Headers: party_name, goods_description, total_quantity, stitch_rate_party, stitch_rate_labor, pack_rate_party, pack_rate_labor, entry_date
              </p>
            </div>
            <button
              onClick={downloadCsvTemplate}
              className="flex-shrink-0 flex items-center gap-1.5 ml-3 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Template
            </button>
          </div>

          {/* Drag & Drop Zone */}
          {!result && (
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-blue-400 bg-blue-50"
                  : selectedFile
                  ? "border-green-400 bg-green-50"
                  : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleInputChange}
              />
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-semibold text-green-700">{selectedFile.name}</p>
                  <p className="text-xs text-green-600">{(selectedFile.size / 1024).toFixed(1)} KB — Click to change</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-medium text-gray-600">
                    {dragOver ? "Drop your CSV file here" : "Drag & drop your CSV file here"}
                  </p>
                  <p className="text-xs text-gray-400">or click to browse — .csv files only</p>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className={`rounded-xl border p-4 space-y-3 ${result.errors.length === 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-center gap-2">
                {result.created > 0 ? (
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <p className="text-sm font-semibold text-gray-800">
                  {result.created > 0
                    ? `${result.created} order${result.created === 1 ? "" : "s"} created successfully`
                    : "No orders were created"}
                </p>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-red-700">{result.errors.length} row(s) had errors:</p>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50 border-b border-red-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 text-left text-red-600 font-semibold">Row</th>
                          <th className="px-3 py-1.5 text-left text-red-600 font-semibold">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50">
                        {result.errors.map((err, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-red-700 font-medium tabular-nums">{err.row === 0 ? "—" : err.row}</td>
                            <td className="px-3 py-1.5 text-red-600">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button
                onClick={handleReset}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
              >
                Import another file
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
          >
            {result?.created ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Importing…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Upload & Import
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const router = useRouter();

  const [result, setResult] = useState<PaginatedResponse<Order>>({
    data: [], total: 0, page: 1, size: 20,
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OrderFilters>({ page: 1, size: 20 });
  const [parties, setParties] = useState<Party[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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
    partiesService.getParties(1, 100).then((r) => setParties(r.data));
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
        <span className="font-semibold text-blue-600">
          {row.order_number}
          {row.sub_suffix && (
            <span className="ml-1.5 text-xs font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
              {row.sub_suffix}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "lot_number",
      header: "Lot #",
      render: (row) => (
        <span className="text-gray-500 text-xs">
          {row.lot_number ? `Lot #${row.lot_number}` : "—"}
        </span>
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
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
          value={filters.search ?? ""}
          onChange={(v) => handleFilterChange({ search: v || undefined })}
          placeholder="Order #, goods, party…"
          className="w-56"
        />

        <Select
          className="w-44"
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
          className="w-44"
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

        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-36"
            value={filters.date_from ?? ""}
            onChange={(e) => handleFilterChange({ date_from: e.target.value || undefined })}
          />
          <span className="text-gray-400 text-sm">–</span>
          <Input
            type="date"
            className="w-36"
            value={filters.date_to ?? ""}
            onChange={(e) => handleFilterChange({ date_to: e.target.value || undefined })}
          />
        </div>

        {(filters.status || filters.party_id || filters.date_from || filters.date_to || filters.search) && (
          <button
            onClick={() => setFilters({ page: 1, size: 20 })}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-auto"
          >
            Clear all
          </button>
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

      {importOpen && (
        <BulkImportModal
          onClose={() => setImportOpen(false)}
          onSuccess={() => load(filters)}
        />
      )}
    </div>
  );
}
