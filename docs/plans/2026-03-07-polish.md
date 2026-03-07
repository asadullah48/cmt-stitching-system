# CMT System Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the live CMT stitching system across visual quality, missing features, and production hardening.

**Architecture:** Pure frontend + minimal backend changes. No new pages — edits to existing components and services. All frontend changes are in Next.js App Router with TailwindCSS v4. Backend is FastAPI.

**Tech Stack:** Next.js 15, TailwindCSS v4, TypeScript, React Context · FastAPI, SQLAlchemy 2.0

---

## Task 1: Fix Tailwind JIT Dynamic Class Bug (Dashboard)

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/page.tsx:138-146`

**Problem:** Line 140 builds a dynamic class string:
```js
`border-${cfg.dot.replace("bg-", "")}/20`
```
Tailwind JIT cannot statically detect this class — the border never renders.

**Fix:** Replace the dynamic border with `border-white/20` (safe default) or remove it entirely. The bg color provides enough visual identity without a border.

**Step 1: Edit the pipeline mini-cards div**

In `frontend/src/app/(dashboard)/dashboard/page.tsx`, replace lines 138–146:

```tsx
return (
  <div
    key={s}
    className={`rounded-lg px-3 py-2.5 ${cfg.bg}`}
  >
    <p className={`text-lg font-semibold ${cfg.text}`}>{count}</p>
    <p className={`text-xs ${cfg.text} opacity-80`}>{cfg.label}</p>
  </div>
);
```

**Step 2: Verify**
Run frontend dev server and confirm all 6 pipeline cards render with correct background colors.

**Step 3: Commit**
```bash
git add frontend/src/app/(dashboard)/dashboard/page.tsx
git commit -m "fix: remove dynamic Tailwind class that breaks JIT in pipeline cards"
```

---

## Task 2: Add order_id Filter to Transactions Backend

**Files:**
- Modify: `backend/app/services/financial_service.py:51-77`
- Modify: `backend/app/api/v1/endpoints/transactions.py:30-42`

**Problem:** Order detail page fetches all 200 transactions and filters client-side by `order_id`. Backend doesn't support this filter.

**Step 1: Add order_id param to FinancialService.get_all**

In `backend/app/services/financial_service.py`, update the `get_all` signature and query:

```python
@staticmethod
def get_all(
    db: Session,
    page: int = 1,
    size: int = 20,
    party_id: Optional[UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    transaction_type: Optional[str] = None,
    order_id: Optional[UUID] = None,
) -> tuple[list[FinancialTransaction], int]:
    q = (
        db.query(FinancialTransaction)
        .options(joinedload(FinancialTransaction.party), joinedload(FinancialTransaction.order))
        .filter(FinancialTransaction.is_deleted.is_(False))
    )
    if party_id:
        q = q.filter(FinancialTransaction.party_id == party_id)
    if order_id:
        q = q.filter(FinancialTransaction.order_id == order_id)
    if date_from:
        q = q.filter(FinancialTransaction.transaction_date >= date_from)
    if date_to:
        q = q.filter(FinancialTransaction.transaction_date <= date_to)
    if transaction_type:
        q = q.filter(FinancialTransaction.transaction_type == transaction_type)

    total = q.count()
    txns = q.order_by(FinancialTransaction.transaction_date.desc()).offset((page - 1) * size).limit(size).all()
    return txns, total
```

**Step 2: Expose order_id in the endpoint**

In `backend/app/api/v1/endpoints/transactions.py`, update `list_transactions`:

```python
@router.get("/", response_model=TransactionListResponse)
def list_transactions(
    db: DbDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    party_id: Optional[UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    transaction_type: Optional[str] = Query(None),
    order_id: Optional[UUID] = Query(None),
):
    txns, total = FinancialService.get_all(
        db, page, size, party_id, date_from, date_to, transaction_type, order_id
    )
    return TransactionListResponse(data=[_to_out(t) for t in txns], total=total, page=page, size=size)
```

**Step 3: Verify**
Hit `GET /api/v1/transactions/?order_id=<some-uuid>` in the FastAPI `/docs` — confirm it returns filtered results.

**Step 4: Commit**
```bash
git add backend/app/services/financial_service.py backend/app/api/v1/endpoints/transactions.py
git commit -m "feat: add order_id filter to transactions endpoint"
```

---

## Task 3: Update Frontend Types + Fix Order Detail Transactions

**Files:**
- Modify: `frontend/src/hooks/types.ts:208-214`
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx:51-58`

**Step 1: Add transaction_type and order_id to TransactionFilters**

In `frontend/src/hooks/types.ts`, replace the `TransactionFilters` interface:

```ts
export interface TransactionFilters {
  party_id?: string;
  order_id?: string;
  transaction_type?: TransactionType;
  date_from?: string;
  date_to?: string;
  page?: number;
  size?: number;
}
```

**Step 2: Fix order detail to use server-side filter**

In `frontend/src/app/(dashboard)/orders/[id]/page.tsx`, replace the `loadTransactions` function (lines 51-58):

```ts
const loadTransactions = useCallback(async () => {
  try {
    const res = await transactionsService.getTransactions({ order_id: id, size: 100 });
    setTransactions(res.data);
  } catch { /* ignore */ }
}, [id]);
```

**Step 3: Commit**
```bash
git add frontend/src/hooks/types.ts frontend/src/app/(dashboard)/orders/[id]/page.tsx
git commit -m "fix: use server-side order_id filter for order transactions"
```

---

## Task 4: Toast Notification System

**Files:**
- Create: `frontend/src/hooks/toast.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/components/orders.tsx` (OrderForm)
- Modify: `frontend/src/components/financial.tsx` (PartyForm, TransactionForm)
- Modify: `frontend/src/components/production.tsx` (SessionForm)

**Step 1: Create the Toast context + component**

Create `frontend/src/hooks/toast.tsx`:

```tsx
"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { cn } from "./utils";

type ToastType = "success" | "error";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let counter = 0;

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium",
              "animate-in slide-in-from-bottom-2 duration-200",
              t.type === "success"
                ? "bg-gray-900 text-white"
                : "bg-red-600 text-white"
            )}
          >
            {t.type === "success" ? (
              <svg className="w-4 h-4 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

**Step 2: Wrap app with ToastProvider**

In `frontend/src/app/layout.tsx`, import and wrap:

```tsx
import { ToastProvider } from "@/hooks/toast";

// Inside the <body>:
<ToastProvider>
  {children}
</ToastProvider>
```

**Step 3: Use toast in OrderForm**

In `frontend/src/components/orders.tsx`, add `useToast` to `OrderForm`:

```tsx
import { useToast } from "@/hooks/toast";

// Inside OrderForm:
const { showToast } = useToast();

// In handleSubmit, replace the catch block:
try {
  const order = await ordersService.createOrder(payload);
  showToast("Order created successfully");
  onSuccess(order);
} catch {
  showToast("Failed to create order. Please try again.", "error");
  setErrors({ form: "Failed to create order. Please try again." });
}
```

**Step 4: Add toasts to SessionForm, TransactionForm, PartyForm**

In each form's `handleSubmit`, after a successful API call add:
```tsx
showToast("Session logged successfully");  // SessionForm
showToast("Transaction recorded");          // TransactionForm
showToast("Party created");                 // PartyForm
```

And in each catch block:
```tsx
showToast("Failed to save. Please try again.", "error");
```

**Step 5: Commit**
```bash
git add frontend/src/hooks/toast.tsx frontend/src/app/layout.tsx \
  frontend/src/components/orders.tsx frontend/src/components/financial.tsx \
  frontend/src/components/production.tsx
git commit -m "feat: add toast notification system to all forms"
```

---

## Task 5: Edit Order Sheet on Order Detail

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`
- Modify: `frontend/src/components/orders.tsx` (OrderForm needs update mode)

**Step 1: Add edit mode to OrderForm**

In `frontend/src/components/orders.tsx`, the `OrderForm` already accepts `initialData` and `onSuccess`. Add a prop to control the submit button label and payload:

In the `OrderFormProps` interface, add:
```ts
orderId?: string;  // if provided → update mode
```

In `handleSubmit`, branch on `orderId`:
```tsx
if (orderId) {
  // update mode — don't send items (they're immutable after creation)
  const updatePayload: OrderUpdate = {
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
  };
  const order = await ordersService.updateOrder(orderId, updatePayload);
  showToast("Order updated");
  onSuccess(order);
} else {
  // create mode (existing logic)
}
```

Change the submit button label:
```tsx
<Button type="submit" loading={loading} className="flex-1 justify-center">
  {orderId ? "Save Changes" : "Create Order"}
</Button>
```

In edit mode, hide the items section (items can't be changed after creation):
```tsx
{!orderId && (
  <div>
    {/* Size Breakdown section */}
  </div>
)}
```

**Step 2: Add Edit button + sheet to order detail page**

In `frontend/src/app/(dashboard)/orders/[id]/page.tsx`:

Add state: `const [editSheet, setEditSheet] = useState(false);`

Add Edit button next to Delete:
```tsx
<Button size="sm" onClick={() => setEditSheet(true)}>
  Edit
</Button>
<Button variant="secondary" size="sm" onClick={() => setDeleteDialog(true)}>
  Delete
</Button>
```

Add the sheet (before the closing `</div>`):
```tsx
<Sheet open={editSheet} onClose={() => setEditSheet(false)} title="Edit Order" width="w-[580px]">
  <OrderForm
    parties={[]}  // pass parties from state (add parties to state)
    orderId={order.id}
    initialData={order}
    onSuccess={(updated) => { setEditSheet(false); setOrder(updated); showToast("Order updated"); }}
    onCancel={() => setEditSheet(false)}
  />
</Sheet>
```

Also add parties to order detail page state (needed for the party select in edit mode):
```tsx
const [parties, setParties] = useState<Party[]>([]);
// In useEffect:
partiesService.getParties(1, 200).then((r) => setParties(r.data));
```

**Step 3: Commit**
```bash
git add frontend/src/app/(dashboard)/orders/[id]/page.tsx frontend/src/components/orders.tsx
git commit -m "feat: add edit order sheet to order detail page"
```

---

## Task 6: Transaction Type Filter in Ledger

**Files:**
- Modify: `frontend/src/app/(dashboard)/ledger/page.tsx`

**Step 1: Add type filter to filter bar**

In `frontend/src/app/(dashboard)/ledger/page.tsx`, add a type Select to the filter bar after the party Select:

```tsx
import type { TransactionType } from "@/hooks/types";

// In the filters div:
<Select
  className="w-40"
  value={filters.transaction_type ?? ""}
  onChange={(e) =>
    handleFilter({ transaction_type: (e.target.value as TransactionType) || undefined })
  }
>
  <option value="">All types</option>
  <option value="income">Income</option>
  <option value="payment">Payment</option>
  <option value="expense">Expense</option>
  <option value="adjustment">Adjustment</option>
</Select>
```

Also update the clear filter condition to include `transaction_type`:
```tsx
{(filters.party_id || filters.date_from || filters.date_to || filters.transaction_type) && (
  <Button variant="ghost" size="sm" onClick={() => setFilters({ page: 1, size: 30 })}>
    Clear
  </Button>
)}
```

**Step 2: Fix ledger summary label**

Change "(page)" labels to be more explicit:

```tsx
<p className="text-xs text-green-600 font-medium">Income (this page)</p>
<p className="text-xs text-orange-600 font-medium">Payments (this page)</p>
```

**Step 3: Commit**
```bash
git add frontend/src/app/(dashboard)/ledger/page.tsx
git commit -m "feat: add transaction type filter to ledger; clarify summary labels"
```

---

## Task 7: Production Page Empty State

**Files:**
- Modify: `frontend/src/app/(dashboard)/production/page.tsx`

**Step 1: Add empty state when no order selected**

In `frontend/src/app/(dashboard)/production/page.tsx`, after the order-picker card (around line 145), add:

```tsx
{!selectedOrderId && (
  <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200 shadow-sm">
    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    </div>
    <p className="text-sm text-gray-500">Select an order above to view or log sessions</p>
  </div>
)}
```

**Step 2: Commit**
```bash
git add frontend/src/app/(dashboard)/production/page.tsx
git commit -m "feat: show empty state on production page when no order selected"
```

---

## Task 8: Sheet Slide-in Animation

**Files:**
- Modify: `frontend/src/components/common.tsx:194-244`

**Step 1: Add CSS transition to Sheet panel**

Replace the Sheet panel div className in `frontend/src/components/common.tsx`:

```tsx
// Change the panel div from:
className={cn("relative ml-auto h-full bg-white shadow-2xl flex flex-col", width)}

// To (add translate + transition):
className={cn(
  "relative ml-auto h-full bg-white shadow-2xl flex flex-col",
  "translate-x-0 transition-transform duration-300 ease-out",
  width
)}
```

Also add a transition to the backdrop:
```tsx
className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200"
```

**Note:** For a proper mount/unmount animation in React, use `open` state with a CSS class toggle. Since the Sheet returns `null` when `!open`, the animation only runs on open. For now this improves the feel on open; the close is instant (acceptable for small-scale app).

**Step 2: Commit**
```bash
git add frontend/src/components/common.tsx
git commit -m "feat: add slide-in transition to Sheet component"
```

---

## Task 9: Global 404 Page

**Files:**
- Create: `frontend/src/app/not-found.tsx`

**Step 1: Create the 404 page**

Create `frontend/src/app/not-found.tsx`:

```tsx
import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
        <p className="text-gray-500 mb-6">This page doesn&apos;t exist.</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add frontend/src/app/not-found.tsx
git commit -m "feat: add global 404 not-found page"
```

---

## Task 10: Pagination Ellipsis for Large Page Counts

**Files:**
- Modify: `frontend/src/components/common.tsx:357-403`

**Step 1: Replace the page buttons logic**

In `frontend/src/components/common.tsx`, replace the page button rendering (the `Array.from` block) with:

```tsx
{(() => {
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }
  return pages.map((p, i) =>
    p === "..." ? (
      <span key={`ellipsis-${i}`} className="px-2 py-1 text-xs text-gray-400">…</span>
    ) : (
      <button
        key={p}
        onClick={() => onChange(p)}
        className={cn(
          "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
          p === page ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
        )}
      >
        {p}
      </button>
    )
  );
})()}
```

**Step 2: Commit**
```bash
git add frontend/src/components/common.tsx
git commit -m "feat: add ellipsis truncation to pagination for large page counts"
```

---

## Final: Deploy

**Step 1: Push all commits**
```bash
git push origin master
```

Vercel auto-deploys frontend on push. Render auto-deploys backend on push.

**Step 2: Smoke test on production**
- [ ] Dashboard pipeline cards render colored backgrounds (no broken borders)
- [ ] Create an order → toast appears
- [ ] Log a session → toast appears
- [ ] Record a payment → toast appears
- [ ] Navigate to `/orders/bad-url` → 404 page shows
- [ ] Order detail → Transactions tab shows only that order's transactions
- [ ] Ledger → type filter works
- [ ] Production page → empty state shows when no order selected
- [ ] Edit order → sheet opens, save works
- [ ] Pagination on orders/ledger with >7 pages shows ellipsis
