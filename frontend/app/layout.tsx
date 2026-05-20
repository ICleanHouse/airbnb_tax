import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Host Cleaners Bulgaria",
  description: "Verified turnover cleaners for Bulgarian short-term rental hosts.",
  applicationName: "Host Cleaner Marketplace",
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
      <body>{children}</body>
    </html>
  );
}
