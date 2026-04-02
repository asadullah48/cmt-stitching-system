import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional
from uuid import UUID
import uuid

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status as http_status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, DbDep
from app.models.inventory import InventoryItem, InventoryTransaction
from app.models.orders import Order
from app.models.parties import Party as PartyModel
from app.models.products import Product, ProductBOMItem
from app.schemas.orders import (
    OrderCreate, OrderUpdate, OrderStatusUpdate,
    OrderOut, OrderListResponse, OrderItemCreate, OrderItemUpdate,
    SubOrderStageAdvance,
)
from app.schemas.products import OrderMaterialsOut, MaterialRequirement
from app.services.order_service import OrderService
from app.services.audit_service import AuditService

router = APIRouter(prefix="/orders", tags=["orders"])


def _to_out(order) -> OrderOut:
    return OrderOut(
        id=order.id,
        order_number=order.order_number,
        party_id=order.party_id,
        party_name=order.party.name if order.party else None,
        party_reference=order.party_reference,
        goods_description=order.goods_description,
        total_quantity=order.total_quantity,
        stitch_rate_party=order.stitch_rate_party,
        stitch_rate_labor=order.stitch_rate_labor,
        pack_rate_party=order.pack_rate_party,
        pack_rate_labor=order.pack_rate_labor,
        status=order.status,
        entry_date=order.entry_date,
        arrival_date=order.arrival_date,
        delivery_date=order.delivery_date,
        estimated_completion=order.estimated_completion,
        actual_completion=order.actual_completion,
        carrier=order.carrier,
        tracking_number=order.tracking_number,
        dispatch_date=order.dispatch_date,
        carton_count=order.carton_count,
        total_weight=order.total_weight,
        transport_expense=order.transport_expense,
        loading_expense=order.loading_expense,
        miscellaneous_expense=order.miscellaneous_expense,
        rent=order.rent,
        loading_charges=order.loading_charges,
        product_id=order.product_id,
        product_name=order.product.name if order.product else None,
        lot_number=order.lot_number,
        sub_suffix=order.sub_suffix,
        parent_order_id=order.parent_order_id,
        sub_stages=order.sub_stages,
        current_stage=order.current_stage,
        items=order.items,
    )


@router.get("/", response_model=OrderListResponse)
def list_orders(
    db: DbDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    party_id: Optional[UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
):
    orders, total = OrderService.get_all(db, page, size, status, party_id, date_from, date_to, search)
    return OrderListResponse(data=[_to_out(o) for o in orders], total=total, page=page, size=size)


@router.post("/", response_model=OrderOut, status_code=201)
def create_order(data: OrderCreate, db: DbDep, current_user: CurrentUser):
    order = OrderService.create(db, data, current_user.id)
    return _to_out(order)


# ── Bulk Import ──────────────────────────────────────────────────────────────
# IMPORTANT: This route must remain above /{order_id} routes to avoid
# FastAPI interpreting "bulk-import" as an order_id path parameter.

class BulkImportResult(BaseModel):
    created: int
    errors: list[dict]


def _parse_decimal(value: str, field: str) -> Decimal:
    """Parse a string to Decimal, raising ValueError with a helpful message."""
    try:
        return Decimal(value.strip())
    except InvalidOperation:
        raise ValueError(f"'{field}' must be a valid number (got: {value!r})")


def _parse_date(value: str, field: str) -> date:
    """Parse common date formats (YYYY-MM-DD or DD/MM/YYYY)."""
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"'{field}' must be a date (YYYY-MM-DD), got: {value!r}")


@router.post("/bulk-import", response_model=BulkImportResult, status_code=200)
async def bulk_import_orders(
    db: DbDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    """
    Accept a CSV file upload and bulk-create orders from it.

    Expected CSV columns (header row required):
        party_name, goods_description, total_quantity,
        stitch_rate_party, stitch_rate_labor,
        pack_rate_party (optional), pack_rate_labor (optional),
        entry_date (optional, defaults to today, YYYY-MM-DD),
        delivery_date (optional), notes (optional)

    Returns { created: N, errors: [{row: N, message: "..."}] }.
    Rows with errors are skipped; valid rows are always committed.
    """
    # Read uploaded file bytes
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM from Excel CSV exports
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    # Normalise header names: strip whitespace, lowercase
    if reader.fieldnames is None:
        return BulkImportResult(created=0, errors=[{"row": 0, "message": "Empty or unreadable CSV file"}])

    fieldnames_normalised = [f.strip().lower() for f in reader.fieldnames]
    reader.fieldnames = fieldnames_normalised  # type: ignore[assignment]

    required_cols = {"party_name", "goods_description", "total_quantity", "stitch_rate_party", "stitch_rate_labor"}
    missing_cols = required_cols - set(fieldnames_normalised)
    if missing_cols:
        return BulkImportResult(
            created=0,
            errors=[{"row": 0, "message": f"CSV missing required columns: {', '.join(sorted(missing_cols))}"}],
        )

    today = date.today()
    created = 0
    errors: list[dict] = []

    for row_num, raw_row in enumerate(reader, start=2):  # row 1 is header
        # Strip whitespace from all values
        row = {k: (v.strip() if v else "") for k, v in raw_row.items()}

        party_name = row.get("party_name", "")
        goods_description = row.get("goods_description", "")

        # Skip completely blank rows (e.g. trailing newlines in CSV)
        if not party_name and not goods_description:
            continue

        try:
            # ── Validate required fields ──────────────────────────────────
            if not party_name:
                raise ValueError("'party_name' is required")
            if not goods_description:
                raise ValueError("'goods_description' is required")

            qty_raw = row.get("total_quantity", "")
            if not qty_raw:
                raise ValueError("'total_quantity' is required")
            try:
                total_quantity = int(qty_raw)
            except ValueError:
                raise ValueError(f"'total_quantity' must be an integer (got: {qty_raw!r})")
            if total_quantity <= 0:
                raise ValueError(f"'total_quantity' must be > 0 (got: {total_quantity})")

            stitch_rate_party = _parse_decimal(row.get("stitch_rate_party", ""), "stitch_rate_party")
            stitch_rate_labor = _parse_decimal(row.get("stitch_rate_labor", ""), "stitch_rate_labor")

            # ── Optional pack rates — must both be present or both absent ──
            pack_rate_party_raw = row.get("pack_rate_party", "")
            pack_rate_labor_raw = row.get("pack_rate_labor", "")
            pack_rate_party: Optional[Decimal] = None
            pack_rate_labor: Optional[Decimal] = None
            if pack_rate_party_raw or pack_rate_labor_raw:
                if pack_rate_party_raw and pack_rate_labor_raw:
                    pack_rate_party = _parse_decimal(pack_rate_party_raw, "pack_rate_party")
                    pack_rate_labor = _parse_decimal(pack_rate_labor_raw, "pack_rate_labor")
                elif pack_rate_party_raw and not pack_rate_labor_raw:
                    raise ValueError("'pack_rate_labor' must be provided when 'pack_rate_party' is set")
                else:
                    raise ValueError("'pack_rate_party' must be provided when 'pack_rate_labor' is set")

            # ── Optional dates ────────────────────────────────────────────
            entry_date_raw = row.get("entry_date", "")
            entry_date = _parse_date(entry_date_raw, "entry_date") if entry_date_raw else today

            delivery_date_raw = row.get("delivery_date", "")
            delivery_date: Optional[date] = _parse_date(delivery_date_raw, "delivery_date") if delivery_date_raw else None

            # ── Find or create party by name ───────────────────────────────
            party = db.query(PartyModel).filter(
                func.lower(PartyModel.name) == party_name.lower(),
                PartyModel.is_deleted.is_(False),
            ).first()
            if not party:
                party = PartyModel(name=party_name, balance=Decimal("0"))
                db.add(party)
                db.flush()  # get party.id without committing

            # ── Build OrderCreate and persist ──────────────────────────────
            order_data = OrderCreate(
                party_id=party.id,
                goods_description=goods_description,
                total_quantity=total_quantity,
                stitch_rate_party=stitch_rate_party,
                stitch_rate_labor=stitch_rate_labor,
                pack_rate_party=pack_rate_party,
                pack_rate_labor=pack_rate_labor,
                entry_date=entry_date,
                delivery_date=delivery_date,
                items=[OrderItemCreate(size="OS", quantity=total_quantity)],
            )
            # OrderService.create commits internally; use a savepoint so a
            # per-row failure does not poison the entire session.
            sp = db.begin_nested()
            try:
                OrderService.create(db, order_data, current_user.id)
                sp.commit()
                created += 1
            except Exception as inner_exc:
                sp.rollback()
                errors.append({"row": row_num, "party": party_name, "message": str(inner_exc)})

        except ValueError as exc:
            errors.append({"row": row_num, "party": party_name, "message": str(exc)})
        except Exception as exc:
            errors.append({"row": row_num, "party": party_name, "message": f"Unexpected error: {exc}"})

    return BulkImportResult(created=created, errors=errors)


@router.get("/{order_id}/materials", response_model=OrderMaterialsOut)
def get_order_materials(order_id: uuid.UUID, db: DbDep, _: CurrentUser):
    """Return per-department BOM material requirements for an order.

    Computes required vs in-stock quantities for each BOM line item linked
    to the order's product. Also flags whether consumption has already been
    recorded (prevents double-counting in the UI).
    """
    order = db.query(Order).filter(
        Order.id == order_id, Order.is_deleted.is_(False)
    ).first()
    if not order:
        raise HTTPException(404, "Order not found")

    # Orders without a product template have no BOM requirements
    if not order.product_id:
        return OrderMaterialsOut(
            product_name=None,
            order_quantity=order.total_quantity,
            stitching=[],
            packing=[],
            stitching_consumed=False,
            packing_consumed=False,
        )

    product = db.query(Product).filter(
        Product.id == order.product_id, Product.is_deleted.is_(False)
    ).first()

    bom_items = db.query(ProductBOMItem).filter(
        ProductBOMItem.product_id == order.product_id,
        ProductBOMItem.is_deleted.is_(False),
    ).all()

    qty = Decimal(str(order.total_quantity))
    stitching_reqs: list[MaterialRequirement] = []
    packing_reqs: list[MaterialRequirement] = []

    for b in bom_items:
        inv = db.query(InventoryItem).filter(
            InventoryItem.id == b.inventory_item_id,
            InventoryItem.is_deleted.is_(False),
        ).first()
        if not inv:
            continue

        # required = (order_qty / covers_quantity) * material_quantity
        required = (qty / Decimal(str(b.covers_quantity))) * Decimal(str(b.material_quantity))
        in_stock = Decimal(str(inv.current_stock))
        shortfall = max(Decimal("0"), required - in_stock)

        req = MaterialRequirement(
            inventory_item_id=b.inventory_item_id,
            inventory_item_name=inv.name,
            unit=inv.unit,
            material_quantity=Decimal(str(b.material_quantity)),
            covers_quantity=Decimal(str(b.covers_quantity)),
            required=required.quantize(Decimal("0.0001")),
            in_stock=in_stock,
            shortfall=shortfall.quantize(Decimal("0.0001")),
            sufficient=shortfall == 0,
            department=b.department,
            notes=b.notes,
        )

        if b.department == "stitching":
            stitching_reqs.append(req)
        else:
            packing_reqs.append(req)

    # Detect whether BOM has already been auto-consumed for this order
    consumed_records = db.query(InventoryTransaction).filter(
        InventoryTransaction.reference_id == order_id,
        InventoryTransaction.reference_type == "order_bom",
    ).all()
    consumed_notes = [r.notes or "" for r in consumed_records]
    stitching_consumed = any("stitching" in n for n in consumed_notes)
    packing_consumed = any("packing" in n for n in consumed_notes)

    return OrderMaterialsOut(
        product_name=product.name if product else None,
        order_quantity=order.total_quantity,
        stitching=stitching_reqs,
        packing=packing_reqs,
        stitching_consumed=stitching_consumed,
        packing_consumed=packing_consumed,
    )


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: UUID, db: DbDep, _: CurrentUser):
    return _to_out(OrderService.get_by_id(db, order_id))


@router.put("/{order_id}", response_model=OrderOut)
def update_order(order_id: UUID, data: OrderUpdate, db: DbDep, current_user: CurrentUser):
    return _to_out(OrderService.update(db, order_id, data, current_user.id))


@router.patch("/{order_id}/items", response_model=OrderOut)
def update_items(order_id: UUID, items: list[OrderItemUpdate], db: DbDep, current_user: CurrentUser):
    """Replace the colour/size breakdown for an order. Preserves stitching/packing progress on matched items."""
    from app.models.orders import OrderItem as OrderItemModel
    order = OrderService.get_by_id(db, order_id)

    existing_by_id = {str(i.id): i for i in order.items}
    incoming_ids = {str(i.id) for i in items if i.id}

    # Delete items not in the new list
    for eid, item in existing_by_id.items():
        if eid not in incoming_ids:
            db.delete(item)

    # Upsert
    for item_data in items:
        if item_data.id and str(item_data.id) in existing_by_id:
            existing = existing_by_id[str(item_data.id)]
            existing.size = item_data.size
            existing.quantity = item_data.quantity
            if item_data.completed_quantity is not None:
                existing.completed_quantity = item_data.completed_quantity
            if item_data.packed_quantity is not None:
                existing.packed_quantity = item_data.packed_quantity
        else:
            db.add(OrderItemModel(order_id=order.id, size=item_data.size, quantity=item_data.quantity))

    AuditService.log_update(db, "cmt_orders", order.id, {}, {"items": "updated"}, current_user.id)
    db.commit()
    db.refresh(order)
    return _to_out(order)


@router.patch("/{order_id}/status", response_model=OrderOut)
def update_status(order_id: UUID, data: OrderStatusUpdate, db: DbDep, current_user: CurrentUser):
    return _to_out(OrderService.update_status(db, order_id, data.status.value, current_user.id))


@router.patch("/{order_id}/advance-stage", response_model=OrderOut)
def advance_sub_order_stage(
    order_id: UUID,
    body: SubOrderStageAdvance,
    db: DbDep,
    _: CurrentUser,
):
    """Set the current_stage on a B sub-order. Stage must be in the order's sub_stages list."""
    from app.schemas.orders import SUB_ORDER_STAGES
    order = db.query(Order).options(
        joinedload(Order.items), joinedload(Order.party), joinedload(Order.product)
    ).filter(Order.id == order_id, Order.is_deleted.is_(False)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.sub_suffix != "B":
        raise HTTPException(status_code=400, detail="Stage advancement is only for B sub-orders")
    if body.stage not in SUB_ORDER_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {SUB_ORDER_STAGES}")
    if order.sub_stages and body.stage not in order.sub_stages:
        raise HTTPException(status_code=400, detail="Stage not in this sub-order's selected stages")
    order.current_stage = body.stage
    db.commit()
    db.refresh(order)
    return _to_out(order)


@router.post("/{order_id}/clone", response_model=OrderOut, status_code=201)
def clone_order(order_id: UUID, db: DbDep, current_user: CurrentUser):
    """Clone an order: copy party, items, rates into a new pending order with today's entry date.
    Bill/payment data and completion/dispatch fields are NOT cloned."""
    source = OrderService.get_by_id(db, order_id)
    clone_data = OrderCreate(
        party_id=source.party_id,
        party_reference=source.party_reference,
        goods_description=source.goods_description,
        total_quantity=source.total_quantity,
        stitch_rate_party=source.stitch_rate_party,
        stitch_rate_labor=source.stitch_rate_labor,
        pack_rate_party=source.pack_rate_party,
        pack_rate_labor=source.pack_rate_labor,
        entry_date=date.today(),
        product_id=source.product_id,
        items=[OrderItemCreate(size=i.size, quantity=i.quantity) for i in source.items],
    )
    new_order = OrderService.create(db, clone_data, current_user.id)
    return _to_out(new_order)


@router.delete("/{order_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_order(order_id: UUID, db: DbDep, current_user: CurrentUser):
    OrderService.soft_delete(db, order_id, current_user.id)


@router.post("/renumber-fix", status_code=200)
def renumber_orders(db: DbDep, current_user: CurrentUser):
    """Admin only: renumber all active orders sequentially per month, starting from 0001."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    from sqlalchemy import text

    # Phase 1: set ALL orders to temp names using UUID suffix (guaranteed unique)
    db.execute(text("UPDATE cmt_orders SET order_number = '__X__' || id::text"))
    db.flush()

    # Phase 2: give soft-deleted orders a DEL- prefix (keeps them out of the way)
    db.execute(text("UPDATE cmt_orders SET order_number = 'DEL-' || id::text WHERE is_deleted = true"))
    db.flush()

    # Phase 3: renumber active orders sequentially per month via window function
    db.execute(text("""
        WITH ranked AS (
            SELECT id,
                   to_char(created_at AT TIME ZONE 'UTC', 'YYYYMM') AS month_key,
                   ROW_NUMBER() OVER (
                       PARTITION BY to_char(created_at AT TIME ZONE 'UTC', 'YYYYMM')
                       ORDER BY created_at
                   ) AS seq
            FROM cmt_orders
            WHERE is_deleted = false
        )
        UPDATE cmt_orders
        SET order_number = 'ORD-' || ranked.month_key || '-' || LPAD(ranked.seq::text, 4, '0')
        FROM ranked
        WHERE cmt_orders.id = ranked.id
    """))

    db.commit()

    rows = db.execute(text(
        "SELECT order_number FROM cmt_orders WHERE is_deleted = false ORDER BY order_number"
    )).fetchall()
    nums = [r[0] for r in rows]
    return {"renumbered": len(nums), "new_numbers": nums}
