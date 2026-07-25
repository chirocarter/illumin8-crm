import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Illumin8 Outreach", template: "%s · Illumin8 Outreach" },
  description: "Community outreach command center for Illumin8 Chiropractic",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Illumin8",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1518" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const dark = store.get("i8_theme")?.value === "dark";

  return (
    <html lang="en" className={dark ? "dark" : undefined} suppressHydrationWarning>
      <body className="font-sans">{children}</body>
    </html>
  );
}
