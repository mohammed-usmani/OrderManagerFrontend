import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "./html.ts";

test("escapes markup so user text can't run script in print windows", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('hi')">&`),
    "&lt;img src=x onerror=&quot;alert(&#39;hi&#39;)&quot;&gt;&amp;",
  );
});

test("renders missing values as empty text", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(3), "3");
});
