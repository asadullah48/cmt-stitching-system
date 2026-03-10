import urllib.request
import urllib.error
import json

BASE = "https://cmt-backend-5xuu.onrender.com/api/v1"

results = []
TOKEN = None
ORDER_ID = None
CHECKPOINT_ID = None
uname = "qatest01"

def req(method, path, body=None, token=None, label="", expected=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=45) as resp:
            status = resp.status
            rbody = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            rbody = json.loads(e.read())
        except Exception:
            rbody = {}
    except Exception as ex:
        status = 0
        rbody = {"error": str(ex)}

    ok = status in (expected or [200, 201])
    tag = "[PASS]" if ok else "[FAIL]"
    note = json.dumps(rbody)[:120]
    results.append((tag, label, status, note, rbody))
    print("{} {} | HTTP {} | {}".format(tag, label, status, note))
    return status, rbody

# TEST 1: Health Check (root URL, not /api/v1)
root_url = "https://cmt-backend-5xuu.onrender.com/"
request = urllib.request.Request(root_url, method="GET")
try:
    with urllib.request.urlopen(request, timeout=60) as resp:
        status = resp.status
        rbody = json.loads(resp.read())
except urllib.error.HTTPError as e:
    status = e.code
    rbody = {}
except Exception as ex:
    status = 0
    rbody = {"error": str(ex)}
ok = status == 200
tag = "[PASS]" if ok else "[FAIL]"
note = json.dumps(rbody)[:120]
results.append((tag, "TEST 1: Health Check", status, note, rbody))
print("{} {} | HTTP {} | {}".format(tag, "TEST 1: Health Check", status, note))

# TEST 2: Register
reg_status = 409
reg_body = {}
for n in range(1, 10):
    uname = "qatest0{}".format(n)
    email = "qatest0{}@example.com".format(n)
    reg_status, reg_body = req(
        "POST", "/auth/register",
        {"username": uname, "email": email, "password": "Test1234!"},
        label="TEST 2: Register ({})".format(uname),
        expected=[200, 201, 409]
    )
    if reg_status in (200, 201):
        TOKEN = reg_body.get("access_token")
        break
    elif reg_status == 409:
        # Try login to get token for existing user
        s2, b2 = req("POST", "/auth/login",
                     {"username": uname, "password": "Test1234!"},
                     label="TEST 2b: Login existing ({})".format(uname),
                     expected=[200])
        if s2 == 200:
            TOKEN = b2.get("access_token")
            break

# TEST 3: Login
login_status, login_body = req(
    "POST", "/auth/login",
    {"username": uname, "password": "Test1234!"},
    label="TEST 3: Login",
    expected=[200]
)
if login_status == 200:
    TOKEN = login_body.get("access_token")

# TEST 4: GET /auth/me
req("GET", "/auth/me", token=TOKEN, label="TEST 4: GET /auth/me", expected=[200])

# TEST 5: Create Order
order_payload = {
    "party_reference": "QA Party",
    "goods_description": "Test Fabric",
    "total_quantity": 100,
    "stitch_rate_party": 5.00,
    "stitch_rate_labor": 3.00,
    "entry_date": "2026-03-07",
    "items": [{"size": "M", "quantity": 100}]
}
s5, b5 = req("POST", "/orders/", order_payload, token=TOKEN,
             label="TEST 5: Create Order", expected=[200, 201])
if s5 in (200, 201):
    ORDER_ID = b5.get("id")
    print("       => ORDER_ID={}".format(ORDER_ID))

# TEST 6: GET /orders/
req("GET", "/orders/", token=TOKEN, label="TEST 6: List Orders", expected=[200])

# TEST 7: GET /orders/{id}
if ORDER_ID:
    req("GET", "/orders/{}".format(ORDER_ID), token=TOKEN,
        label="TEST 7: GET Order by ID", expected=[200])
else:
    results.append(("[SKIP]", "TEST 7: GET Order by ID", 0, "No ORDER_ID", {}))
    print("[SKIP] TEST 7: GET Order by ID | No ORDER_ID")

# TEST 8: PATCH /orders/{id}/status
if ORDER_ID:
    req("PATCH", "/orders/{}/status".format(ORDER_ID),
        {"status": "stitching_in_progress"},
        token=TOKEN, label="TEST 8: Update Order Status", expected=[200])
else:
    results.append(("[SKIP]", "TEST 8: Update Order Status", 0, "No ORDER_ID", {}))
    print("[SKIP] TEST 8: Update Order Status | No ORDER_ID")

# TEST 9: Create Party
req("POST", "/parties/",
    {"name": "QA Test Party", "contact_person": "Test Contact", "phone": "03001234567"},
    token=TOKEN, label="TEST 9: Create Party", expected=[200, 201])

# TEST 10: GET /parties/
req("GET", "/parties/", token=TOKEN, label="TEST 10: List Parties", expected=[200])

# TEST 11: POST /production/
if ORDER_ID:
    req("POST", "/production/",
        {"order_id": ORDER_ID, "department": "stitching",
         "session_date": "2026-03-07", "machines_used": 5},
        token=TOKEN, label="TEST 11: Create Production Session", expected=[200, 201])
else:
    results.append(("[SKIP]", "TEST 11: Create Production Session", 0, "No ORDER_ID", {}))
    print("[SKIP] TEST 11 | No ORDER_ID")

# TEST 12: GET /production/{order_id}
if ORDER_ID:
    req("GET", "/production/{}".format(ORDER_ID), token=TOKEN,
        label="TEST 12: GET Production Sessions", expected=[200])
else:
    results.append(("[SKIP]", "TEST 12: GET Production Sessions", 0, "No ORDER_ID", {}))
    print("[SKIP] TEST 12 | No ORDER_ID")

# TEST 13: GET /quality/{order_id}
if ORDER_ID:
    s13, b13 = req("GET", "/quality/{}".format(ORDER_ID), token=TOKEN,
                   label="TEST 13: GET Quality Checkpoints", expected=[200])
    if s13 == 200:
        checkpoints = b13 if isinstance(b13, list) else b13.get("checkpoints", [])
        if checkpoints:
            CHECKPOINT_ID = checkpoints[0].get("id")
            print("       => CHECKPOINT_ID={}".format(CHECKPOINT_ID))
else:
    results.append(("[SKIP]", "TEST 13: GET Quality Checkpoints", 0, "No ORDER_ID", {}))
    print("[SKIP] TEST 13 | No ORDER_ID")

# TEST 14: PATCH /quality/checkpoints/{id}
if CHECKPOINT_ID:
    req("PATCH", "/quality/checkpoints/{}".format(CHECKPOINT_ID),
        {"passed": True}, token=TOKEN,
        label="TEST 14: Update Quality Checkpoint", expected=[200])
else:
    results.append(("[SKIP]", "TEST 14: Update Quality Checkpoint", 0, "No CHECKPOINT_ID", {}))
    print("[SKIP] TEST 14 | No CHECKPOINT_ID")

# TEST 15: POST /quality/defects
if ORDER_ID:
    req("POST", "/quality/defects",
        {"order_id": ORDER_ID, "defect_type": "Puckering",
         "quantity": 2, "notes": "QA test"},
        token=TOKEN, label="TEST 15: Create Quality Defect", expected=[200, 201])
else:
    results.append(("[SKIP]", "TEST 15: Create Quality Defect", 0, "No ORDER_ID", {}))
    print("[SKIP] TEST 15 | No ORDER_ID")

# TEST 16: GET /dispatch/carriers
req("GET", "/dispatch/carriers", token=TOKEN,
    label="TEST 16: GET Dispatch Carriers", expected=[200])

# TEST 17: GET /dispatch/ready
req("GET", "/dispatch/ready", token=TOKEN,
    label="TEST 17: GET Dispatch Ready", expected=[200])

# TEST 18: POST /transactions/
req("POST", "/transactions/",
    {"transaction_type": "income", "amount": 500,
     "description": "QA test", "transaction_date": "2026-03-07"},
    token=TOKEN, label="TEST 18: Create Transaction", expected=[200, 201])

# TEST 19: GET /transactions/
req("GET", "/transactions/", token=TOKEN,
    label="TEST 19: List Transactions", expected=[200])

# TEST 20: GET /dashboard/summary
req("GET", "/dashboard/summary", token=TOKEN,
    label="TEST 20: Dashboard Summary", expected=[200])

# SUMMARY
print("")
print("=" * 70)
print("SMOKE TEST SUMMARY")
print("=" * 70)
passed = sum(1 for r in results if r[0] == "[PASS]")
failed = sum(1 for r in results if r[0] == "[FAIL]")
skipped = sum(1 for r in results if r[0] == "[SKIP]")
total = len(results)
print("PASSED {}/{}  |  FAILED {}  |  SKIPPED {}".format(passed, total, failed, skipped))
print("")
if failed > 0:
    print("FAILURES:")
    for r in results:
        if r[0] == "[FAIL]":
            print("  {} | HTTP {} | {}".format(r[1], r[2], r[3]))
if skipped > 0:
    print("SKIPPED:")
    for r in results:
        if r[0] == "[SKIP]":
            print("  {} | {}".format(r[1], r[3]))
