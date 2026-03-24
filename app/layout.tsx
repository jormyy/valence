import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valence",
  description: "Live sports streams — NBA & NCAAB",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0a] text-white">
        <header className="border-b border-white/10 px-6 py-4">
          <a href="/" className="text-xl font-bold tracking-tight text-white">
            valence
          </a>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
