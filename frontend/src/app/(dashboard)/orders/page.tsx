"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Upload, Download, X } from "lucide-react";
import { ordersService, partiesService, billService } from "@/hooks/services";
import { formatDate, ALL_STATUSES, getStatusConfig } from "@/hooks/utils";
import { PageHeader, Sheet } from "@/components/common";
import { OrderForm } from "@/components/orders";
import type { Order, Party, OrderFilters, OrderStatus, PaginatedResponse } from "@/hooks/types";
import type { Bill } from "@/hooks/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

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

// ─── Bulk Import Dialog ───────────────────────────────────────────────────────

interface BulkImportResult {
  created: number;
  errors: Array<{ row: number; message: string }>;
}

function BulkImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setResult(null);
      setDragOver(false);
    }
  }, [open]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Import Orders</DialogTitle>
          <DialogDescription>
            Upload a CSV file to create multiple orders at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/60 rounded-lg border">
            <p className="text-sm font-medium text-foreground">Download template first</p>
            <Button variant="secondary" size="sm" onClick={downloadCsvTemplate}>
              <Download /> Template
            </Button>
          </div>

          {!result && (
            <div
              className={cn(
                "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                dragOver && "border-primary bg-primary/5",
                !dragOver && selectedFile && "border-emerald-500 bg-emerald-50",
                !dragOver && !selectedFile && "border-border bg-muted/30 hover:border-primary hover:bg-primary/5",
              )}
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
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
              />
              {selectedFile ? (
                <p className="text-sm font-semibold text-emerald-700">
                  {selectedFile.name} — Click to change
                </p>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">
                  Drag & drop CSV or click to browse
                </p>
              )}
            </div>
          )}

          {result && (
            <div className={cn(
              "rounded-lg border p-4",
              result.errors.length === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200",
            )}>
              <p className="text-sm font-semibold text-foreground">
                {result.created > 0 ? `${result.created} order(s) created` : "No orders were created"}
              </p>
              {result.errors.length > 0 && result.errors.map((err, i) => (
                <p key={i} className="text-xs text-destructive mt-1">Row {err.row}: {err.message}</p>
              ))}
              <button
                onClick={() => { setSelectedFile(null); setResult(null); }}
                className="text-xs text-primary underline mt-2"
              >
                Import another
              </button>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {result?.created ? "Done" : "Cancel"}
          </DialogClose>
          {!result && (
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? "Importing…" : "Upload & Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

const ALL_VALUE = "__all__";

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
        <span className="font-semibold text-primary">
          {row.order_number}
          {row.sub_suffix && <span className="ml-1.5 text-xs font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{row.sub_suffix}</span>}
        </span>
      ),
    },
    {
      key: "lot_number",
      header: "Lot #",
      render: (row) => <span className="text-muted-foreground text-xs">{row.lot_number ? `Lot #${row.lot_number}` : "—"}</span>,
    },
    {
      key: "party_name",
      header: "Party",
      render: (row) => <span>{row.party_name ?? row.party_reference ?? "—"}</span>,
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
        <span className={row.delivery_date && new Date(row.delivery_date) < new Date() && row.status !== "dispatched" ? "text-destructive" : "text-muted-foreground"}>
          {formatDate(row.delivery_date)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button
          variant="link"
          size="xs"
          onClick={(e) => { e.stopPropagation(); router.push(`/orders/${row.id}`); }}
        >
          View
        </Button>
      ),
    },
  ];

  const hasActiveFilters = Boolean(
    partyFilter || searchFilter || filters.status || filters.date_from || filters.date_to || filters.search
  );

  const searchValue = view === "bills" ? searchFilter : (filters.search ?? "");
  const onSearchChange = (v: string) => {
    if (view === "bills") setSearchFilter(v);
    else handleFilterChange({ search: v || undefined });
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={view === "bills" ? `${billsTotal} bills` : `${result.total} orders`}
        action={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="inline-flex rounded-lg border bg-background p-0.5 text-sm">
              <button
                onClick={() => setView("bills")}
                className={cn(
                  "px-3 py-1 rounded-md font-medium transition-colors",
                  view === "bills" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Bill Book
              </button>
              <button
                onClick={() => setView("orders")}
                className={cn(
                  "px-3 py-1 rounded-md font-medium transition-colors",
                  view === "orders" ? "bg-[#1a2744] text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Orders
              </button>
            </div>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload /> Import CSV
            </Button>
            <Button onClick={() => setSheetOpen(true)}>
              <Plus /> New Order
            </Button>
          </div>
        }
      />

      {/* Toolbar — borderless strip, consistent gap-3 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Order #, goods, party, bill…"
            className="pl-8"
          />
        </div>

        <Select
          value={partyFilter || ALL_VALUE}
          onValueChange={(v: string | null) => {
            const next = !v || v === ALL_VALUE ? "" : v;
            setPartyFilter(next);
            if (view === "orders") handleFilterChange({ party_id: next || undefined });
            setBillsPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All parties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All parties</SelectItem>
            {parties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {view === "orders" && (
          <>
            <Select
              value={filters.status ?? ALL_VALUE}
              onValueChange={(v: string | null) => {
                const next = !v || v === ALL_VALUE ? undefined : (v as OrderStatus);
                handleFilterChange({ status: next });
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{getStatusConfig(s).label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-36"
                value={filters.date_from ?? ""}
                onChange={(e) => handleFilterChange({ date_from: e.target.value || undefined })}
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="date"
                className="w-36"
                value={filters.date_to ?? ""}
                onChange={(e) => handleFilterChange({ date_to: e.target.value || undefined })}
              />
            </div>
          </>
        )}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => { setFilters({ page: 1, size: 20 }); setPartyFilter(""); setSearchFilter(""); setBillsPage(1); }}
          >
            <X /> Clear all
          </Button>
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

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => { loadOrders(filters); loadBills(billsPage, partyFilter); }}
      />
    </div>
  );
}
