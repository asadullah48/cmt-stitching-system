"use client";

import React, { useState, useEffect } from "react";
import { ordersService, productService } from "@/hooks/services";
import { ALL_STATUSES, getStatusConfig, todayInputDate } from "@/hooks/utils";
import { useToast } from "@/hooks/toast";
import {
  Button, FormField, Input, Select, Textarea, StatusBadge,
} from "@/components/common";
import type {
  Order, OrderCreate, OrderUpdate, OrderItemCreate, Party, OrderStatus, Product,
} from "@/hooks/types";

// ─── OrderForm ────────────────────────────────────────────────────────────────

interface OrderFormProps {
  parties: Party[];
  initialData?: Partial<Order>;
  orderId?: string;
  onSuccess: (order: Order) => void;
  onCancel: () => void;
}

export function OrderForm({ parties, initialData, orderId, onSuccess, onCancel }: OrderFormProps) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState(initialData?.product_id ?? "");
  const [partyId, setPartyId] = useState(initialData?.party_id ?? "");
  const [partyRef, setPartyRef] = useState(initialData?.party_reference ?? "");

  useEffect(() => {
    productService.getProducts().then(setProducts).catch(() => {});
  }, []);
  const [goods, setGoods] = useState(initialData?.goods_description ?? "");
  const [stitchRateParty, setStitchRateParty] = useState(
    initialData?.stitch_rate_party?.toString() ?? ""
  );
  const [stitchRateLabor, setStitchRateLabor] = useState(
    initialData?.stitch_rate_labor?.toString() ?? ""
  );
  const [packRateParty, setPackRateParty] = useState(
    initialData?.pack_rate_party?.toString() ?? ""
  );
  const [packRateLabor, setPackRateLabor] = useState(
    initialData?.pack_rate_labor?.toString() ?? ""
  );
  const [transportExpense, setTransportExpense] = useState(
    initialData?.transport_expense?.toString() ?? ""
  );
  const [loadingExpense, setLoadingExpense] = useState(
    initialData?.loading_expense?.toString() ?? ""
  );
  const [miscExpense, setMiscExpense] = useState(
    initialData?.miscellaneous_expense?.toString() ?? ""
  );
  const [rent, setRent] = useState(
    initialData?.rent?.toString() ?? ""
  );
  const [loadingCharges, setLoadingCharges] = useState(
    initialData?.loading_charges?.toString() ?? ""
  );
  const [entryDate, setEntryDate] = useState(
    initialData?.entry_date?.split("T")[0] ?? todayInputDate()
  );
  const [deliveryDate, setDeliveryDate] = useState(
    initialData?.delivery_date?.split("T")[0] ?? ""
  );
  const [arrivalDate, setArrivalDate] = useState(
    initialData?.arrival_date?.split("T")[0] ?? ""
  );
  const [items, setItems] = useState<OrderItemCreate[]>(
    initialData?.items?.map((i) => ({ size: i.size, quantity: i.quantity })) ?? [
      { size: "", quantity: 0 },
    ]
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const addItem = () => setItems((prev) => [...prev, { size: "", quantity: 0 }]);
  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof OrderItemCreate, value: string) => {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === i
          ? { ...item, [field]: field === "quantity" ? parseInt(value) || 0 : value }
          : item
      )
    );
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!goods.trim()) e.goods = "Goods description is required.";
    if (!stitchRateParty || isNaN(Number(stitchRateParty)))
      e.stitchRateParty = "Valid stitch party rate required.";
    if (!stitchRateLabor || isNaN(Number(stitchRateLabor)))
      e.stitchRateLabor = "Valid stitch labor rate required.";
    if (!entryDate) e.entryDate = "Entry date is required.";
    if (!orderId) {
      if (items.length === 0) e.items = "At least one size item is required.";
      items.forEach((item, i) => {
        if (!item.size.trim()) e[`item_${i}_size`] = "Size required.";
        if (!item.quantity || item.quantity <= 0) e[`item_${i}_qty`] = "Qty > 0 required.";
      });
    }
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    try {
      if (orderId) {
        const updatePayload: OrderUpdate = {
          product_id: productId || undefined,
          party_id: partyId || undefined,
          party_reference: partyRef || undefined,
          goods_description: goods,
          stitch_rate_party: parseFloat(stitchRateParty),
          stitch_rate_labor: parseFloat(stitchRateLabor),
          pack_rate_party: packRateParty ? parseFloat(packRateParty) : undefined,
          pack_rate_labor: packRateLabor ? parseFloat(packRateLabor) : undefined,
          entry_date: entryDate,
          arrival_date: arrivalDate || undefined,
          delivery_date: deliveryDate || undefined,
          transport_expense: transportExpense ? parseFloat(transportExpense) : 0,
          loading_expense: loadingExpense ? parseFloat(loadingExpense) : 0,
          miscellaneous_expense: miscExpense ? parseFloat(miscExpense) : 0,
          rent: rent ? parseFloat(rent) : 0,
          loading_charges: loadingCharges ? parseFloat(loadingCharges) : 0,
        };
        const order = await ordersService.updateOrder(orderId, updatePayload);
        showToast("Order updated");
        onSuccess(order);
      } else {
        const payload: OrderCreate = {
          product_id: productId || undefined,
          party_id: partyId || undefined,
          party_reference: partyRef || undefined,
          goods_description: goods,
          total_quantity: items.reduce((s, i) => s + i.quantity, 0),
          stitch_rate_party: parseFloat(stitchRateParty),
          stitch_rate_labor: parseFloat(stitchRateLabor),
          pack_rate_party: packRateParty ? parseFloat(packRateParty) : undefined,
          pack_rate_labor: packRateLabor ? parseFloat(packRateLabor) : undefined,
          entry_date: entryDate,
          arrival_date: arrivalDate || undefined,
          delivery_date: deliveryDate || undefined,
          transport_expense: transportExpense ? parseFloat(transportExpense) : 0,
          loading_expense: loadingExpense ? parseFloat(loadingExpense) : 0,
          miscellaneous_expense: miscExpense ? parseFloat(miscExpense) : 0,
          rent: rent ? parseFloat(rent) : 0,
          loading_charges: loadingCharges ? parseFloat(loadingCharges) : 0,
          items,
        };
        const order = await ordersService.createOrder(payload);
        showToast("Order created successfully");
        onSuccess(order);
      }
    } catch {
      showToast("Failed to save order. Please try again.", "error");
      setErrors({ form: "Failed to save order. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errors.form && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-sm text-red-700">{errors.form}</p>
        </div>
      )}

      {/* Product Template */}
      <FormField label="Product Template (optional)">
        <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">— No template —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </FormField>

      {/* Party */}
      <FormField label="Party">
        <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">— Select party (optional) —</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Party Reference">
        <Input
          placeholder="e.g. ABC Mills / PO-2025-001"
          value={partyRef}
          onChange={(e) => setPartyRef(e.target.value)}
        />
      </FormField>

      <FormField label="Goods Description" required error={errors.goods}>
        <Textarea
          placeholder="Describe the goods (e.g. Gents Shalwar Kameez, Blue)"
          value={goods}
          onChange={(e) => setGoods(e.target.value)}
          error={!!errors.goods}
          rows={2}
        />
      </FormField>

      {/* Dates */}
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Entry Date" required error={errors.entryDate}>
          <Input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            error={!!errors.entryDate}
          />
        </FormField>
        <FormField label="Arrival Date">
          <Input
            type="date"
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
          />
        </FormField>
        <FormField label="Delivery Date">
          <Input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />
        </FormField>
      </div>

      {/* Stitching rates */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Stitching Rates
        </p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Party Rate (PKR)" required error={errors.stitchRateParty}>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={stitchRateParty}
              onChange={(e) => setStitchRateParty(e.target.value)}
              error={!!errors.stitchRateParty}
            />
          </FormField>
          <FormField label="Labor Rate (PKR)" required error={errors.stitchRateLabor}>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={stitchRateLabor}
              onChange={(e) => setStitchRateLabor(e.target.value)}
              error={!!errors.stitchRateLabor}
            />
          </FormField>
        </div>
      </div>

      {/* Packing rates */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Packing Rates (optional)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Party Rate (PKR)">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={packRateParty}
              onChange={(e) => setPackRateParty(e.target.value)}
            />
          </FormField>
          <FormField label="Labor Rate (PKR)">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={packRateLabor}
              onChange={(e) => setPackRateLabor(e.target.value)}
            />
          </FormField>
        </div>
      </div>

      {/* Per-order expenses */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Expenses (deducted from income)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Electricity Consumed (PKR)">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={transportExpense}
              onChange={(e) => setTransportExpense(e.target.value)}
            />
          </FormField>
          <FormField label="Thread Used/pcs (PKR)">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={loadingExpense}
              onChange={(e) => setLoadingExpense(e.target.value)}
            />
          </FormField>
          <FormField label="Master Cutting Wage/pcs (PKR)">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={miscExpense}
              onChange={(e) => setMiscExpense(e.target.value)}
            />
          </FormField>
          <FormField label="Rent (PKR)">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
            />
          </FormField>
          <FormField label="Loading Charges (PKR)">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={loadingCharges}
              onChange={(e) => setLoadingCharges(e.target.value)}
            />
          </FormField>
        </div>
      </div>

      {/* Size items — hidden in edit mode (items are immutable after creation) */}
      {!orderId && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Colour Breakdown
            </p>
            <button
              type="button"
              onClick={addItem}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              + Add Colour
            </button>
          </div>
          {errors.items && <p className="text-xs text-red-600 mb-2">{errors.items}</p>}
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    placeholder="Colour (e.g. Grey, Navy, Black)"
                    value={item.size}
                    onChange={(e) => updateItem(i, "size", e.target.value)}
                    error={!!errors[`item_${i}_size`]}
                  />
                  {errors[`item_${i}_size`] && (
                    <p className="text-xs text-red-600 mt-0.5">{errors[`item_${i}_size`]}</p>
                  )}
                </div>
                <div className="w-28">
                  <Input
                    type="number"
                    placeholder="Qty"
                    min="1"
                    value={item.quantity || ""}
                    onChange={(e) => updateItem(i, "quantity", e.target.value)}
                    error={!!errors[`item_${i}_qty`]}
                  />
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="mt-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Total: {items.reduce((s, i) => s + (i.quantity || 0), 0).toLocaleString()} pieces
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1 justify-center">
          {orderId ? "Save Changes" : "Create Order"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── OrderStatusSelect ────────────────────────────────────────────────────────

interface OrderStatusSelectProps {
  orderId: string;
  currentStatus: OrderStatus;
  onChange: (updated: Order) => void;
}

export function OrderStatusSelect({ orderId, currentStatus, onChange }: OrderStatusSelectProps) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (status === currentStatus) return;
    setLoading(true);
    setError("");
    try {
      const updated = await ordersService.updateStatus(orderId, { status });
      onChange(updated);
    } catch {
      setError("Failed to update status.");
      setStatus(currentStatus);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Select
          className="w-56"
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus)}
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {getStatusConfig(s).label}
            </option>
          ))}
        </Select>
        <StatusBadge status={status} />
        <Button
          size="sm"
          onClick={handleSave}
          loading={loading}
          disabled={status === currentStatus}
        >
          Save
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── OrderItemsTable ──────────────────────────────────────────────────────────

interface EditableItem {
  id?: string;
  size: string;
  quantity: number;
  completed_quantity: number;
  packed_quantity: number;
}

interface OrderItemsTableProps {
  items: Order["items"];
  onSave?: (items: Array<{ id?: string; size: string; quantity: number; completed_quantity?: number; packed_quantity?: number }>) => Promise<void>;
}

export function OrderItemsTable({ items, onSave }: OrderItemsTableProps) {
  const [editing, setEditing] = React.useState(false);
  const [rows, setRows] = React.useState<EditableItem[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const total = items.reduce((s, i) => s + i.quantity, 0);
  const stitched = items.reduce((s, i) => s + i.completed_quantity, 0);
  const packed = items.reduce((s, i) => s + i.packed_quantity, 0);

  const startEdit = () => {
    setRows(items.map(i => ({ id: i.id, size: i.size, quantity: i.quantity, completed_quantity: i.completed_quantity, packed_quantity: i.packed_quantity })));
    setError("");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!onSave) return;
    const valid = rows.filter(r => r.size.trim() && r.quantity > 0);
    if (!valid.length) { setError("At least one colour row required."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(valid.map(r => ({ id: r.id, size: r.size.trim(), quantity: r.quantity, completed_quantity: r.completed_quantity, packed_quantity: r.packed_quantity })));
      setEditing(false);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const editTotal = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Colour</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ordered</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Stitched</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Packed</th>
                <th className="px-2 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-gray-50 last:border-0">
                  <td className="px-2 py-1.5">
                    <input
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={row.size}
                      onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, size: e.target.value } : r))}
                      placeholder="Colour name"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ml-auto block"
                      value={row.quantity}
                      onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: parseInt(e.target.value) || 0 } : r))}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ml-auto block"
                      value={row.completed_quantity}
                      onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, completed_quantity: parseInt(e.target.value) || 0 } : r))}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ml-auto block"
                      value={row.packed_quantity}
                      onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, packed_quantity: parseInt(e.target.value) || 0 } : r))}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-500 text-lg leading-none"
                      title="Remove row"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-2 text-xs text-gray-600">Total</td>
                <td className="px-4 py-2 text-right tabular-nums text-sm">{editTotal}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setRows(prev => [...prev, { size: "", quantity: 0, completed_quantity: 0, packed_quantity: 0 }])}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 rounded px-2 py-1"
          >+ Add colour</button>
          <div className="flex-1" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-200 rounded">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Colour</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ordered</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Stitched</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Packed</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Stitch %</th>
              {onSave && <th className="px-2 py-2.5 w-12" />}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const pct = item.quantity > 0 ? Math.round((item.completed_quantity / item.quantity) * 100) : 0;
              return (
                <tr key={item.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{item.size}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-blue-700 font-medium">{item.completed_quantity}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-teal-700 font-medium">{item.packed_quantity}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 tabular-nums w-8 text-right">{pct}%</span>
                    </div>
                  </td>
                  {onSave && <td />}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-2.5 text-xs text-gray-600">Total</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{total}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{stitched}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-teal-700">{packed}</td>
              <td className="px-4 py-2.5 text-right text-xs text-gray-500">{total > 0 ? Math.round((stitched / total) * 100) : 0}%</td>
              {onSave && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {onSave && (
        <div className="mt-2 flex justify-end">
          <button onClick={startEdit} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Edit breakdown
          </button>
        </div>
      )}
    </div>
  );
}
