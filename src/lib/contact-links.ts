// Turning an organizer contact line into safe, clickable pieces.
//
// The text comes from an automated research agent reading the public web, so
// it is UNTRUSTED: it can say anything, including markup or a `javascript:`
// URL. Two rules keep it harmless:
//
//   • It is only ever rendered as React text, which escapes it. Nothing here
//     produces HTML.
//   • A link is made only from a recognised, fully-validated piece — an http(s)
//     URL, an email address, or a phone number — and its href is BUILT from
//     that piece, never copied from the text around it. Anything else, a
//     `javascript:` or `data:` URL included, stays plain text.
//
// Pure, with no server or browser dependencies, so tests can pin it down.

export type ContactPart =
  | { kind: "text"; text: string }
  | { kind: "url"; text: string; href: string }
  | { kind: "email"; text: string; href: string }
  | { kind: "phone"; text: string; href: string };

// One pass over the text: an http(s) URL, else an email, else a phone-shaped
// run of digits. Quotes and angle brackets end a URL, so markup can't be
// dragged into one.
const TOKEN =
  /(https?:\/\/[^\s<>"'`]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})|(\+?\(?\d[\d\s().-]{6,}\d)/g;

/** Sentence punctuation that commonly trails a URL in prose and isn't part of it. */
const TRAILING = /[.,;:!?)\]}]+$/;

/** 10–15 digits: a dialable number. Fewer is a date, a zip or an order number. */
function phoneHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return null; // an ISO date run on
  return `tel:${raw.trim().startsWith("+") ? "+" : ""}${digits}`;
}

function urlHref(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function contactParts(input: string | null | undefined): ContactPart[] {
  const text = typeof input === "string" ? input : "";
  if (!text.trim()) return [];

  const parts: ContactPart[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last?.kind === "text") last.text += t;
    else parts.push({ kind: "text", text: t });
  };

  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    pushText(text.slice(at, start));
    let token = m[0];
    let tail = "";

    if (m[1]) {
      const trail = token.match(TRAILING)?.[0] ?? "";
      if (trail) { token = token.slice(0, -trail.length); tail = trail; }
      const href = urlHref(token);
      if (href) parts.push({ kind: "url", text: token, href });
      else pushText(token);
    } else if (m[2]) {
      parts.push({ kind: "email", text: token, href: `mailto:${token}` });
    } else {
      const href = phoneHref(token);
      if (href) parts.push({ kind: "phone", text: token, href });
      else pushText(token);
    }
    pushText(tail);
    at = start + m[0].length;
  }
  pushText(text.slice(at));
  return parts;
}
