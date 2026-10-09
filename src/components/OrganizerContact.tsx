import { contactParts } from "@/lib/contact-links";

/**
 * An organizer contact line from AI research, with its URL, email and phone
 * pieces made clickable — safely. See lib/contact-links for the rules: the text
 * is untrusted, rendered only as escaped text, and every href is rebuilt from a
 * validated piece (http/https, mailto, tel), never copied from the input.
 *
 * Web links open in a new tab with noopener/noreferrer/nofollow, like the
 * research source links: they came from an automated process, not from someone
 * in the building.
 */
export default function OrganizerContact({ text }: { text: string | null }) {
  const parts = contactParts(text);
  if (parts.length === 0) return <>—</>;
  return (
    <span className="[overflow-wrap:anywhere]">
      {parts.map((p, i) => {
        if (p.kind === "text") return <span key={i}>{p.text}</span>;
        const external = p.kind === "url";
        return (
          <a key={i} href={p.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
            className="text-accent-deep underline underline-offset-2">
            {p.text}
          </a>
        );
      })}
    </span>
  );
}
