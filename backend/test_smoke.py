"""
Smoke test + mock data seed for CMT Stitching System.
Covers every endpoint, reports failures, then deletes all created data.

Usage:
  python test_smoke.py [--base-url URL] [--keep]
  --keep : skip cleanup (leave mock data in DB)
"""

import sys
import json
import argparse
import traceback
from datetime import date, timedelta
import time as _time

try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess; subprocess.run([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

BASE_URL = "https://cmt-backend-5xuu.onrender.com/api/v1"
USERNAME = "admin"
PASSWORD = "admin123"

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
SKIP = "\033[93m~\033[0m"

results = []
created = {
    "party_ids": [],
    "order_ids": [],
    "bill_ids": [],
    "transaction_ids": [],
    "inventory_category_ids": [],
    "inventory_item_ids": [],
    "expense_ids": [],
    "production_ids": [],
    "todo_ids": [],
}

def check(name, resp, expected=(200, 201)):
    ok = resp.status_code in (expected if isinstance(expected, tuple) else (expected,))
    symbol = PASS if ok else FAIL
    try:
        body = resp.json()
    except Exception:
        body = resp.text[:200]
    results.append((name, ok, resp.status_code, body if not ok else None))
    print(f"  {symbol} {name} [{resp.status_code}]" + (f" — {body}" if not ok else ""))
    return body if ok else None


def run(token):
    h = {"Authorization": f"Bearer {token}"}
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    # ── Auth ──────────────────────────────────────────────────────────────────
    print("\n── Auth ──")
    r = requests.get(f"{BASE_URL}/auth/me", headers=h)
    check("GET /auth/me", r)

    # ── Parties ───────────────────────────────────────────────────────────────
    print("\n── Parties ──")
    r = requests.get(f"{BASE_URL}/parties/", headers=h)
    check("GET /parties/", r)

    r = requests.post(f"{BASE_URL}/parties/", headers=h, json={
        "name": "TEST Party Alpha",
        "contact_person": "Test User",
        "phone": "+92 300 0000001",
        "payment_terms": "Net 30",
    })
    party = check("POST /parties/", r, 201)
    if party:
        pid = party["id"]
        created["party_ids"].append(pid)

        r = requests.get(f"{BASE_URL}/parties/{pid}", headers=h)
        check("GET /parties/{id}", r)

        r = requests.put(f"{BASE_URL}/parties/{pid}", headers=h, json={"name": "TEST Party Alpha Updated"})
        check("PUT /parties/{id}", r)

        r = requests.get(f"{BASE_URL}/parties/{pid}/ledger", headers=h)
        check("GET /parties/{id}/ledger", r)

    # ── Orders ────────────────────────────────────────────────────────────────
    print("\n── Orders ──")
    r = requests.get(f"{BASE_URL}/orders/", headers=h)
    check("GET /orders/", r)

    order_payload = {
        "order_number": "TEST-SMOKE-001",
        "party_id": pid if party else None,
        "goods_description": "TEST Smoke Covers",
        "stitch_rate_party": 135,
        "stitch_rate_labor": 100,
        "pack_rate_party": 20,
        "pack_rate_labor": 15,
        "total_quantity": 100,
        "entry_date": today,
        "expected_delivery": today,
        "items": [
            {"size": "Small", "colour": "Red", "quantity": 40},
            {"size": "Large", "colour": "Blue", "quantity": 60},
        ],
    }
    r = requests.post(f"{BASE_URL}/orders/", headers=h, json=order_payload)
    order = check("POST /orders/", r, 201)
    oid = None
    if order:
        oid = order["id"]
        created["order_ids"].append(oid)

        r = requests.get(f"{BASE_URL}/orders/{oid}", headers=h)
        check("GET /orders/{id}", r)

        r = requests.put(f"{BASE_URL}/orders/{oid}", headers=h, json={"goods_description": "TEST Smoke Covers Updated"})
        check("PUT /orders/{id}", r)

        # Status progression
        for status in ["stitching_in_progress", "stitching_complete", "packing_in_progress", "packing_complete"]:
            r = requests.patch(f"{BASE_URL}/orders/{oid}/status", headers=h, json={"status": status})
            check(f"PATCH /orders/status → {status}", r)

    # ── Production ────────────────────────────────────────────────────────────
    print("\n── Production ──")
    if oid:
        r = requests.post(f"{BASE_URL}/production/", headers=h, json={
            "order_id": oid,
            "department": "stitching",
            "machines_used": 5,
            "session_date": today,
            "notes": "TEST smoke session",
        })
        prod = check("POST /production/", r, 201)
        if prod:
            created["production_ids"].append(prod["id"])

        r = requests.get(f"{BASE_URL}/production/{oid}", headers=h)
        check("GET /production/{order_id}", r)

    # ── Inventory ─────────────────────────────────────────────────────────────
    print("\n── Inventory ──")
    r = requests.get(f"{BASE_URL}/inventory/categories", headers=h)
    check("GET /inventory/categories", r)

    r = requests.post(f"{BASE_URL}/inventory/categories", headers=h, json={
        "name": "TEST Category Zips",
        "category_type": "accessories",
    })
    cat = check("POST /inventory/categories", r, 201)
    cat_id = None
    if cat:
        cat_id = cat["id"]
        created["inventory_category_ids"].append(cat_id)

    r = requests.get(f"{BASE_URL}/inventory/items", headers=h)
    check("GET /inventory/items", r)

    item_payload = {
        "name": "TEST Zip 10cm",
        "category_id": cat_id,
        "sku": f"TEST-ZIP-{int(_time.time())}",
        "unit": "pcs",
        "current_stock": 500,
        "minimum_stock": 50,
        "cost_per_unit": 34,
        "location": "Rack A",
        "condition": "good",
    }
    r = requests.post(f"{BASE_URL}/inventory/items", headers=h, json=item_payload)
    inv = check("POST /inventory/items", r, 201)
    inv_id = None
    if inv:
        inv_id = inv["id"]
        created["inventory_item_ids"].append(inv_id)

        # Stock in
        r = requests.patch(f"{BASE_URL}/inventory/items/{inv_id}/adjust", headers=h, json={
            "quantity": 200,
            "transaction_date": today,
            "notes": "TEST stock in",
        })
        check("PATCH /inventory/adjust (stock in)", r)

        # Stock out
        r = requests.patch(f"{BASE_URL}/inventory/items/{inv_id}/adjust", headers=h, json={
            "quantity": -50,
            "transaction_date": today,
            "notes": "TEST stock out",
        })
        check("PATCH /inventory/adjust (stock out)", r)

        # Edit item
        r = requests.put(f"{BASE_URL}/inventory/items/{inv_id}", headers=h, json={**item_payload, "minimum_stock": 100})
        check("PUT /inventory/items/{id}", r)

    # ── Transactions (all types) ───────────────────────────────────────────────
    print("\n── Transactions ──")
    r = requests.get(f"{BASE_URL}/transactions/", headers=h)
    check("GET /transactions/", r)

    tx_types = [
        ("income",            {"description": "TEST income entry",            "amount": 10000}),
        ("payment",           {"description": "TEST payment received",         "amount": 5000}),
        ("expense",           {"description": "TEST general expense",          "amount": 800}),
        ("purchase",          {"description": "TEST zip purchase 300pcs",      "amount": 10200}),
        ("stock_consumption", {"description": "TEST stock used for order",     "amount": 3400}),
        ("adjustment",        {"description": "TEST ledger adjustment",        "amount": 500}),
    ]
    for tx_type, extra in tx_types:
        payload = {
            "party_id": pid if party else None,
            "order_id": oid,
            "transaction_type": tx_type,
            "amount": extra["amount"],
            "transaction_date": today,
            "description": extra["description"],
            "payment_method": "cash",
        }
        r = requests.post(f"{BASE_URL}/transactions/", headers=h, json=payload)
        tx = check(f"POST /transactions/ type={tx_type}", r, 201)
        if tx:
            created["transaction_ids"].append(tx["id"])

    # filter by type
    r = requests.get(f"{BASE_URL}/transactions/", headers=h, params={"transaction_type": "purchase"})
    check("GET /transactions/?type=purchase", r)

    # filter by party
    if party:
        r = requests.get(f"{BASE_URL}/transactions/", headers=h, params={"party_id": pid})
        check("GET /transactions/?party_id=...", r)

    # ── Bills ─────────────────────────────────────────────────────────────────
    print("\n── Bills ──")
    r = requests.get(f"{BASE_URL}/bills/next-number", headers=h, params={"series": "T"})
    check("GET /bills/next-number", r)

    r = requests.get(f"{BASE_URL}/bills/", headers=h)
    check("GET /bills/", r)

    bill = None
    if oid:
        r = requests.post(f"{BASE_URL}/bills/", headers=h, json={
            "order_id": oid,
            "bill_series": "T",
            "bill_date": today,
            "amount_due": 13500,
            "discount": 500,
            "notes": "TEST bill",
        })
        bill = check("POST /bills/", r, 201)
        if bill:
            bid = bill["id"]
            created["bill_ids"].append(bid)

            r = requests.get(f"{BASE_URL}/bills/{bid}", headers=h)
            check("GET /bills/{id}", r)

            r = requests.patch(f"{BASE_URL}/bills/{bid}", headers=h, json={
                "notes": "TEST bill updated",
                "goods_description": "TEST Smoke Covers Updated via bill edit",
            })
            check("PATCH /bills/{id}", r)

            r = requests.patch(f"{BASE_URL}/bills/{bid}/payment", headers=h, json={
                "amount": 5000,
                "payment_method": "bank_transfer",
                "notes": "TEST partial payment",
            })
            check("PATCH /bills/{id}/payment", r)

    # ── Expenses ──────────────────────────────────────────────────────────────
    print("\n── Expenses ──")
    r = requests.post(f"{BASE_URL}/expenses/", headers=h, json={
        "order_id": oid,
        "amount": 2500,
        "description": "TEST thread purchase",
        "expense_date": today,
        "receipt_number": "REC-TEST-001",
    })
    exp = check("POST /expenses/", r, 201)
    if exp:
        created["expense_ids"].append(exp["id"])

    if oid:
        r = requests.get(f"{BASE_URL}/expenses/", headers=h, params={"order_id": oid})
        check("GET /expenses/?order_id=...", r)

    # ── Quality ───────────────────────────────────────────────────────────────
    print("\n── Quality ──")
    if oid:
        r = requests.get(f"{BASE_URL}/quality/{oid}", headers=h)
        qr = check("GET /quality/{order_id}", r)

        if qr and qr.get("checkpoints"):
            cpid = qr["checkpoints"][0]["id"]
            r = requests.patch(f"{BASE_URL}/quality/checkpoints/{cpid}", headers=h, json={
                "passed": True,
                "notes": "TEST quality check passed",
            })
            check("PATCH /quality/checkpoints/{id}", r)

        r = requests.post(f"{BASE_URL}/quality/defects", headers=h, json={
            "order_id": oid,
            "defect_type": "Broken Stitch",
            "quantity": 2,
            "notes": "TEST minor stitch defect",
        })
        check("POST /quality/defects", r, 201)

    # ── Dispatch ──────────────────────────────────────────────────────────────
    print("\n── Dispatch ──")
    r = requests.get(f"{BASE_URL}/dispatch/ready", headers=h)
    check("GET /dispatch/ready", r)

    r = requests.get(f"{BASE_URL}/dispatch/carriers", headers=h)
    check("GET /dispatch/carriers", r)

    # ── Todos ─────────────────────────────────────────────────────────────────
    print("\n── Todos ──")
    r = requests.get(f"{BASE_URL}/todos/", headers=h)
    check("GET /todos/", r)

    r = requests.post(f"{BASE_URL}/todos/", headers=h, json={
        "title": "TEST Create bill for smoke party",
        "category": "billing",
        "priority": "high",
        "description": "Smoke test todo — billing reminder",
    })
    todo = check("POST /todos/", r, 201)
    tid = None
    if todo:
        tid = todo["id"]
        created["todo_ids"].append(tid)

        r = requests.get(f"{BASE_URL}/todos/{tid}", headers=h)
        check("GET /todos/{id}", r)

        r = requests.patch(f"{BASE_URL}/todos/{tid}", headers=h, json={
            "status": "in_progress",
            "description": "Smoke test updated",
        })
        check("PATCH /todos/{id}", r)

    # Recurring todo — daily
    r = requests.post(f"{BASE_URL}/todos/", headers=h, json={
        "title": "TEST Daily machine check",
        "category": "maintenance",
        "priority": "medium",
        "recurrence": "daily",
    })
    rtodo = check("POST /todos/ (recurring)", r, 201)
    if rtodo:
        rtid = rtodo["id"]
        created["todo_ids"].append(rtid)

        r = requests.patch(f"{BASE_URL}/todos/{rtid}/complete", headers=h)
        completed = check("PATCH /todos/{id}/complete (spawns next)", r)
        # Verify next recurring instance was auto-created
        if completed:
            r2 = requests.get(f"{BASE_URL}/todos/", headers=h, params={"size": 200})
            if r2.status_code == 200:
                spawned = [t for t in r2.json().get("data", [])
                           if t.get("parent_todo_id") == rtid and t["status"] == "pending"]
                sym = PASS if spawned else FAIL
                print(f"  {sym} Recurring spawn created (found {len(spawned)} child)")
                results.append(("Recurring todo spawns next on complete", bool(spawned), 200, None))
                if spawned:
                    created["todo_ids"].append(spawned[0]["id"])

    # Filter tests
    r = requests.get(f"{BASE_URL}/todos/", headers=h, params={"status": "pending"})
    check("GET /todos/?status=pending", r)

    r = requests.get(f"{BASE_URL}/todos/", headers=h, params={"category": "billing"})
    check("GET /todos/?category=billing", r)

    # Delete
    if tid:
        r = requests.delete(f"{BASE_URL}/todos/{tid}", headers=h)
        ok = check("DELETE /todos/{id}", r, 204)
        if r.status_code == 204:
            created["todo_ids"].remove(tid)

    # ── Dashboard ─────────────────────────────────────────────────────────────
    print("\n── Dashboard ──")
    r = requests.get(f"{BASE_URL}/dashboard/summary", headers=h)
    check("GET /dashboard/summary", r)

    # ── Bill Delete ───────────────────────────────────────────────────────────
    print("\n── Bill Delete (must revert order) ──")
    if bill and bid in created["bill_ids"]:
        r = requests.delete(f"{BASE_URL}/bills/{bid}", headers=h)
        ok = check("DELETE /bills/{id}", r, 204)
        if ok is not None or r.status_code == 204:
            created["bill_ids"].remove(bid)
            # order should now be packing_complete
            r2 = requests.get(f"{BASE_URL}/orders/{oid}", headers=h)
            if r2.status_code == 200:
                st = r2.json().get("status")
                sym = PASS if st == "packing_complete" else FAIL
                print(f"  {sym} Order reverted to packing_complete (got: {st})")
                results.append(("Bill delete reverts order status", st == "packing_complete", 200, None))


def cleanup(token):
    h = {"Authorization": f"Bearer {token}"}
    print("\n── Cleanup ──")

    for tdid in created["todo_ids"]:
        r = requests.delete(f"{BASE_URL}/todos/{tdid}", headers=h)
        print(f"  {'✓' if r.status_code == 204 else '✗'} DELETE todo {tdid[:8]}… [{r.status_code}]")

    for txid in created["transaction_ids"]:
        r = requests.delete(f"{BASE_URL}/transactions/{txid}", headers=h)
        print(f"  {'✓' if r.status_code == 204 else '✗'} DELETE transaction {txid[:8]}… [{r.status_code}]")

    for eid in created["expense_ids"]:
        r = requests.delete(f"{BASE_URL}/expenses/{eid}", headers=h)
        print(f"  {'✓' if r.status_code == 204 else '✗'} DELETE expense {eid[:8]}… [{r.status_code}]")

    for iid in created["inventory_item_ids"]:
        r = requests.delete(f"{BASE_URL}/inventory/items/{iid}", headers=h)
        print(f"  {'✓' if r.status_code == 204 else '✗'} DELETE inventory item {iid[:8]}… [{r.status_code}]")

    # Note: inventory categories have no delete endpoint yet - skip

    for oid in created["order_ids"]:
        r = requests.delete(f"{BASE_URL}/orders/{oid}", headers=h)
        print(f"  {'✓' if r.status_code in (200,204) else '✗'} DELETE order {oid[:8]}… [{r.status_code}]")

    for pid in created["party_ids"]:
        r = requests.delete(f"{BASE_URL}/parties/{pid}", headers=h)
        print(f"  {'✓' if r.status_code in (200,204) else '✗'} DELETE party {pid[:8]}… [{r.status_code}]")


def main():
    global BASE_URL
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--keep", action="store_true", help="Skip cleanup")
    args = parser.parse_args()
    BASE_URL = args.base_url

    print(f"🔗 Target: {BASE_URL}")
    print("🔐 Authenticating...")

    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"username": USERNAME, "password": PASSWORD})
    if r.status_code != 200:
        print(f"❌ Login failed [{r.status_code}]: {r.text[:300]}")
        sys.exit(1)
    token = r.json().get("access_token")
    print(f"  {PASS} Logged in as {USERNAME}")

    try:
        run(token)
    except Exception:
        print(f"\n{FAIL} Unexpected exception:")
        traceback.print_exc()

    if not args.keep:
        cleanup(token)

    # Summary
    total = len(results)
    passed = sum(1 for _, ok, _, _ in results if ok)
    failed = total - passed
    print(f"\n{'='*50}")
    print(f"Results: {passed}/{total} passed  |  {failed} failed")
    if failed:
        print("\nFailed checks:")
        for name, ok, code, body in results:
            if not ok:
                print(f"  {FAIL} {name} [{code}]: {json.dumps(body)[:200] if body else ''}")
    print("="*50)
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
