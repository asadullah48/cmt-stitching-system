# Party Statement Share Links Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow generating a shareable, read-only, token-based URL for a party's ledger statement (filtered by date range) that can be sent via WhatsApp, with live data that auto-reflects edits.

**Architecture:** New `cmt_share_links` DB table stores UUID tokens scoped to party + date range. A public backend endpoint `/api/v1/public/statement/{token}` requires no auth and returns filtered transactions. The frontend has a `/share/[token]` public page (no sidebar/auth) and a "Share Statement" slide-in sheet on the ledger page triggered when a party filter is active.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend), Next.js 15 + TailwindCSS v4 + TypeScript (frontend)

---

### Task 1: Migration — create cmt_share_links table

**Files:**
- Create: `C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\r8m9n0o1p2q3_add_share_links.py`

**Step 1: Write the migration file**

```python
"""add share links table

Revision ID: r8m9n0o1p2q3
Revises: q7l8m9n0o1p2
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'r8m9n0o1p2q3'
down_revision = 'q7l8m9n0o1p2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cmt_share_links',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('token', UUID(as_uuid=True), nullable=False, unique=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('party_id', UUID(as_uuid=True), sa.ForeignKey('cmt_parties.id'), nullable=False),
        sa.Column('date_from', sa.Date(), nullable=False),
        sa.Column('date_to', sa.Date(), nullable=False),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('is_revoked', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.create_index('ix_cmt_share_links_token', 'cmt_share_links', ['token'], unique=True)
    op.create_index('ix_cmt_share_links_party_id', 'cmt_share_links', ['party_id'])


def downgrade() -> None:
    op.drop_index('ix_cmt_share_links_party_id', table_name='cmt_share_links')
    op.drop_index('ix_cmt_share_links_token', table_name='cmt_share_links')
    op.drop_table('cmt_share_links')
```

**Step 2: Run migration**

```bash
cd C:\Users\Asad\cmt-stitching-system\backend
alembic upgrade head
```

Expected: `Running upgrade q7l8m9n0o1p2 -> r8m9n0o1p2q3`

**Step 3: Commit**

```bash
git add C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\r8m9n0o1p2q3_add_share_links.py
git commit -m "feat: migration — add cmt_share_links table"
```

---

### Task 2: Backend model + schema

**Files:**
- Create: `C:\Users\Asad\cmt-stitching-system\backend\app\models\share_link.py`
- Create: `C:\Users\Asad\cmt-stitching-system\backend\app\schemas\share_link.py`

**Step 1: Create the model**

`backend/app/models/share_link.py`:

```python
import uuid
from sqlalchemy import Column, Boolean, Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class ShareLink(Base):
    __tablename__ = "cmt_share_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token = Column(UUID(as_uuid=True), nullable=False, unique=True, default=uuid.uuid4)
    party_id = Column(UUID(as_uuid=True), ForeignKey("cmt_parties.id"), nullable=False)
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_revoked = Column(Boolean, nullable=False, default=False)

    party = relationship("Party")
    creator = relationship("User")
```

**Step 2: Create the schemas**

`backend/app/schemas/share_link.py`:

```python
from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, model_validator


class ShareLinkCreate(BaseModel):
    party_id: UUID
    date_from: date
    date_to: date

    @model_validator(mode="after")
    def date_range_valid(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        return self


class ShareLinkOut(BaseModel):
    id: UUID
    token: UUID
    party_id: UUID
    party_name: Optional[str] = None
    date_from: date
    date_to: date
    created_at: datetime
    is_revoked: bool

    model_config = {"from_attributes": True}


class ShareLinkListResponse(BaseModel):
    data: list[ShareLinkOut]
    total: int


class PublicTransactionRow(BaseModel):
    transaction_date: date
    transaction_type: str
    description: Optional[str] = None
    reference_number: Optional[str] = None
    payment_method: Optional[str] = None
    debit: Optional[float] = None
    credit: Optional[float] = None
    running_balance: float


class PublicStatementOut(BaseModel):
    party_name: str
    date_from: date
    date_to: date
    transactions: list[PublicTransactionRow]
    total_debit: float
    total_credit: float
    outstanding_balance: float
```

**Step 3: Commit**

```bash
git add backend/app/models/share_link.py backend/app/schemas/share_link.py
git commit -m "feat: share link model and schemas"
```

---

### Task 3: Backend service + endpoint + router registration

**Files:**
- Create: `C:\Users\Asad\cmt-stitching-system\backend\app\api\v1\endpoints\share_links.py`
- Modify: `C:\Users\Asad\cmt-stitching-system\backend\app\api\v1\router.py`

**Step 1: Create the endpoint file**

`backend/app/api/v1/endpoints/share_links.py`:

```python
from datetime import date as date_type
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import CurrentUser, DbDep
from app.models.share_link import ShareLink
from app.models.financial import FinancialTransaction
from app.models.parties import Party
from app.schemas.share_link import (
    ShareLinkCreate, ShareLinkOut, ShareLinkListResponse,
    PublicStatementOut, PublicTransactionRow,
)

router = APIRouter(tags=["share-links"])


# ── Helpers ──────────────────────────────────────────────────────────────────

DEBIT_TYPES = {"income", "expense", "purchase", "stock_consumption"}


def _to_out(link: ShareLink) -> ShareLinkOut:
    return ShareLinkOut(
        id=link.id,
        token=link.token,
        party_id=link.party_id,
        party_name=link.party.name if link.party else None,
        date_from=link.date_from,
        date_to=link.date_to,
        created_at=link.created_at,
        is_revoked=link.is_revoked,
    )


# ── Authenticated endpoints ───────────────────────────────────────────────────

@router.post("/share-links/", response_model=ShareLinkOut, status_code=201)
def create_share_link(data: ShareLinkCreate, db: DbDep, current_user: CurrentUser):
    """Create a new share link for a party statement."""
    party = db.query(Party).filter(Party.id == data.party_id, Party.is_deleted.is_(False)).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    link = ShareLink(
        party_id=data.party_id,
        date_from=data.date_from,
        date_to=data.date_to,
        created_by=current_user.id,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _to_out(link)


@router.get("/share-links/", response_model=ShareLinkListResponse)
def list_share_links(
    db: DbDep,
    _: CurrentUser,
    party_id: Optional[UUID] = Query(None),
):
    """List all share links, optionally filtered by party."""
    q = db.query(ShareLink)
    if party_id:
        q = q.filter(ShareLink.party_id == party_id)
    links = q.order_by(ShareLink.created_at.desc()).all()
    return ShareLinkListResponse(data=[_to_out(l) for l in links], total=len(links))


@router.delete("/share-links/{link_id}", status_code=204)
def revoke_share_link(link_id: UUID, db: DbDep, _: CurrentUser):
    """Revoke (soft-disable) a share link."""
    link = db.query(ShareLink).filter(ShareLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    link.is_revoked = True
    db.commit()


# ── Public endpoint (no auth) ─────────────────────────────────────────────────

@router.get("/public/statement/{token}", response_model=PublicStatementOut)
def get_public_statement(token: UUID, db: DbDep):
    """Public read-only party statement. No authentication required."""
    link = (
        db.query(ShareLink)
        .filter(ShareLink.token == token, ShareLink.is_revoked.is_(False))
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="This link is invalid or has been revoked.")

    party = db.query(Party).filter(Party.id == link.party_id).first()
    party_name = party.name if party else "Unknown Party"

    txns = (
        db.query(FinancialTransaction)
        .filter(
            FinancialTransaction.party_id == link.party_id,
            FinancialTransaction.transaction_date >= link.date_from,
            FinancialTransaction.transaction_date <= link.date_to,
            FinancialTransaction.is_deleted.is_(False),
        )
        .order_by(FinancialTransaction.transaction_date.asc())
        .all()
    )

    rows = []
    running = 0.0
    total_debit = 0.0
    total_credit = 0.0

    for tx in txns:
        amount = float(tx.amount)
        if tx.transaction_type in DEBIT_TYPES:
            running += amount
            total_debit += amount
            rows.append(PublicTransactionRow(
                transaction_date=tx.transaction_date,
                transaction_type=tx.transaction_type,
                description=tx.description,
                reference_number=tx.reference_number,
                payment_method=tx.payment_method,
                debit=amount,
                credit=None,
                running_balance=running,
            ))
        else:
            running -= amount
            total_credit += amount
            rows.append(PublicTransactionRow(
                transaction_date=tx.transaction_date,
                transaction_type=tx.transaction_type,
                description=tx.description,
                reference_number=tx.reference_number,
                payment_method=tx.payment_method,
                debit=None,
                credit=amount,
                running_balance=running,
            ))

    return PublicStatementOut(
        party_name=party_name,
        date_from=link.date_from,
        date_to=link.date_to,
        transactions=rows,
        total_debit=total_debit,
        total_credit=total_credit,
        outstanding_balance=running,
    )
```

**Step 2: Register in router.py**

In `backend/app/api/v1/router.py`, add:

```python
from .endpoints.share_links import router as share_links_router
```

And:

```python
api_router.include_router(share_links_router)
```

**Step 3: Commit**

```bash
git add backend/app/api/v1/endpoints/share_links.py backend/app/api/v1/router.py
git commit -m "feat: share links service and public statement endpoint"
```

---

### Task 4: Frontend service types (services.ts + services.tsx)

**Files:**
- Modify: `C:\Users\Asad\cmt-stitching-system\frontend\src\hooks\services.ts`
- Modify: `C:\Users\Asad\cmt-stitching-system\frontend\src\hooks\services.tsx`

Apply **identical** changes to BOTH files.

**Step 1: Add types and service to services.ts**

After the `billService` section, add:

```typescript
// ─── Share Links ─────────────────────────────────────────────────────────────

export interface ShareLink {
  id: string;
  token: string;
  party_id: string;
  party_name?: string;
  date_from: string;
  date_to: string;
  created_at: string;
  is_revoked: boolean;
}

export interface ShareLinkCreate {
  party_id: string;
  date_from: string;
  date_to: string;
}

export interface PublicTransactionRow {
  transaction_date: string;
  transaction_type: string;
  description?: string;
  reference_number?: string;
  payment_method?: string;
  debit?: number;
  credit?: number;
  running_balance: number;
}

export interface PublicStatementOut {
  party_name: string;
  date_from: string;
  date_to: string;
  transactions: PublicTransactionRow[];
  total_debit: number;
  total_credit: number;
  outstanding_balance: number;
}

export const shareLinksService = {
  create: async (payload: ShareLinkCreate): Promise<ShareLink> => {
    const { data } = await api.post<ShareLink>('/share-links/', payload);
    return data;
  },

  listByParty: async (party_id: string): Promise<ShareLink[]> => {
    const { data } = await api.get<{ data: ShareLink[]; total: number }>('/share-links/', { params: { party_id } });
    return data.data;
  },

  revoke: async (id: string): Promise<void> => {
    await api.delete(`/share-links/${id}`);
  },

  getPublicStatement: async (token: string): Promise<PublicStatementOut> => {
    const { data } = await api.get<PublicStatementOut>(`/public/statement/${token}`);
    return data;
  },
};
```

**Step 2: Apply the same block to services.tsx**

**Step 3: Commit**

```bash
git add frontend/src/hooks/services.ts frontend/src/hooks/services.tsx
git commit -m "feat: share link types and service in hooks"
```

---

### Task 5: Public statement page /share/[token]

**Files:**
- Create: `C:\Users\Asad\cmt-stitching-system\frontend\src\app\share\[token]\page.tsx`

This page lives outside the `(dashboard)` route group — no sidebar, no auth required.

**Step 1: Create the directory and file**

`frontend/src/app/share/[token]/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { shareLinksService, PublicStatementOut } from "@/hooks/services";
import { formatDate, formatCurrency } from "@/hooks/utils";

const DEBIT_TYPES = new Set(["income", "expense", "purchase", "stock_consumption"]);

export default function PublicStatementPage() {
  const { token } = useParams<{ token: string }>();
  const [statement, setStatement] = useState<PublicStatementOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    shareLinksService.getPublicStatement(token)
      .then(setStatement)
      .catch(() => setError("This link is invalid or has been revoked."))
      .finally(() => setLoading(false));
  }, [token]);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !statement) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center max-w-md">
          <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <h1 className="text-lg font-semibold text-gray-800 mb-2">Link Not Found</h1>
          <p className="text-sm text-gray-500">{error || "This statement link is invalid or has been revoked."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:p-0 print:bg-white">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-[#1a2744] rounded-2xl px-6 py-5 print:rounded-none print:border-b print:border-gray-300 print:bg-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-white print:text-gray-900">Account Statement</h1>
              <p className="text-blue-300 text-sm mt-0.5 print:text-gray-500">CMT Stitching System</p>
            </div>
            <div className="text-right">
              <p className="text-white font-semibold print:text-gray-900">{statement.party_name}</p>
              <p className="text-blue-200 text-xs mt-0.5 print:text-gray-500">
                {formatDate(statement.date_from)} — {formatDate(statement.date_to)}
              </p>
              <p className="text-blue-300 text-xs mt-0.5 print:text-gray-400">Generated: {today}</p>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-gray-500">Total Debit:</span>
            <span className="text-sm font-bold text-red-600">PKR {formatCurrency(statement.total_debit)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-500">Total Credit:</span>
            <span className="text-sm font-bold text-green-600">PKR {formatCurrency(statement.total_credit)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Outstanding:</span>
            <span className={`text-sm font-bold ${statement.outstanding_balance > 0 ? "text-orange-600" : "text-green-600"}`}>
              PKR {formatCurrency(Math.abs(statement.outstanding_balance))}
              {statement.outstanding_balance <= 0 ? " (settled)" : ""}
            </span>
          </div>
          <button
            onClick={() => window.print()}
            className="ml-auto px-3 py-1 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 print:hidden"
          >
            Print
          </button>
        </div>

        {/* Transactions table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {statement.transactions.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              No transactions found for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Description</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Ref #</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Debit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Credit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statement.transactions.map((tx, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">{formatDate(tx.transaction_date)}</td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-[220px]">
                        <span className="block truncate">{tx.description || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{tx.reference_number || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {tx.debit != null
                          ? <span className="text-red-600 font-medium">{formatCurrency(tx.debit)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {tx.credit != null
                          ? <span className="text-green-600 font-medium">{formatCurrency(tx.credit)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${tx.running_balance >= 0 ? "text-gray-900" : "text-red-600"}`}>
                        {formatCurrency(tx.running_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#1a2744] text-white font-bold">
                    <td className="px-4 py-3" colSpan={3}>Outstanding Balance</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-300">{formatCurrency(statement.total_debit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-300">{formatCurrency(statement.total_credit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-lg">
                      PKR {formatCurrency(Math.abs(statement.outstanding_balance))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          This is a read-only computer-generated statement · CMT Stitching System
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add "frontend/src/app/share/[token]/page.tsx"
git commit -m "feat: public statement page /share/[token]"
```

---

### Task 6: Share sheet on ledger page

**Files:**
- Modify: `C:\Users\Asad\cmt-stitching-system\frontend\src\app\(dashboard)\ledger\page.tsx`

**Step 1: Read the file**

Read the full file first to understand the current state.

**Step 2: Add imports and state**

Add to existing imports:
```typescript
import { shareLinksService, ShareLink, ShareLinkCreate } from "@/hooks/services";
```

Add new state variables inside `LedgerPage` after existing state:
```typescript
const [shareSheetOpen, setShareSheetOpen] = useState(false);
const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
const [shareForm, setShareForm] = useState<ShareLinkCreate>({
  party_id: "",
  date_from: "",
  date_to: "",
});
const [sharingLoading, setSharingLoading] = useState(false);
const [newLink, setNewLink] = useState<ShareLink | null>(null);
```

**Step 3: Add loadShareLinks helper**

After the `load` callback, add:
```typescript
const loadShareLinks = useCallback(async (partyId: string) => {
  try {
    setShareLinks(await shareLinksService.listByParty(partyId));
  } catch { /* ignore */ }
}, []);
```

**Step 4: Sync shareForm.party_id with party filter**

Add a useEffect that watches `filters.party_id` to keep the share form in sync:
```typescript
useEffect(() => {
  setShareForm((f) => ({ ...f, party_id: filters.party_id ?? "" }));
  setNewLink(null);
  if (filters.party_id) loadShareLinks(filters.party_id);
  else setShareLinks([]);
}, [filters.party_id, loadShareLinks]);
```

**Step 5: Add handleCreateShareLink**

```typescript
const handleCreateShareLink = async () => {
  if (!shareForm.party_id || !shareForm.date_from || !shareForm.date_to) return;
  setSharingLoading(true);
  try {
    const link = await shareLinksService.create(shareForm);
    setNewLink(link);
    loadShareLinks(shareForm.party_id);
  } catch {
    alert("Failed to create share link.");
  } finally {
    setSharingLoading(false);
  }
};

const handleRevokeLink = async (id: string) => {
  if (!confirm("Revoke this link? Anyone with the URL will lose access.")) return;
  try {
    await shareLinksService.revoke(id);
    if (shareForm.party_id) loadShareLinks(shareForm.party_id);
    if (newLink?.id === id) setNewLink(null);
  } catch {
    alert("Failed to revoke link.");
  }
};
```

**Step 6: Add "Share Statement" button in the header**

In the header `<div className="flex items-center gap-2">`, add a Share button right before the "New Transaction" button. Only enabled when `filters.party_id` is set:

```tsx
<Button
  variant="secondary"
  size="sm"
  onClick={() => setShareSheetOpen(true)}
  disabled={!filters.party_id}
  title={!filters.party_id ? "Select a party to share their statement" : "Share party statement"}
  className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 disabled:opacity-40"
>
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
  Share
</Button>
```

**Step 7: Add the Share Sheet JSX**

At the bottom of the component (before the closing `</div>`), after the existing sheets, add:

```tsx
<Sheet open={shareSheetOpen} onClose={() => { setShareSheetOpen(false); setNewLink(null); }} title="Share Statement">
  <div className="space-y-5 p-1">
    <p className="text-sm text-gray-500">
      Generate a read-only link for{" "}
      <span className="font-medium text-gray-800">
        {parties.find((p) => p.id === filters.party_id)?.name ?? "this party"}
      </span>
      . Anyone with the link can view the statement without logging in.
    </p>

    {/* Date range */}
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
        <input
          type="date"
          value={shareForm.date_from}
          onChange={(e) => setShareForm((f) => ({ ...f, date_from: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
        <input
          type="date"
          value={shareForm.date_to}
          onChange={(e) => setShareForm((f) => ({ ...f, date_to: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>
    </div>

    <Button
      onClick={handleCreateShareLink}
      disabled={sharingLoading || !shareForm.date_from || !shareForm.date_to}
      className="w-full"
    >
      {sharingLoading ? "Generating…" : "Generate Link"}
    </Button>

    {/* Newly created link */}
    {newLink && (() => {
      const url = `${window.location.origin}/share/${newLink.token}`;
      const partyName = parties.find((p) => p.id === newLink.party_id)?.name ?? "Party";
      const waText = encodeURIComponent(
        `Dear ${partyName},\n\nPlease find your account statement for the period ${newLink.date_from} to ${newLink.date_to}:\n${url}\n\nThis is a read-only link.`
      );
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Link Ready</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              className="flex-1 text-xs border border-blue-200 rounded-lg px-3 py-2 bg-white text-gray-700 truncate"
            />
            <button
              onClick={() => navigator.clipboard.writeText(url)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
            >
              Copy
            </button>
          </div>
          <a
            href={`https://wa.me/?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.857L.057 23.882l6.187-1.623A11.935 11.935 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.805 9.805 0 01-5.034-1.388l-.361-.214-3.732.979 1.001-3.641-.235-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
            </svg>
            Share on WhatsApp
          </a>
        </div>
      );
    })()}

    {/* Existing links */}
    {shareLinks.length > 0 && (
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Links</p>
        <div className="space-y-2">
          {shareLinks.filter((l) => !l.is_revoked).map((l) => (
            <div key={l.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="text-xs font-medium text-gray-700">{l.date_from} → {l.date_to}</p>
              </div>
              <button
                onClick={() => handleRevokeLink(l.id)}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Revoke
              </button>
            </div>
          ))}
          {shareLinks.filter((l) => !l.is_revoked).length === 0 && (
            <p className="text-xs text-gray-400 italic">No active links for this party.</p>
          )}
        </div>
      </div>
    )}
  </div>
</Sheet>
```

**Step 8: Commit**

```bash
git add "frontend/src/app/(dashboard)/ledger/page.tsx"
git commit -m "feat: share statement sheet with WhatsApp button on ledger page"
```

---

### Task 7: Deploy

```bash
cd C:\Users\Asad\cmt-stitching-system
git push origin master
cd frontend && vercel --prod
```

---

## Summary of all changed files

| File | Change |
|------|--------|
| `backend/alembic/versions/r8m9n0o1p2q3_add_share_links.py` | New migration |
| `backend/app/models/share_link.py` | New ShareLink model |
| `backend/app/schemas/share_link.py` | New schemas |
| `backend/app/api/v1/endpoints/share_links.py` | 4 endpoints (3 auth + 1 public) |
| `backend/app/api/v1/router.py` | Register share_links_router |
| `frontend/src/hooks/services.ts` | ShareLink types + shareLinksService |
| `frontend/src/hooks/services.tsx` | Same |
| `frontend/src/app/share/[token]/page.tsx` | Public statement page |
| `frontend/src/app/(dashboard)/ledger/page.tsx` | Share button + sheet + WhatsApp |
