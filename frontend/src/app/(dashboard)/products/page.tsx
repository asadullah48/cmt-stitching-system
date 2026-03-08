"use client";

import React, { useState, useEffect, useCallback } from "react";
import { productService, inventoryService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { Button, FormField, Input, Select, Sheet, Spinner } from "@/components/common";
import type { Product, InventoryItem } from "@/hooks/types";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"stitching" | "packing">("stitching");
  const [addSheet, setAddSheet] = useState(false);

  // Add BOM form state
  const [bomItemId, setBomItemId] = useState("");
  const [bomQty, setBomQty] = useState("1");
  const [bomCovers, setBomCovers] = useState("1");
  const [bomNotes, setBomNotes] = useState("");
  const [addingBom, setAddingBom] = useState(false);

  // Load products and inventory items; keep selected product in sync after reload
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, inv] = await Promise.all([
        productService.getProducts(),
        inventoryService.getItems({ size: 200 }),
      ]);
      setProducts(prods);
      setInventoryItems(inv.data);
      // Re-sync selected product with latest data
      if (selected) {
        const updated = prods.find((p) => p.id === selected.id);
        setSelected(updated ?? null);
      }
    } catch {
      showToast("Failed to load products", "error");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, showToast]);

  // Initial load only — subsequent reloads called explicitly after mutations
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [prods, inv] = await Promise.all([
          productService.getProducts(),
          inventoryService.getItems({ size: 200 }),
        ]);
        setProducts(prods);
        setInventoryItems(inv.data);
      } catch {
        showToast("Failed to load products", "error");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddBOM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !bomItemId) return;
    setAddingBom(true);
    try {
      await productService.addBOMItem(selected.id, {
        inventory_item_id: bomItemId,
        material_quantity: parseFloat(bomQty) || 1,
        covers_quantity: parseFloat(bomCovers) || 1,
        department: activeTab,
        notes: bomNotes.trim() || undefined,
      });
      // Reset form
      setBomItemId("");
      setBomQty("1");
      setBomCovers("1");
      setBomNotes("");
      await loadProducts();
      showToast("Material added");
    } catch {
      showToast("Failed to add material", "error");
    } finally {
      setAddingBom(false);
    }
  };

  const handleDeleteBOM = async (bomId: string) => {
    if (!selected) return;
    try {
      await productService.deleteBOMItem(bomId);
      await loadProducts();
      showToast("Material removed");
    } catch {
      showToast("Failed to remove material", "error");
    }
  };

  // BOM items for the currently active tab
  const tabItems = selected?.bom_items.filter((b) => b.department === activeTab) ?? [];

  return (
    <div className="space-y-4">
      {/* Page header — dark navy card */}
      <div className="bg-[#1a2744] rounded-2xl px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Product Templates</h1>
          <p className="text-xs text-blue-300 mt-0.5">
            Define BOM recipes for stitching &amp; packing
          </p>
        </div>
        <Button
          onClick={() => setAddSheet(true)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          + New Product
        </Button>
      </div>

      {/* Two-column layout */}
      <div
        className="grid grid-cols-12 gap-4"
        style={{ minHeight: "calc(100vh - 200px)" }}
      >
        {/* ── Left: Product list (col-span-4) ────────────────────────────── */}
        <div className="col-span-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              Products
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{products.length} templates</p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner className="w-5 h-5" />
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <p className="text-xs font-medium text-gray-500">No products yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Create a product template to define its BOM
                </p>
              </div>
            ) : (
              products.map((p) => {
                const stitchCount = p.bom_items.filter(
                  (b) => b.department === "stitching"
                ).length;
                const packCount = p.bom_items.filter(
                  (b) => b.department === "packing"
                ).length;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selected?.id === p.id
                        ? "bg-blue-50 border-l-2 border-blue-600"
                        : "hover:bg-gray-50 border-l-2 border-transparent"
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {p.description}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1.5">
                      <span className="text-xs text-blue-600 font-medium">
                        {stitchCount} stitching
                      </span>
                      <span className="text-xs text-purple-600 font-medium">
                        {packCount} packing
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: BOM Builder (col-span-8) ────────────────────────────── */}
        <div className="col-span-8 flex flex-col gap-4">
          {!selected ? (
            /* Empty state when nothing is selected */
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-blue-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-700">
                Select a product to build its BOM
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Materials for stitching and packing will appear here
              </p>
            </div>
          ) : (
            /* BOM builder panel */
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col flex-1">
              {/* Product header + tab switcher */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">{selected.name}</h2>
                  {selected.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{selected.description}</p>
                  )}
                </div>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {(["stitching", "packing"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                        activeTab === tab
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {tab}
                      <span
                        className={`ml-1.5 text-xs font-bold ${
                          activeTab === tab ? "text-blue-600" : "text-gray-400"
                        }`}
                      >
                        (
                        {
                          selected.bom_items.filter((b) => b.department === tab)
                            .length
                        }
                        )
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* BOM table */}
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Material
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Qty
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Covers (pcs)
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Notes
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {tabItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-10 text-center text-xs text-gray-400"
                        >
                          No {activeTab} materials defined yet. Add one below.
                        </td>
                      </tr>
                    ) : (
                      tabItems.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                        >
                          <td className="px-4 py-3">
                            <span className="font-medium text-gray-900">
                              {item.inventory_item_name}
                            </span>
                            <span className="ml-1.5 text-xs text-gray-400">
                              {item.inventory_item_unit}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums text-gray-700">
                            {item.material_quantity}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums text-gray-700">
                            {item.covers_quantity}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {item.notes ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteBOM(item.id)}
                              className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add BOM item inline form */}
              <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
                  Add {activeTab} material
                </p>
                <form
                  onSubmit={handleAddBOM}
                  className="flex gap-3 items-end flex-wrap"
                >
                  {/* Inventory item dropdown — widest field */}
                  <div className="flex-1 min-w-[180px]">
                    <FormField label="Inventory Item" required>
                      <Select
                        value={bomItemId}
                        onChange={(e) => setBomItemId(e.target.value)}
                        required
                      >
                        <option value="">— Select item —</option>
                        {inventoryItems.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({i.unit})
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>

                  {/* Quantity */}
                  <div>
                    <FormField label="Quantity">
                      <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={bomQty}
                        onChange={(e) => setBomQty(e.target.value)}
                        className="w-24"
                      />
                    </FormField>
                  </div>

                  {/* Covers */}
                  <div>
                    <FormField label="Covers (pcs)">
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        value={bomCovers}
                        onChange={(e) => setBomCovers(e.target.value)}
                        className="w-28"
                      />
                    </FormField>
                  </div>

                  {/* Notes */}
                  <div>
                    <FormField label="Notes (optional)">
                      <Input
                        placeholder="e.g. 1 with foam"
                        value={bomNotes}
                        onChange={(e) => setBomNotes(e.target.value)}
                        className="w-44"
                      />
                    </FormField>
                  </div>

                  {/* Submit button — aligned to bottom of form row */}
                  <div className="pb-0.5">
                    <Button
                      type="submit"
                      loading={addingBom}
                      disabled={!bomItemId}
                    >
                      Add
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Product sheet */}
      <Sheet
        open={addSheet}
        onClose={() => setAddSheet(false)}
        title="New Product Template"
      >
        <ProductForm
          onSuccess={() => {
            setAddSheet(false);
            loadProducts();
          }}
          onCancel={() => setAddSheet(false)}
        />
      </Sheet>
    </div>
  );
}

// ─── ProductForm — used inside the Sheet ─────────────────────────────────────

function ProductForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await productService.createProduct({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      showToast("Product created");
      onSuccess();
    } catch {
      showToast("Failed to create product", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Product Name" required>
        <Input
          placeholder="e.g. Bedrail Navy"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </FormField>

      <FormField label="Description">
        <Input
          placeholder="Optional description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button
          type="submit"
          loading={submitting}
          className="flex-1 justify-center"
        >
          Create Product
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
