"use client";

import { useState } from "react";
import { Icon } from "./icons";

/** Flips the `dark` class on <html> instantly and persists it in a cookie
    so the server renders the right theme on the next request (no flash). */
export default function ThemeToggle({ initialDark }: { initialDark: boolean }) {
  const [dark, setDark] = useState(initialDark);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    document.cookie = `i8_theme=${next ? "dark" : "light"};path=/;max-age=31536000;samesite=lax`;
  };

  return (
    <button onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-full text-soft transition-colors hover:bg-hairline hover:text-ink-hover">
      <Icon name={dark ? "sun" : "moon"} className="h-[18px] w-[18px]" />
    </button>
  );
}
