# Order Lifecycle Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the order detail page into a professional horizontal pipeline tracker showing Order → Stitching → Packing → Dispatched stages, each with costs, inventory, sessions, and action buttons.

**Architecture:** Redesign `/orders/[id]/page.tsx` to lead with an animated 4-step pipeline header, then render each stage as a self-contained card that expands when active or complete. No new pages — all data loaded from existing + two new API calls (expenses by order, bill by order).

**Tech Stack:** Next.js 15, TailwindCSS v4, CSS animations (pulse/fill), FastAPI, SQLAlchemy

---

## Task 1: Backend — Expose expenses & bill per order

**Files:**
- Modify: `backend/app/api/v1/endpoints/expenses.py`
- Modify: `backend/app/api/v1/endpoints/bills.py`
- Modify: `backend/app/schemas/orders.py` (check if bill already in OrderOut)

**Step 1: Read the files**
```
Read: backend/app/api/v1/endpoints/expenses.py
Read: backend/app/schemas/orders.py
Read: backend/app/schemas/expenses.py (if exists)
```

**Step 2: Add `order_id` filter to expenses list endpoint**

In `expenses.py`, add `order_id: Optional[UUID] = Query(None)` param and filter:
```python
if order_id:
    q = q.filter(Expense.order_id == order_id)
```

**Step 3: Add `order_id` filter to bills list endpoint**

In `backend/app/api/v1/endpoints/bills.py`, the `list_bills` function already has `party_id` filter. Add:
```python
order_id: Optional[UUID] = Query(None),
```
And pass to `BillService.get_all()`. Update `BillService.get_all()` signature and body similarly.

**Step 4: Commit**
```bash
git commit -m "feat: filter expenses + bills by order_id"
```

---

## Task 2: Frontend — New types + service calls

**Files:**
- Modify: `frontend/src/hooks/types.ts`
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx`

**Step 1: Add Expense type to `types.ts`** (if not already there)
```typescript
export interface Expense {
  id: string;
  category_id?: string;
  order_id?: string;
  amount: number;
  description?: string;
  expense_date: string;
  receipt_number?: string;
}
```

**Step 2: Add `expensesService` to `services.ts` and `services.tsx`**
```typescript
export const expensesService = {
  listByOrder: async (orderId: string): Promise<{ data: Expense[]; total: number }> => {
    const { data } = await api.get('/expenses/', { params: { order_id: orderId, size: 100 } });
    return data;
  },
};
```

**Step 3: Add `billService.getByOrder`**
```typescript
// In billService object:
getByOrder: async (orderId: string): Promise<Bill | null> => {
  const res = await billService.list({ order_id: orderId, size: 1 });
  return res.data[0] ?? null;
},
```

**Step 4: Commit**
```bash
git commit -m "feat: expense + bill-by-order service methods"
```

---

## Task 3: Frontend — Pipeline Header Component

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Define stage config at top of file**

Map each order status to a pipeline stage index (0–3):
```typescript
const STAGE_INDEX: Record<string, number> = {
  pending: 0,
  stitching_in_progress: 1,
  stitching_complete: 1,
  packing_in_progress: 2,
  packing_complete: 2,
  dispatched: 3,
};

const STAGES = [
  { key: "order",    label: "Order Placed",  icon: "📋" },
  { key: "stitch",   label: "Stitching",     icon: "🧵" },
  { key: "packing",  label: "Packing",       icon: "📦" },
  { key: "dispatch", label: "Dispatched",    icon: "🚚" },
];
```

**Step 2: Write `PipelineHeader` component**

```tsx
function PipelineHeader({ order }: { order: Order }) {
  const activeIdx = STAGE_INDEX[order.status] ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between relative">
        {/* connecting line behind steps */}
        <div className="absolute left-0 right-0 top-5 h-0.5 bg-gray-200 mx-16 z-0" />
        <div
          className="absolute left-0 top-5 h-0.5 bg-blue-500 z-0 transition-all duration-700"
          style={{ width: `${(activeIdx / 3) * 100}%`, marginLeft: "4rem", marginRight: "4rem" }}
        />

        {STAGES.map((stage, idx) => {
          const done    = idx < activeIdx || order.status === "dispatched";
          const active  = idx === activeIdx && order.status !== "dispatched";
          const pending = idx > activeIdx;

          return (
            <div key={stage.key} className="flex flex-col items-center gap-2 z-10 flex-1">
              {/* Circle */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-500
                ${done    ? "bg-green-500 border-green-500 text-white" : ""}
                ${active  ? "bg-blue-600 border-blue-600 text-white animate-pulse" : ""}
                ${pending ? "bg-white border-gray-300 text-gray-400" : ""}
              `}>
                {done ? "✓" : stage.icon}
              </div>
              {/* Label */}
              <span className={`text-xs font-semibold text-center ${
                done ? "text-green-600" : active ? "text-blue-700" : "text-gray-400"
              }`}>
                {stage.label}
              </span>
              {/* Date/state hint */}
              <span className="text-xs text-gray-400 text-center">
                {idx === 0 && formatDate(order.entry_date)}
                {idx === 1 && (active ? `Day ${daysSince(order.entry_date)}` : done ? "Complete" : "Pending")}
                {idx === 2 && (active ? "In Progress" : done ? "Complete" : "Pending")}
                {idx === 3 && (done ? formatDate(order.dispatch_date) : "Pending")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper
function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}
```

**Step 3: Commit**
```bash
git commit -m "feat: pipeline header component with animated step progress"
```

---

## Task 4: Frontend — Stitching Stage Card

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Write `StitchingCard` component**

```tsx
function StitchingCard({
  order, sessions, onLogSession, onStatusChange
}: {
  order: Order;
  sessions: ProductionSession[];
  onLogSession: () => void;
  onStatusChange: (updated: Order) => void;
}) {
  const status = order.status;
  const isActive = status === "stitching_in_progress";
  const isDone   = ["stitching_complete","packing_in_progress","packing_complete","dispatched"].includes(status);
  const isPending = status === "pending";

  const totalHours   = sessions.reduce((s, r) => s + (Number(r.duration_hours) ?? 0), 0);
  const totalMachines= sessions.reduce((s, r) => s + r.machines_used, 0);
  const daysElapsed  = isDone || isActive ? daysSince(order.entry_date) : null;

  const laborCost  = order.stitch_rate_labor  * order.total_quantity;
  const partyCost  = order.stitch_rate_party  * order.total_quantity;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-300
      ${isActive ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-200"}
      ${isPending ? "opacity-60" : ""}
    `}>
      {/* Card header */}
      <div className={`px-5 py-3.5 flex items-center justify-between
        ${isActive ? "bg-blue-50" : isDone ? "bg-green-50" : "bg-gray-50"}
      `}>
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🧵</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Stitching</h3>
            <p className="text-xs text-gray-500">
              {isActive && daysElapsed !== null ? `Day ${daysElapsed} · ${sessions.length} sessions · ${totalHours}h` : ""}
              {isDone ? `Completed · ${sessions.length} sessions · ${totalHours}h` : ""}
              {isPending ? "Waiting to start" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              In Progress
            </span>
          )}
          {isDone && (
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">✓ Complete</span>
          )}
        </div>
      </div>

      {/* Body — only show when active or done */}
      {!isPending && (
        <div className="p-5 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Sessions",  value: sessions.length },
              { label: "Hours",     value: `${totalHours}h` },
              { label: "Machines",  value: totalMachines },
              { label: "Days",      value: daysElapsed ?? "—" },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-gray-900 tabular-nums">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Cost breakdown */}
          <div className="bg-gray-50 rounded-lg p-3.5 space-y-1.5">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Cost Breakdown</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Party Charge ({formatCurrency(order.stitch_rate_party)} × {order.total_quantity.toLocaleString()})</span>
              <span className="font-semibold text-gray-900 tabular-nums">PKR {formatCurrency(partyCost)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Labor Cost ({formatCurrency(order.stitch_rate_labor)} × {order.total_quantity.toLocaleString()})</span>
              <span className="font-semibold text-orange-600 tabular-nums">PKR {formatCurrency(laborCost)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-2 mt-1">
              <span className="text-gray-700">Net Stitching</span>
              <span className={partyCost - laborCost >= 0 ? "text-green-600" : "text-red-600"}>
                PKR {formatCurrency(partyCost - laborCost)}
              </span>
            </div>
          </div>

          {/* Last 3 sessions preview */}
          {sessions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Sessions</p>
              <div className="space-y-1.5">
                {sessions.slice(-3).reverse().map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    <span>{formatDate(s.session_date)}</span>
                    <span>{s.machines_used} machines</span>
                    <span>{s.duration_hours ? `${s.duration_hours}h` : "—"}</span>
                    <span className="text-gray-400 truncate max-w-[120px]">{s.notes ?? ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {isActive && (
              <>
                <button
                  onClick={onLogSession}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  + Log Session
                </button>
                <OrderStatusSelect
                  orderId={order.id}
                  currentStatus={order.status}
                  onChange={onStatusChange}
                  compact
                />
              </>
            )}
            {status === "pending" && (
              <OrderStatusSelect
                orderId={order.id}
                currentStatus={order.status}
                onChange={onStatusChange}
                compact
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**
```bash
git commit -m "feat: stitching stage card with cost breakdown + session preview"
```

---

## Task 5: Frontend — Packing Stage Card

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Write `PackingCard` component** — mirrors `StitchingCard` but uses pack rates and shows `packingRequired` toggle

```tsx
function PackingCard({
  order, sessions, expenses, onLogSession, onStatusChange
}: {
  order: Order;
  sessions: ProductionSession[];
  expenses: Expense[];
  onLogSession: () => void;
  onStatusChange: (updated: Order) => void;
}) {
  const status = order.status;
  const isActive = status === "packing_in_progress";
  const isDone   = ["packing_complete","dispatched"].includes(status);
  const isReachable = ["stitching_complete","packing_in_progress","packing_complete","dispatched"].includes(status);
  const hasPacking = order.pack_rate_party != null || order.pack_rate_labor != null;

  const totalHours    = sessions.reduce((s, r) => s + (Number(r.duration_hours) ?? 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const packParty     = (order.pack_rate_party ?? 0) * order.total_quantity;
  const packLabor     = (order.pack_rate_labor ?? 0) * order.total_quantity;

  if (!isReachable) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 opacity-50">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📦</span>
          <h3 className="text-sm font-semibold text-gray-400">Packing — Pending</h3>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-300
      ${isActive ? "border-blue-300 ring-1 ring-blue-200" : isDone ? "border-green-200" : "border-gray-200"}
    `}>
      {/* Header */}
      <div className={`px-5 py-3.5 flex items-center justify-between
        ${isActive ? "bg-blue-50" : isDone ? "bg-green-50" : "bg-gray-50"}
      `}>
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📦</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Packing</h3>
            <p className="text-xs text-gray-500">
              {isActive ? `${sessions.length} sessions · ${totalHours}h · PKR ${formatCurrency(totalExpenses)} expenses` : ""}
              {isDone ? `Completed · ${sessions.length} sessions` : ""}
              {!isActive && !isDone ? "Ready to start" : ""}
            </p>
          </div>
        </div>
        {isActive && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </span>
        )}
        {isDone && (
          <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">✓ Complete</span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Sessions",  value: sessions.length },
            { label: "Hours",     value: `${totalHours}h` },
            { label: "Expenses",  value: `PKR ${formatCurrency(totalExpenses)}` },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
              <p className="text-base font-bold text-gray-900 tabular-nums">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Cost breakdown — only show if packing rates exist */}
        {hasPacking && (
          <div className="bg-gray-50 rounded-lg p-3.5 space-y-1.5">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Pack Cost Breakdown</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Party Charge</span>
              <span className="font-semibold text-gray-900 tabular-nums">PKR {formatCurrency(packParty)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Labor Cost</span>
              <span className="font-semibold text-orange-600 tabular-nums">PKR {formatCurrency(packLabor)}</span>
            </div>
          </div>
        )}

        {/* Expenses list */}
        {expenses.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Expenses (Draft) — PKR {formatCurrency(totalExpenses)}
            </p>
            <div className="space-y-1.5">
              {expenses.map(e => (
                <div key={e.id} className="flex items-center justify-between text-xs bg-orange-50 rounded-lg px-3 py-2">
                  <span className="text-gray-700">{e.description ?? "Expense"}</span>
                  <span className="font-semibold text-orange-700">PKR {formatCurrency(e.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {isActive && (
            <button
              onClick={onLogSession}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + Log Session
            </button>
          )}
          {(isActive || (isReachable && !isDone)) && (
            <OrderStatusSelect
              orderId={order.id}
              currentStatus={order.status}
              onChange={onStatusChange}
              compact
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git commit -m "feat: packing stage card with expenses + cost breakdown"
```

---

## Task 6: Frontend — Dispatch Stage Card

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Write `DispatchCard` component**

```tsx
function DispatchCard({
  order, bill, router
}: {
  order: Order;
  bill: Bill | null;
  router: ReturnType<typeof useRouter>;
}) {
  const isReady      = ["packing_complete","dispatched"].includes(order.status);
  const isDispatched = order.status === "dispatched";

  if (!isReady) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 opacity-50">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🚚</span>
          <h3 className="text-sm font-semibold text-gray-400">Dispatch & Bill — Pending</h3>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden
      ${isDispatched ? "border-green-200" : "border-amber-200"}
    `}>
      <div className={`px-5 py-3.5 flex items-center justify-between
        ${isDispatched ? "bg-green-50" : "bg-amber-50"}
      `}>
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🚚</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Dispatch &amp; Bill</h3>
            <p className="text-xs text-gray-500">
              {isDispatched ? `Dispatched on ${formatDate(order.dispatch_date)}` : "Ready to dispatch"}
            </p>
          </div>
        </div>
        {isDispatched
          ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">✓ Dispatched</span>
          : <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Action Required
            </span>
        }
      </div>

      <div className="p-5 space-y-4">
        {bill ? (
          /* Bill exists */
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Bill #",      value: bill.bill_number },
                { label: "Amount",      value: `PKR ${formatCurrency(bill.amount_due)}` },
                { label: "Status",      value: bill.payment_status.toUpperCase() },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-sm font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/bills/${bill.id}`)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                View Bill
              </button>
              {bill.payment_status !== "paid" && (
                <button
                  onClick={() => router.push(`/bills/${bill.id}`)}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Record Payment
                </button>
              )}
            </div>
          </div>
        ) : (
          /* No bill yet */
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-4">
              Order is ready — create a bill to mark as dispatched
            </p>
            <button
              onClick={() => router.push(`/bills/new?order=${order.id}`)}
              className="px-6 py-2.5 bg-[#1a2744] text-white rounded-lg text-sm font-semibold hover:bg-[#253461] transition-colors"
            >
              Create Bill
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git commit -m "feat: dispatch stage card with bill status + create bill CTA"
```

---

## Task 7: Frontend — Cost Summary Footer Panel

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Write `CostSummaryPanel` component**

```tsx
function CostSummaryPanel({
  order, expenses, bill
}: {
  order: Order;
  expenses: Expense[];
  bill: Bill | null;
}) {
  const qty        = order.total_quantity;
  const stitchParty = order.stitch_rate_party * qty;
  const stitchLabor = order.stitch_rate_labor * qty;
  const packParty   = (order.pack_rate_party ?? 0) * qty;
  const packLabor   = (order.pack_rate_labor ?? 0) * qty;
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const transport  = Number(order.transport_expense ?? 0);
  const loading    = Number(order.loading_expense ?? 0);
  const misc       = Number(order.miscellaneous_expense ?? 0);
  const rent       = Number(order.rent ?? 0);
  const loadCharges= Number(order.loading_charges ?? 0);

  const totalIncome = stitchParty + packParty;
  const totalLabor  = stitchLabor + packLabor;
  const totalOps    = transport + loading + misc + rent + loadCharges + totalExpenses;
  const netProfit   = totalIncome - totalLabor - totalOps;
  const billed      = bill ? Number(bill.amount_due) : 0;
  const paid        = bill ? Number(bill.amount_paid) : 0;

  const cols: { label: string; value: number; color: string }[] = [
    { label: "Income (Party)",  value: totalIncome,  color: "text-green-600" },
    { label: "Labor Cost",      value: totalLabor,   color: "text-orange-600" },
    { label: "Expenses",        value: totalOps,     color: "text-red-500" },
    { label: "Net Profit",      value: netProfit,    color: netProfit >= 0 ? "text-green-700" : "text-red-700" },
    { label: "Billed",          value: billed,       color: "text-blue-600" },
    { label: "Collected",       value: paid,         color: "text-green-600" },
  ];

  return (
    <div className="bg-[#1a2744] rounded-xl p-5 text-white">
      <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider mb-4">Cost Summary</p>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
        {cols.map(c => (
          <div key={c.label} className="text-center">
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>
              PKR {formatCurrency(c.value)}
            </p>
            <p className="text-xs text-blue-300 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git commit -m "feat: cost summary panel - income vs labor vs expenses vs billed"
```

---

## Task 8: Frontend — Wire Everything Into Order Detail Page

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Add state + data loading for expenses and bill**

In `OrderDetailPage`, add:
```typescript
const [expenses, setExpenses] = useState<Expense[]>([]);
const [bill, setBill] = useState<Bill | null>(null);
```

In the `useEffect` that loads data, add:
```typescript
expensesService.listByOrder(id).then(r => setExpenses(r.data)).catch(() => {});
billService.getByOrder(id).then(setBill).catch(() => {});
```

**Step 2: Restructure the JSX layout**

Replace the current layout with:

```tsx
return (
  <div className="space-y-5">
    {/* Back + actions bar */}
    <div className="flex items-center justify-between">
      <button onClick={() => router.push("/orders")} ...>← Orders</button>
      <div className="flex items-center gap-2">
        <h1>{order.order_number}</h1>
        <StatusBadge status={order.status} />
        <Button size="sm" onClick={() => setEditSheet(true)}>Edit</Button>
        {/* Clone + Delete buttons */}
      </div>
    </div>

    {/* Party + description header */}
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-bold text-gray-900">{order.party_name}</p>
          <p className="text-sm text-gray-500">{order.goods_description}</p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-right">
          <InfoCard label="Qty"      value={order.total_quantity.toLocaleString()} />
          <InfoCard label="Entry"    value={formatDate(order.entry_date)} />
          <InfoCard label="Delivery" value={formatDate(order.delivery_date)} />
        </div>
      </div>
    </div>

    {/* PIPELINE */}
    <PipelineHeader order={order} />

    {/* STAGE CARDS */}
    <StitchingCard
      order={order}
      sessions={stitchSessions}
      onLogSession={() => setSessionSheet("stitching")}
      onStatusChange={setOrder}
    />

    <PackingCard
      order={order}
      sessions={packSessions}
      expenses={expenses}
      onLogSession={() => setSessionSheet("packing")}
      onStatusChange={setOrder}
    />

    <DispatchCard order={order} bill={bill} router={router} />

    {/* MATERIAL REQUIREMENTS */}
    <MaterialRequirementsPanel materials={materials} />

    {/* COST SUMMARY */}
    <CostSummaryPanel order={order} expenses={expenses} bill={bill} />

    {/* Sheets + Dialogs (unchanged) */}
    ...
  </div>
);
```

**Step 3: Remove old tabs section** (stitching/packing/transactions tabs) — it's now replaced by stage cards. Keep all the Sheet components (they still open via stage card buttons).

**Step 4: Run build**
```bash
cd frontend && npm run build
```
Fix any TypeScript errors.

**Step 5: Commit**
```bash
git commit -m "feat: order detail page - full lifecycle pipeline redesign"
```

---

## Task 9: Deploy

**Step 1: Push and verify**
```bash
git push origin master
cd frontend && npx vercel --prod
```

**Step 2: Smoke test in browser**
- Open an order in `stitching_in_progress` status → Stitching card should pulse blue
- Open an order in `packing_complete` status → Dispatch card should show Create Bill
- Open a dispatched order → all stages green, bill card shows bill info

---

## Notes for Implementer

- `OrderStatusSelect` already exists in `frontend/src/components/orders/` — check if it supports a `compact` prop; if not, just use it as-is inline
- The `Expense` type may already be in `types.ts` — check before adding
- `formatCurrency` and `formatDate` are in `frontend/src/hooks/utils.ts`
- Do NOT remove the existing Sheets (SessionForm, TransactionForm, OrderForm) — they are still used by stage card action buttons
- The `IncomeSummary` component is replaced by `CostSummaryPanel` — remove `IncomeSummary` from the JSX but keep its logic folded into `CostSummaryPanel`
- Keep `MaterialRequirementsPanel` as-is — just relocate it in the layout
