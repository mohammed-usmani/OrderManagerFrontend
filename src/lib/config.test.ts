import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUrl } from "./config.ts";

test("production refuses to fall back to localhost", () => {
  assert.throws(() => resolveUrl(undefined, "NEXT_PUBLIC_API_URL", "http://localhost:8000", true), /NEXT_PUBLIC_API_URL/);
  assert.throws(() => resolveUrl("", "NEXT_PUBLIC_API_URL", "http://localhost:8000", true));
});

test("dev falls back; configured values pass through", () => {
  assert.equal(resolveUrl(undefined, "X", "http://localhost:8000", false), "http://localhost:8000");
  assert.equal(resolveUrl("wss://api.example.com/ws", "X", "ws://localhost:8000/ws", true), "wss://api.example.com/ws");
});

test("rejects a value that isn't a URL", () => {
  assert.throws(() => resolveUrl("api.example.com", "X", "", true), /not a valid URL/);
});
