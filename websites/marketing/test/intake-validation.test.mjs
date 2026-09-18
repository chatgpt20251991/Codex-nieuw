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

test("rejects NUL characters before storing a request the mail worker cannot send", () => {
  for (const key of ["company", "message"]) assert.equal(intakeSchema.safeParse({ ...request, [key]: "text\0invalid" }).success, false);
});

test("rejects email formats that the mail worker cannot use for Reply-To", () => {
  for (const email of ["a@example-.com", "a@-example.com", "a".repeat(65)+"@example.com", "a@"+"b".repeat(64)+".com"]) assert.equal(intakeSchema.safeParse({ ...request, email }).success, false);
  assert.equal(intakeSchema.safeParse({ ...request, email: "a".repeat(64)+"@"+"b".repeat(63)+".com" }).success, true);
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
