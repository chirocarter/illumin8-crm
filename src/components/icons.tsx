// Minimal inline icon set (24px, 1.5px stroke) — keeps the app dependency-free.
const paths: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>,
  building: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h3a1 1 0 0 1 1 1v11" /><path d="M2 21h20" /><path d="M8 7h2m-2 4h2m-2 4h2" /></>,
  users: <><circle cx="9" cy="8" r="3.25" /><path d="M3.5 19.5c.6-3.1 2.8-5 5.5-5s4.9 1.9 5.5 5" /><path d="M16 5.5a3 3 0 1 1 0 5.7" /><path d="M17.5 14.7c1.9.5 3.2 2 3.7 4.3" /></>,
  pipeline: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="9.5" y="4" width="5" height="10" rx="1.5" /><rect x="16" y="4" width="5" height="13" rx="1.5" /></>,
  bolt: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" /></>,
  handshake: <><path d="M2 8.5 7 6l5 2.5L17 6l5 2.5v7L17 18l-5-2.5L7 18l-5-2.5v-7Z" /><path d="M12 8.5v7" /></>,
  megaphone: <><path d="M3 10v4a1 1 0 0 0 1 1h2l4 4V5L6 9H4a1 1 0 0 0-1 1Z" /><path d="M14 8a4.5 4.5 0 0 1 0 8" /><path d="M17.5 5.5a9 9 0 0 1 0 13" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18" /><path d="M8 3v4m8-4v4" /></>,
  sparkle: <><path d="M12 3v4m0 10v4m9-9h-4M7 12H3" /><path d="m17.5 6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5m4 5V8m4 8v-3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5 13.7 5h2.6l1.3 2.2 2.4 1.3v2.6l1 1.9-1 1.9v2.6l-2.4 1.3L16.3 21h-2.6L12 23.5 10.3 21H7.7l-1.3-2.2L4 17.5v-2.6L3 13l1-1.9V8.5l2.4-1.3L7.7 5h2.6L12 2.5Z" opacity="0" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.66.28 1.13.9 1.51 1h.09a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></>,
  // Illumin8 brand mark: rising half-sun on a horizon with radiating rays + tip dots.
  sunrise: <>
    <line x1="12" y1="10.2" x2="12" y2="8.4" />
    <line x1="14.9" y1="10.8" x2="15.6" y2="9.2" />
    <line x1="9.1" y1="10.8" x2="8.4" y2="9.2" />
    <line x1="17" y1="12.5" x2="18.4" y2="11.3" />
    <line x1="7" y1="12.5" x2="5.6" y2="11.3" />
    <line x1="18.4" y1="14.7" x2="20.1" y2="14.1" />
    <line x1="5.6" y1="14.7" x2="3.9" y2="14.1" />
    <circle cx="12" cy="7.1" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="21.2" cy="13.6" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="2.8" cy="13.6" r="0.7" fill="currentColor" stroke="none" />
    <path d="M7.7 17 A4.3 4.3 0 0 1 16.3 17 Z" fill="currentColor" stroke="none" />
    <line x1="2" y1="17" x2="22" y2="17" />
  </>,
  logout: <><path d="M14 4h-8a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h8" /><path d="M10 12h10.5m-4-4 4 4-4 4" /></>,
  download: <><path d="M12 3v11m0 0 4-4m-4 4-4-4" /><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4c2.5-1.5 5-1.5 7 0s4.5 1.5 7 0v10c-2.5 1.5-5 1.5-7 0s-4.5-1.5-7 0" /></>,
  moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  folder: <><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-11Z" /></>,
};

export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof paths & string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[name]}
    </svg>
  );
}
