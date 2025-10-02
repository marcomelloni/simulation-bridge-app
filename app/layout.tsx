import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";

import { Sidebar } from "./components/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Simulation Bridge Console",
  description:
    "Configure and control Simulation Bridge and its agents from a single interface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-zinc-900`}
      >
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1">
            <div className="border-b border-zinc-200 bg-white px-5 py-3 md:hidden">
              <nav className="flex flex-wrap gap-4 text-sm">
                <Link className="font-medium" href="/config/simulation-bridge">
                  Configuration
                </Link>
                <Link className="font-medium" href="/execution">
                  Execution
                </Link>
              </nav>
            </div>
            <main className="mx-auto flex w-full max-w-10xl flex-col gap-6 px-4 py-8 md:px-10">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
