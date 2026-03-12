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
  const [editProduct, setEditProduct] = useState<Product | null>(null);

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
                  <div
                    key={p.id}
                    className={`relative group flex items-center gap-3 px-4 py-3 transition-colors border-l-2 ${
                      selected?.id === p.id
                        ? "bg-blue-50 border-blue-600"
                        : "hover:bg-gray-50 border-transparent"
                    }`}
                  >
                    <button
                      onClick={() => setSelected(p)}
                      className="flex items-center gap-3 flex-1 text-left min-w-0"
                    >
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                        {p.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{p.description}</p>
                        )}
                        <div className="flex gap-3 mt-1.5">
                          <span className="text-xs text-blue-600 font-medium">{stitchCount} stitching</span>
                          <span className="text-xs text-purple-600 font-medium">{packCount} packing</span>
                        </div>
                      </div>
                    </button>
                    {/* Edit button — visible on hover */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditProduct(p); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex-shrink-0"
                      title="Edit product"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
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
      <Sheet open={addSheet} onClose={() => setAddSheet(false)} title="New Product Template">
        <ProductForm
          onSuccess={() => { setAddSheet(false); loadProducts(); }}
          onCancel={() => setAddSheet(false)}
        />
      </Sheet>

      {/* Edit Product sheet */}
      <Sheet open={!!editProduct} onClose={() => setEditProduct(null)} title="Edit Product">
        {editProduct && (
          <ProductForm
            initialData={editProduct}
            onSuccess={() => { setEditProduct(null); loadProducts(); }}
            onCancel={() => setEditProduct(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

// ─── ImageDropZone ────────────────────────────────────────────────────────────

function ImageDropZone({
  value,
  onChange,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // Compress: draw onto canvas at max 400px width
      const img = new window.Image();
      img.onload = () => {
        const MAX = 400;
        const scale = img.width > MAX ? MAX / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        onChange(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  return (
    <div>
      {value ? (
        <div className="relative group">
          <img
            src={value}
            alt="Product"
            className="w-full h-40 object-contain rounded-lg border border-gray-200 bg-gray-50"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`w-full h-32 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
            dragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-50 hover:bg-gray-100"
          }`}
        >
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-xs text-gray-500">Drag image here or <span className="text-blue-600 font-medium">click to browse</span></p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
      />
    </div>
  );
}

// ─── ProductForm — used inside the Sheet ─────────────────────────────────────

function ProductForm({
  initialData,
  onSuccess,
  onCancel,
}: {
  initialData?: Product;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initialData?.image_url ?? "");
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!initialData;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await productService.updateProduct(initialData.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          image_url: imageUrl || undefined,
        });
        showToast("Product updated");
      } else {
        await productService.createProduct({
          name: name.trim(),
          description: description.trim() || undefined,
          image_url: imageUrl || undefined,
        });
        showToast("Product created");
      }
      onSuccess();
    } catch {
      showToast(isEdit ? "Failed to update product" : "Failed to create product", "error");
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

      <FormField label="Product Image">
        <ImageDropZone value={imageUrl} onChange={setImageUrl} />
      </FormField>

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={submitting} className="flex-1 justify-center">
          {isEdit ? "Update Product" : "Create Product"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
