import assert from "node:assert/strict";
import { test } from "node:test";
import { parseIso } from "../src/lib/dates";
import { bindVariables, renderBody, sanitiseParameter } from "../src/lib/templates";
import { countPlaceholders } from "../src/lib/whatsapp";
import type { Contact, Renewal } from "../src/lib/types";

const contact = {
  id: "c1",
  name: "Ananya  Sharma",
  phone_e164: "+919876543210",
  email: null,
  date_of_birth: "1995-09-13",
  language: "en",
  opt_in_at: new Date(),
  opt_in_source: "test",
  opt_out_at: null,
  notes: null,
  created_at: new Date(),
  updated_at: new Date(),
} as Contact;

const renewal = {
  id: "r1",
  contact_id: "c1",
  label: "Car Insurance",
  reference: "POL-1",
  renews_on: "2026-09-20",
  amount: "12500.00",
  currency: "INR",
  status: "active",
  created_at: new Date(),
  updated_at: new Date(),
} as Renewal;

const today = parseIso("2026-09-13");

test("parameters are collapsed to one line", () => {
  // Meta rejects newlines, tabs and 4+ consecutive spaces in body parameters.
  assert.equal(sanitiseParameter("Ananya\nSharma"), "Ananya Sharma");
  assert.equal(sanitiseParameter("Ananya     Sharma"), "Ananya Sharma");
  assert.equal(sanitiseParameter("  padded\t\tname  "), "padded name");
});

test("variables resolve from the contact and renewal", () => {
  const { values, missing } = bindVariables(
    ["contact.first_name", "renewal.label", "renewal.renews_on", "renewal.days_left"],
    { contact, renewal, today },
  );
  assert.deepEqual(missing, []);
  assert.equal(values[0], "Ananya");
  assert.equal(values[1], "Car Insurance");
  assert.equal(values[2], "20 Sept 2026");
  assert.equal(values[3], "7");
});

test("an unresolvable variable is reported, not silently blanked", () => {
  const { missing } = bindVariables(["renewal.label"], { contact, renewal: null, today });
  assert.deepEqual(missing, ["renewal.label"]);
});

test("unknown binding paths cannot reach arbitrary properties", () => {
  const { missing } = bindVariables(["contact.notes", "constructor"], { contact, today });
  assert.deepEqual(missing.sort(), ["constructor", "contact.notes"].sort());
});

test("renderBody substitutes positionally and leaves gaps visible", () => {
  assert.equal(renderBody("Hi {{1}}, your {{2}} is due", ["Ananya", "policy"]),
    "Hi Ananya, your policy is due");
  assert.equal(renderBody("Hi {{1}} and {{2}}", ["Ananya"]), "Hi Ananya and {{2}}");
});

test("countPlaceholders reflects the highest index, not the occurrence count", () => {
  assert.equal(countPlaceholders("no variables"), 0);
  assert.equal(countPlaceholders("{{1}} and {{2}} and {{1}} again"), 2);
  assert.equal(countPlaceholders("{{3}} alone"), 3);
});
