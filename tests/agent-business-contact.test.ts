import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeBusinessContactFields,
  validateBusinessContactClaims,
  validateBusinessResearchContact,
} from "@/lib/agent-business-contact";

test("structured research contact hydrates the CRM account fields", () => {
  const parsed = validateBusinessResearchContact({
    name: "Linda Garza",
    title: "Human Resources Director",
    phone: "505-765-5900",
    email: "hr@rodey.com",
    address: "201 3rd Street NW, Suite 2200, Albuquerque, NM 87102",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(mergeBusinessContactFields({}, parsed.value), {
    address: "201 3rd Street NW, Suite 2200, Albuquerque, NM 87102",
    phone: "505-765-5900",
    email: "hr@rodey.com",
    ownerName: "Linda Garza — Human Resources Director",
  });
});

test("explicit account values win over research fallbacks", () => {
  assert.deepEqual(
    mergeBusinessContactFields(
      { phone: "505-111-2222", ownerName: "Local office" },
      { name: "Linda Garza", title: "HR Director", phone: "505-765-5900" },
    ),
    {
      address: undefined,
      phone: "505-111-2222",
      email: undefined,
      ownerName: "Local office",
    },
  );
});

test("summary cannot claim an email while omitting the structured value", () => {
  assert.deepEqual(
    validateBusinessContactClaims("A viable local HR contact path (HR Director, with email).", {}),
    {
      ok: false,
      error: "aiResearch.summary claims an email was found, but no structured email was provided",
    },
  );
});

test("actual phone and verified-address claims require structured values", () => {
  assert.equal(
    validateBusinessContactClaims(
      "The verified office address is downtown and the public line is (505) 765-5900.",
      { phone: "505-765-5900" },
    ).ok,
    false,
  );
});

test("unknown or unavailable contact data does not trigger the positive-claim guard", () => {
  assert.deepEqual(
    validateBusinessContactClaims("No public email was found; the phone number is unknown.", {}),
    { ok: true },
  );
});

test("contact fields are bounded and type checked", () => {
  assert.deepEqual(validateBusinessResearchContact({ phone: 5057655900 }), {
    ok: false,
    error: "aiResearch.contact.phone must be a string",
  });
  assert.equal(validateBusinessResearchContact({ email: "a".repeat(301) }).ok, false);
});

