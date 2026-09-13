import type { Metadata } from "next";
import { env } from "@/lib/env";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsApp Automation",
  description: "Send birthday wishes and renewal reminders over the WhatsApp Cloud API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <span className="brand">
              <span className="brand-mark" aria-hidden="true">W</span>
              WhatsApp Automation
            </span>
            <Nav />
            <span className="spacer" />
            <span className={`badge ${env.mock ? "badge-warn" : "badge-ok"}`}>
              {env.mock ? "MOCK MODE" : "LIVE"}
            </span>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
