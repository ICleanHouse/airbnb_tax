import "./globals.css";
import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#ff385c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  );
}
