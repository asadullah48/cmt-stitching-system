"use client";

import React, { useState, useEffect } from "react";
import { transactionsService, partiesService, ordersService } from "@/hooks/services";
import { todayInputDate, formatCurrency, formatDate } from "@/hooks/utils";
import { useToast } from "@/hooks/toast";
import { Button, FormField, Input, Select, Textarea } from "@/components/common";
import type {
  TransactionCreate, TransactionType, PaymentMethod,
  FinancialTransaction, Party, PartyCreate, Order,
} from "@/hooks/types";

// ─── TransactionForm ──────────────────────────────────────────────────────────

interface TransactionFormProps {
  partyId?: string;
  orderId?: string;
  initialData?: FinancialTransaction;
  onSuccess: (tx: FinancialTransaction) => void;
  onCancel: () => void;
}

const TX_TYPES: { value: TransactionType; label: string }[] = [
  { value: "income", label: "Income (receivable)" },
  { value: "payment", label: "Payment (payable)" },
  { value: "expense", label: "Expense" },
  { value: "adjustment", label: "Adjustment" },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export function TransactionForm({
  partyId: initialPartyId,
  orderId: initialOrderId,
  initialData,
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const { showToast } = useToast();
  const isEdit = !!initialData;
  const [partyId, setPartyId] = useState(initialData?.party_id ?? initialPartyId ?? "");
  const [orderId, setOrderId] = useState(initialData?.order_id ?? initialOrderId ?? "");
  const [parties, setParties] = useState<Party[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [txType, setTxType] = useState<TransactionType>(initialData?.transaction_type ?? "income");
  const [amount, setAmount] = useState(initialData?.amount?.toString() ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(initialData?.payment_method ?? "");
  const [refNumber, setRefNumber] = useState(initialData?.reference_number ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [txDate, setTxDate] = useState(initialData?.transaction_date ?? todayInputDate());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialPartyId) {
      partiesService.getParties(1, 100).then((r) => setParties(r.data));
    }
    ordersService.getOrders({ size: 100 }).then((r) => setOrders(r.data));
  }, [initialPartyId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      e.amount = "Valid amount required.";
    if (!description.trim()) e.description = "Description is required.";
    if (!txDate) e.txDate = "Date is required.";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    const payload: TransactionCreate = {
      party_id: partyId || undefined,
      order_id: orderId || undefined,
      transaction_type: txType,
      amount: parseFloat(amount),
      payment_method: (paymentMethod as PaymentMethod) || undefined,
      reference_number: refNumber || undefined,
      description,
      transaction_date: txDate,
    };

    try {
      const tx = isEdit
        ? await transactionsService.updateTransaction(initialData!.id, payload)
        : await transactionsService.createTransaction(payload);
      showToast(isEdit ? "Transaction updated" : "Transaction recorded");
      onSuccess(tx);
    } catch {
      showToast("Failed to save. Please try again.", "error");
      setErrors({ form: "Failed to save transaction. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.form && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-sm text-red-700">{errors.form}</p>
        </div>
      )}

      {!initialPartyId && (
        <FormField label="Party">
          <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">— Select party (optional) —</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </FormField>
      )}

      <FormField label="Link to Order">
        <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">— Select order (optional) —</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>{o.order_number} — {o.goods_description}</option>
          ))}
        </Select>
      </FormField>

      <FormField label="Transaction Type" required>
        <Select
          value={txType}
          onChange={(e) => setTxType(e.target.value as TransactionType)}
        >
          {TX_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Amount (PKR)" required error={errors.amount}>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={!!errors.amount}
        />
      </FormField>

      <FormField label="Date" required error={errors.txDate}>
        <Input
          type="date"
          value={txDate}
          onChange={(e) => setTxDate(e.target.value)}
          error={!!errors.txDate}
        />
      </FormField>

      <FormField label="Payment Method">
        <Select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}
        >
          <option value="">— Select method —</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Reference #">
        <Input
          placeholder="Cheque / transfer reference"
          value={refNumber}
          onChange={(e) => setRefNumber(e.target.value)}
        />
      </FormField>

      <FormField label="Description" required error={errors.description}>
        <Textarea
          placeholder="Brief description of this transaction"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={!!errors.description}
          rows={2}
        />
      </FormField>

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1 justify-center">
          {isEdit ? "Update Transaction" : "Record Transaction"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── PartyForm ────────────────────────────────────────────────────────────────

interface PartyFormProps {
  initialData?: Partial<Party>;
  partyId?: string;
  onSuccess: (party: Party) => void;
  onCancel: () => void;
}

export function PartyForm({ initialData, partyId, onSuccess, onCancel }: PartyFormProps) {
  const { showToast } = useToast();
  const [name, setName] = useState(initialData?.name ?? "");
  const [contactPerson, setContactPerson] = useState(initialData?.contact_person ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [address, setAddress] = useState(initialData?.address ?? "");
  const [paymentTerms, setPaymentTerms] = useState(initialData?.payment_terms ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrors({ name: "Party name is required." });
      return;
    }
    setErrors({});
    setLoading(true);

    const payload: PartyCreate = {
      name: name.trim(),
      contact_person: contactPerson || undefined,
      phone: phone || undefined,
      email: email || undefined,
      address: address || undefined,
      payment_terms: paymentTerms || undefined,
    };

    try {
      const party = partyId
        ? await partiesService.updateParty(partyId, payload)
        : await partiesService.createParty(payload);
      showToast(partyId ? "Party updated" : "Party created");
      onSuccess(party);
    } catch {
      showToast("Failed to save. Please try again.", "error");
      setErrors({ form: "Failed to save party." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.form && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-sm text-red-700">{errors.form}</p>
        </div>
      )}

      <FormField label="Party Name" required error={errors.name}>
        <Input
          placeholder="e.g. ABC Garments"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!!errors.name}
          autoFocus
        />
      </FormField>

      <FormField label="Contact Person">
        <Input
          placeholder="Full name"
          value={contactPerson}
          onChange={(e) => setContactPerson(e.target.value)}
        />
      </FormField>

      <FormField label="Phone">
        <Input
          type="tel"
          placeholder="+92 300 1234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormField>

      <FormField label="Email">
        <Input
          type="email"
          placeholder="contact@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>

      <FormField label="Address">
        <Textarea
          placeholder="Business address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
        />
      </FormField>

      <FormField label="Payment Terms">
        <Input
          placeholder="e.g. Net 30, COD"
          value={paymentTerms}
          onChange={(e) => setPaymentTerms(e.target.value)}
        />
      </FormField>

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" loading={loading} className="flex-1 justify-center">
          {partyId ? "Update Party" : "Save Party"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── LedgerTable ─────────────────────────────────────────────────────────────

interface LedgerTableProps {
  transactions: FinancialTransaction[];
}

export function LedgerTable({ transactions }: LedgerTableProps) {
  // Calculate running balance
  let running = 0;
  const rows = [...transactions]
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
    .map((tx) => {
      if (tx.transaction_type === "income") running += Number(tx.amount);
      else if (tx.transaction_type === "payment") running -= Number(tx.amount);
      return { ...tx, running };
    });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => (
            <tr key={tx.id} className="border-b border-gray-50 last:border-0">
              <td className="px-4 py-2.5 text-gray-600">{formatDate(tx.transaction_date)}</td>
              <td className="px-4 py-2.5">
                <span className="capitalize text-xs font-medium">{tx.transaction_type}</span>
              </td>
              <td className="px-4 py-2.5 text-gray-700">{tx.description}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                tx.transaction_type === "income" ? "text-green-600" : "text-orange-600"
              }`}>
                {tx.transaction_type === "income" ? "+" : "-"} {formatCurrency(tx.amount)}
              </td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                tx.running >= 0 ? "text-green-600" : "text-red-600"
              }`}>
                {formatCurrency(tx.running)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
