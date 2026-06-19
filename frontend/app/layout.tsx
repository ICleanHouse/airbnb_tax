import type { Metadata, Viewport } from "next";
import CookieConsentBanner from "../components/CookieConsentBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Host Cleaners Bulgaria",
  description: "Verified turnover cleaners for Bulgarian short-term rental hosts.",
  applicationName: "Host Cleaner Marketplace",
  icons: {
    icon: [{ url: "/assets/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ff385c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
