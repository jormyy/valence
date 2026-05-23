import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valence — Live Sports Streams",
  description: "Live sports streams — NBA, NCAAB, MLB, ATP, WTA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
