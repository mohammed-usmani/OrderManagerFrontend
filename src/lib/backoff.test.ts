import { test } from "node:test";
import assert from "node:assert/strict";
import { isLinesBusy, queueRetryDelay } from "./backoff.ts";

test("grows exponentially from 3s and caps at 20s", () => {
  const mid = () => 0.5; // no jitter
  assert.deepEqual([0, 1, 2, 3, 10].map((n) => queueRetryDelay(n, mid)), [3000, 6000, 12000, 20000, 20000]);
});

test("jitter stays within ±20%", () => {
  assert.equal(queueRetryDelay(0, () => 0), 2400);
  assert.equal(queueRetryDelay(0, () => 1), 3600);
  assert.equal(queueRetryDelay(9, () => 1), 24000);
});

test("only the lines-busy refusal is retried", () => {
  assert.equal(isLinesBusy("All voice lines are busy right now."), true);
  assert.equal(isLinesBusy(""), true); // legacy server: no reason
  assert.equal(isLinesBusy("Too many calls from this network."), false);
});
