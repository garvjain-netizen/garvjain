import assert from "node:assert/strict";
import { test } from "node:test";
import { fromWhatsAppRecipient, normalisePhone, toWhatsAppRecipient } from "../src/lib/phone";

test("bare Indian numbers normalise against the default country", () => {
  for (const input of ["9876543210", "98765 43210", "098765 43210", "+91 98765 43210"]) {
    const result = normalisePhone(input, "IN");
    assert.equal(result.ok, true, `${input} should parse`);
    if (result.ok) assert.equal(result.e164, "+919876543210");
  }
});

test("the 00 international prefix is understood", () => {
  const result = normalisePhone("00919876543210", "IN");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.e164, "+919876543210");
});

test("invalid numbers are rejected rather than guessed at", () => {
  for (const input of ["", "12345", "not a number", "+91 12345"]) {
    assert.equal(normalisePhone(input, "IN").ok, false, `${input} should fail`);
  }
});

test("other countries still work when given in full", () => {
  const result = normalisePhone("+1 415 555 2671", "IN");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.e164, "+14155552671");
    assert.equal(result.country, "US");
  }
});

test("the Cloud API recipient form round-trips", () => {
  assert.equal(toWhatsAppRecipient("+919876543210"), "919876543210");
  assert.equal(fromWhatsAppRecipient("919876543210"), "+919876543210");
  assert.equal(fromWhatsAppRecipient("+919876543210"), "+919876543210");
});
