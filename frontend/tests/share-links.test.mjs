import assert from "node:assert/strict";
import test from "node:test";

// Start the app locally before running: node --test tests/share-links.test.mjs
const base = new URL(process.env.CMT_FRONTEND_URL ?? "http://127.0.0.1:3100");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Local tests only");
const token = "abcdefab-1111-4111-8111-111111111111";

test("anonymous share link reaches the public page without a login redirect", async () => {
  const response = await fetch(new URL(`/share/${token}`, base), { redirect: "manual" });
  assert.equal(response.status, 200, `Unexpected redirect: ${response.headers.get("location")}`);
  assert.equal(response.headers.get("location"), null);
});

test("anonymous dashboard remains protected", async () => {
  const response = await fetch(new URL("/dashboard", base), { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
});

const api = new URL(process.env.CMT_API_URL ?? "http://127.0.0.1:8100/api/v1/");
assert.ok(["localhost", "127.0.0.1"].includes(api.hostname), "Local API tests only");
const statementUrl = new URL(`public/statement/${token}`, api);

test("synthetic public API returns only the read-only statement fields", async () => {
  const response = await fetch(statementUrl);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["party_name", "date_from", "date_to", "transactions", "total_debit", "total_credit", "outstanding_balance"].sort());
  assert.equal(body.party_name, "SYNTHETIC Share Party");
  assert.equal(body.outstanding_balance, 1250);
  assert.equal(body.transactions.length, 1);
  assert.equal(body.transactions[0].description, "SYNTHETIC bill for share validation");
  assert.equal(JSON.stringify(body).includes("private@example.test"), false);
});

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  test(`public statement rejects ${method}`, async () => {
    const response = await fetch(statementUrl, { method });
    assert.equal(response.status, 405);
  });
}

test("unknown public token returns 404", async () => {
  const response = await fetch(new URL("public/statement/abcdefab-2222-4222-8222-222222222222", api));
  assert.equal(response.status, 404);
});

test("share management still requires authentication", async () => {
  const response = await fetch(new URL("share-links/", api));
  assert.equal(response.status, 401);
});
