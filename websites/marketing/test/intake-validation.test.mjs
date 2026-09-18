import assert from "node:assert/strict";
import test from "node:test";
import { intakeSchema } from "../lib/intake-validation.ts";

const request = {
  requestId: "deea53d7-6650-4cab-8f53-5b99b5c3298a",
  company: "Voorbeeldbedrijf",
  email: "inkoop@example.com",
  application: "Energieopslag",
  message: "Wij willen een batterijpaspoort.",
};

test("accepts and normalizes a business inquiry", () => {
  const parsed = intakeSchema.parse({ ...request, company: "  Voorbeeldbedrijf  " });
  assert.equal(parsed.company, "Voorbeeldbedrijf");
  assert.equal(parsed.website, "");
});

test("rejects mail header injection", () => {
  assert.equal(intakeSchema.safeParse({ ...request, email: "inkoop@example.com\r\nBcc: other@example.com" }).success, false);
});

test("rejects oversized company names and messages", () => {
  assert.equal(intakeSchema.safeParse({ ...request, company: "x".repeat(161) }).success, false);
  assert.equal(intakeSchema.safeParse({ ...request, message: "x".repeat(3001) }).success, false);
});

test("rejects unknown applications and malformed idempotency identifiers", () => {
  assert.equal(intakeSchema.safeParse({ ...request, application: "unrecognized" }).success, false);
  assert.equal(intakeSchema.safeParse({ ...request, requestId: "../not-an-id" }).success, false);
});

test("keeps the honeypot value available for rejection by the API", () => {
  assert.equal(intakeSchema.parse({ ...request, website: "spam.example" }).website, "spam.example");
});

