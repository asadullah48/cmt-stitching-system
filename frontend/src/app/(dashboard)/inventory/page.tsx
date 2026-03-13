"use client";

import React, { useState, useEffect, useCallback } from "react";
import { inventoryService } from "@/hooks/services";
import { formatCurrency } from "@/hooks/utils";
import { useToast } from "@/hooks/toast";
import { Button, FormField, Input, Select, Sheet, Spinner, ConfirmDialog } from "@/components/common";
import type {
  InventoryItem,
  InventoryCategory,
  InventoryItemCreate,
  ItemCondition,
  CategoryType,
} from "@/hooks/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONDITIONS: { value: ItemCondition; label: string; color: string }[] = [
  { value: "good", label: "Good", color: "bg-green-50 text-green-700" },
  { value: "damaged", label: "Damaged", color: "bg-orange-50 text-orange-700" },
  { value: "expired", label: "Expired", color: "bg-red-50 text-red-700" },
];

const UNITS = ["pcs", "meters", "kg", "liters", "rolls", "boxes", "pairs", "dozens", "yards"];

function conditionStyle(c: string) {
  return CONDITIONS.find((x) => x.value === c)?.color ?? "bg-gray-100 text-gray-600";
}

function conditionLabel(c: string) {
  return CONDITIONS.find((x) => x.value === c)?.label ?? c;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { showToast } = useToast();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [filterTab, setFilterTab] = useState<"all" | CategoryType>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Quick stock check
  const [quickQuery, setQuickQuery] = useState("");
  const [quickResults, setQuickResults] = useState<InventoryItem[]>([]);
  const [quickLoading, setQuickLoading] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);

  const [addSheet, setAddSheet] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce table search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Quick stock check — debounced fetch
  useEffect(() => {
    if (!quickQuery.trim()) { setQuickResults([]); return; }
    const t = setTimeout(async () => {
      setQuickLoading(true);
      try {
        const res = await inventoryService.getItems({ size: 20, search: quickQuery.trim() });
        setQuickResults(res.data);
      } catch { /* ignore */ } finally {
        setQuickLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [quickQuery]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [res, cats] = await Promise.all([
        inventoryService.getItems({
          size: 200,
          category_type: filterTab !== "all" ? filterTab : undefined,
          search: debouncedSearch || undefined,
        }),
        inventoryService.getCategories(),
      ]);
      setItems(res.data);
      setTotal(res.total);
      setCategories(cats);
    } catch {
      showToast("Failed to load inventory", "error");
    } finally {
      setLoading(false);
    }
  }, [filterTab, debouncedSearch, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // KPIs
  const totalItems = total;
  const lowStockItems = items.filter(
    (i) => Number(i.current_stock) <= Number(i.minimum_stock) && Number(i.minimum_stock) > 0
  ).length;
  const totalValue = items.reduce(
    (s, i) => s + Number(i.current_stock) * Number(i.cost_per_unit ?? 0),
    0
  );
  const outOfStock = items.filter((i) => Number(i.current_stock) === 0).length;

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      await inventoryService.deleteItem(deleteItem.id);
      showToast("Item deleted");
      setDeleteItem(null);
      loadData();
    } catch {
      showToast("Failed to delete item", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Stock, materials and supplies management</p>
        </div>
        <Button onClick={() => setAddSheet(true)}>+ Add Item</Button>
      </div>

      {/* Quick Stock Check */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3 mb-3">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            type="text"
            placeholder="Quick stock check — type an item name, e.g. zip, thread, foam..."
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            className="flex-1 text-sm border-0 outline-none bg-transparent placeholder-gray-400 text-gray-800"
          />
          {quickQuery && (
            <button onClick={() => setQuickQuery("")} className="text-gray-400 hover:text-gray-600 text-xs">✕ Clear</button>
          )}
        </div>

        {quickQuery.trim() && (
          <div className="border-t border-gray-100 pt-3">
            {quickLoading ? (
              <p className="text-sm text-gray-400 text-center py-3">Searching…</p>
            ) : quickResults.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">No items found for &quot;{quickQuery}&quot;</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {quickResults.map((item) => {
                  const stock = Number(item.current_stock);
                  const minStock = Number(item.minimum_stock);
                  const isOut = stock === 0;
                  const isLow = !isOut && minStock > 0 && stock <= minStock;
                  return (
                    <div key={item.id} className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${
                      isOut ? "border-red-200 bg-red-50" : isLow ? "border-orange-200 bg-orange-50" : "border-green-200 bg-green-50"
                    }`}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                        {item.category_name && <p className="text-xs text-gray-500">{item.category_name}</p>}
                        {item.location && <p className="text-xs text-gray-400">{item.location}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className={`text-xl font-bold tabular-nums ${isOut ? "text-red-600" : isLow ? "text-orange-600" : "text-green-700"}`}>
                            {stock.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">{item.unit}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            isOut ? "bg-red-100 text-red-700" : isLow ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
                          }`}>
                            {isOut ? "OUT" : isLow ? "LOW" : "OK"}
                          </span>
                          <button
                            onClick={() => setAdjustItem(item)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Adjust
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Items"
          value={totalItems}
          icon={<BoxIcon />}
          color="blue"
        />
        <KpiCard
          label="Low Stock"
          value={lowStockItems}
          icon={<WarningIcon />}
          color={lowStockItems > 0 ? "orange" : "green"}
          sub={lowStockItems > 0 ? "Needs restocking" : "All stocked"}
        />
        <KpiCard
          label="Out of Stock"
          value={outOfStock}
          icon={<EmptyBoxIcon />}
          color={outOfStock > 0 ? "red" : "green"}
        />
        <KpiCard
          label="Stock Value"
          value={`PKR ${formatCurrency(totalValue)}`}
          icon={<ValueIcon />}
          color="purple"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-100">
          {([
            { key: "all", label: "All Items" },
            { key: "raw_material", label: "Raw Materials" },
            { key: "finished_goods", label: "Finished Goods" },
            { key: "accessories", label: "Accessories" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                filterTab === tab.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto pb-3">
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-52 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="w-6 h-6" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <BoxIcon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium">No inventory items found</p>
            <p className="text-xs mt-1">Add your first item to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock In Hand</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Min Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Condition</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost/Unit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const stock = Number(item.current_stock);
                  const minStock = Number(item.minimum_stock);
                  const isLow = minStock > 0 && stock <= minStock;
                  const isOut = stock === 0;
                  const stockValue = stock * Number(item.cost_per_unit ?? 0);

                  return (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {(isOut || isLow) && (
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOut ? "bg-red-500" : "bg-orange-400"}`} />
                          )}
                          <span className="font-medium text-gray-900">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.sku ?? "—"}</td>
                      <td className="px-4 py-3">
                        {item.category_name ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                            {item.category_name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold tabular-nums ${isOut ? "text-red-600" : isLow ? "text-orange-600" : "text-gray-900"}`}>
                          {stock.toLocaleString()}
                        </span>
                        {isOut && <span className="ml-1.5 text-xs text-red-500 font-medium">OUT</span>}
                        {isLow && !isOut && <span className="ml-1.5 text-xs text-orange-500 font-medium">LOW</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">{minStock > 0 ? minStock.toLocaleString() : "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{item.location ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${conditionStyle(item.condition)}`}>
                          {conditionLabel(item.condition)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {item.cost_per_unit != null ? `PKR ${formatCurrency(item.cost_per_unit)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {item.cost_per_unit != null ? `PKR ${formatCurrency(stockValue)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setAdjustItem(item)}
                            className="text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium transition-colors"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => setEditItem(item)}
                            className="text-xs px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteItem(item)}
                            className="text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
            Showing {items.length} of {total} items
          </div>
        )}
      </div>

      {/* Add Sheet */}
      <Sheet open={addSheet} onClose={() => setAddSheet(false)} title="Add Inventory Item">
        <ItemForm
          categories={categories}
          onSuccess={() => { setAddSheet(false); loadData(); }}
          onCancel={() => setAddSheet(false)}
        />
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={!!editItem} onClose={() => setEditItem(null)} title="Edit Inventory Item">
        {editItem && (
          <ItemForm
            categories={categories}
            initialData={editItem}
            itemId={editItem.id}
            onSuccess={() => { setEditItem(null); loadData(); }}
            onCancel={() => setEditItem(null)}
          />
        )}
      </Sheet>

      {/* Adjust Stock Sheet */}
      <Sheet open={!!adjustItem} onClose={() => setAdjustItem(null)} title="Adjust Stock">
        {adjustItem && (
          <AdjustStockForm
            item={adjustItem}
            onSuccess={() => { setAdjustItem(null); loadData(); }}
            onCancel={() => setAdjustItem(null)}
          />
        )}
      </Sheet>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteItem}
        title="Delete Item"
        message={`Delete "${deleteItem?.name}"? This cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
      />
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  orange: "bg-orange-50 text-orange-600",
  green: "bg-green-50 text-green-600",
  red: "bg-red-50 text-red-600",
  purple: "bg-purple-50 text-purple-600",
};

function KpiCard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${COLOR_MAP[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Item Form ────────────────────────────────────────────────────────────────

interface ItemFormProps {
  categories: InventoryCategory[];
  initialData?: InventoryItem;
  itemId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function ItemForm({ categories, initialData, itemId, onSuccess, onCancel }: ItemFormProps) {
  const { showToast } = useToast();
  const [name, setName] = useState(initialData?.name ?? "");
  const [categoryId, setCategoryId] = useState(initialData?.category_id ?? "");
  const [sku, setSku] = useState(initialData?.sku ?? "");
  const [unit, setUnit] = useState(initialData?.unit ?? "pcs");
  const [currentStock, setCurrentStock] = useState(initialData?.current_stock?.toString() ?? "0");
  const [minStock, setMinStock] = useState(initialData?.minimum_stock?.toString() ?? "0");
  const [costPerUnit, setCostPerUnit] = useState(initialData?.cost_per_unit?.toString() ?? "");
  const [location, setLocation] = useState(initialData?.location ?? "");
  const [condition, setCondition] = useState<ItemCondition>(initialData?.condition ?? "good");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required.";
    if (!unit.trim()) e.unit = "Unit is required.";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);

    const payload: InventoryItemCreate = {
      name: name.trim(),
      category_id: categoryId || undefined,
      sku: sku.trim() || undefined,
      unit,
      current_stock: parseFloat(currentStock) || 0,
      minimum_stock: parseFloat(minStock) || 0,
      cost_per_unit: costPerUnit ? parseFloat(costPerUnit) : undefined,
      location: location.trim() || undefined,
      condition,
    };

    try {
      if (itemId) {
        await inventoryService.updateItem(itemId, payload);
        showToast("Item updated");
      } else {
        await inventoryService.createItem(payload);
        showToast("Item added");
      }
      onSuccess();
    } catch {
      showToast("Failed to save item", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Item Name" required error={errors.name}>
        <Input
          placeholder="e.g. Cotton Thread, White"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!!errors.name}
          autoFocus
        />
      </FormField>

      <FormField label="Category">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">— Select category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="SKU / Code">
          <Input placeholder="e.g. THR-WHT-001" value={sku} onChange={(e) => setSku(e.target.value)} />
        </FormField>
        <FormField label="Unit" required error={errors.unit}>
          <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            <option value="other">other</option>
          </Select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Stock In Hand">
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            value={currentStock}
            onChange={(e) => setCurrentStock(e.target.value)}
            disabled={!!itemId}
          />
          {itemId && <p className="text-xs text-gray-400 mt-1">Use &quot;Adjust Stock&quot; to change qty</p>}
        </FormField>
        <FormField label="Minimum Stock">
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Location">
          <Input placeholder="e.g. Rack A, Shelf 3" value={location} onChange={(e) => setLocation(e.target.value)} />
        </FormField>
        <FormField label="Condition">
          <Select value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)}>
            {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </FormField>
      </div>

      <FormField label="Cost per Unit (PKR)">
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={costPerUnit}
          onChange={(e) => setCostPerUnit(e.target.value)}
        />
      </FormField>

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1 justify-center">
          {itemId ? "Save Changes" : "Add Item"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ─── Adjust Stock Form ────────────────────────────────────────────────────────

function AdjustStockForm({
  item,
  onSuccess,
  onCancel,
}: {
  item: InventoryItem;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().split("T")[0]);
  const [orderNumber, setOrderNumber] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [partyRef, setPartyRef] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return;

    setLoading(true);
    try {
      await inventoryService.adjustStock(item.id, {
        quantity: mode === "in" ? qty : -qty,
        transaction_date: txDate,
        order_number: orderNumber.trim() || undefined,
        bill_number: billNumber.trim() || undefined,
        party_reference: partyRef.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      showToast(`Stock ${mode === "in" ? "added" : "removed"} successfully`);
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast(msg ?? "Failed to adjust stock", "error");
    } finally {
      setLoading(false);
    }
  };

  const newStock =
    quantity && !isNaN(parseFloat(quantity))
      ? Number(item.current_stock) + (mode === "in" ? parseFloat(quantity) : -parseFloat(quantity))
      : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm font-semibold text-gray-900">{item.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Current stock: <span className="font-semibold text-gray-800">{Number(item.current_stock).toLocaleString()} {item.unit}</span>
        </p>
        {item.location && <p className="text-xs text-gray-400 mt-0.5">Location: {item.location}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("in")}
          className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
            mode === "in"
              ? "bg-green-600 text-white border-green-600"
              : "bg-white text-gray-600 border-gray-200 hover:border-green-400"
          }`}
        >
          + Stock In (Purchase)
        </button>
        <button
          type="button"
          onClick={() => setMode("out")}
          className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
            mode === "out"
              ? "bg-orange-500 text-white border-orange-500"
              : "bg-white text-gray-600 border-gray-200 hover:border-orange-400"
          }`}
        >
          − Stock Out (Used)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={`Quantity (${item.unit})`}>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
          />
        </FormField>
        <FormField label="Date">
          <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
        </FormField>
      </div>

      {newStock !== null && (
        <div className={`rounded-lg px-3 py-2 text-sm ${newStock < 0 ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
          New stock: <span className="font-semibold">{newStock.toLocaleString()} {item.unit}</span>
          {newStock < 0 && " — insufficient stock"}
        </div>
      )}

      {/* References */}
      <div className="border-t border-gray-100 pt-3 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">References</p>
        <FormField label="Order # (e.g. ORD-202603-0002)">
          <Input
            placeholder="ORD-202603-0002"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
          />
        </FormField>
        {mode === "out" && (
          <FormField label="Bill # (e.g. A52)">
            <Input
              placeholder="A52"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
            />
          </FormField>
        )}
        <FormField label={mode === "in" ? "Supplier / Party" : "Used For (Party)"}>
          <Input
            placeholder={mode === "in" ? "e.g. Al-Rehman Zips" : "e.g. Shopinos"}
            value={partyRef}
            onChange={(e) => setPartyRef(e.target.value)}
          />
        </FormField>
        <FormField label="Notes (optional)">
          <Input placeholder="Additional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
      </div>

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1 justify-center" disabled={!quantity || (newStock !== null && newStock < 0)}>
          Confirm
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BoxIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function EmptyBoxIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

function ValueIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
