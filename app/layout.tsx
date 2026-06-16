import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./styles/shell.css";
import "./styles/sidebar.css";
import "./styles/feed.css";
import "./styles/watch.css";
import "./styles/mobile.css";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Valence — Live Sports Streams",
  description: "Live sports streams — NBA, NCAAB, MLB, ATP, WTA",
  applicationName: "Valence",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Valence",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0c0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
