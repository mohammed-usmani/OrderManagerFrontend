import { test } from "node:test";
import assert from "node:assert/strict";
import { isCashierRole } from "./adminRoutes.ts";

test("only roles the server lets take payments see discount and cash", () => {
  for (const role of ["owner", "manager", "cashier"] as const) assert.equal(isCashierRole(role), true);
  for (const role of ["waiter", "chef", "none", null, undefined] as const) assert.equal(isCashierRole(role), false);
});
