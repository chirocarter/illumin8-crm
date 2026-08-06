// One phone format everywhere. Numbers arrive from typing, CSV imports and the
// public QR form in every shape — "+1 505 999 1104", "5052647341",
// "505.555.0100" — which makes lists look untidy and duplicate detection
// unreliable.
//
// Deliberately conservative: only shapes we can be certain about are rewritten.
// Anything else (international, extensions, partial numbers) is returned
// trimmed but otherwise untouched, because mangling a number nobody can dial
// is worse than an inconsistent one.

/** "(505) 555-0123" for US numbers; input trimmed but unchanged otherwise. */
export function formatPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");

  // A US number is 10 digits, or 11 starting with the country code.
  const ten =
    digits.length === 10 ? digits :
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) :
    null;

  // Anything else — international, an extension, a partial number — is left
  // exactly as typed rather than reshaped into something undiallable.
  if (!ten) return trimmed;

  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Digits only — for comparing two numbers regardless of formatting. */
export function phoneKey(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}
