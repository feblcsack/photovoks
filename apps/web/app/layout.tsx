import type { Metadata, Viewport } from "next";
import React from "react";
import { Caveat, Inter, Patrick_Hand } from "next/font/google";
import "./globals.css";

// Display (titles, buttons) — handwritten
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["500", "700"] });
// Booth + visitor body copy — friendly hand-lettered but readable
const hand = Patrick_Hand({ variable: "--font-hand", subsets: ["latin"], weight: "400" });
// Admin data (tables, forms) — plain & legible
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Photovoks",
  description: "Photobooth experience",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FDFAF3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${caveat.variable} ${hand.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
