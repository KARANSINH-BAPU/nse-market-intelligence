import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "KP — NSE Market Intelligence",
    template: "%s | KP",
  },
  description:
    "KP is a real-time AI-powered NSE market intelligence platform combining live data, " +
    "machine learning predictions, technical analysis, and professional financial analytics.",
  keywords: ["NSE", "stock market", "AI trading", "market intelligence", "India stocks", "KP"],
  authors: [{ name: "KP Team" }],
  robots: "noindex,nofollow",   // Internal tool — do not index
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="kp-shell">
        {children}
      </body>
    </html>
  );
}
