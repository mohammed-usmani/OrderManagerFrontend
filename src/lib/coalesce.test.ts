import { test } from "node:test";
import assert from "node:assert/strict";
import { coalesce } from "./coalesce.ts";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a burst runs once now and once after, never concurrently", async () => {
  const run = coalesce();
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const load = async () => {
    calls++;
    maxActive = Math.max(maxActive, ++active);
    await tick(10);
    active--;
  };
  for (let i = 0; i < 5; i++) run(load);
  await tick(50);
  assert.equal(calls, 2);
  assert.equal(maxActive, 1);
});

test("the queued rerun uses the latest fn", async () => {
  const run = coalesce();
  const seen: string[] = [];
  const make = (name: string) => async () => { seen.push(name); await tick(5); };
  run(make("a"));
  run(make("b"));
  run(make("c"));
  await tick(30);
  assert.deepEqual(seen, ["a", "c"]);
});

test("keeps working after a rejected run", async () => {
  const run = coalesce();
  let calls = 0;
  const boom = async () => { calls++; throw new Error("boom"); };
  run(boom);
  await tick(5);
  run(boom);
  await tick(5);
  assert.equal(calls, 2);
});
