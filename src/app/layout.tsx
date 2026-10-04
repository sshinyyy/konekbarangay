import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "./components/site-header";
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
  title: "KoneBarangay | Barangay Services",
  description: "Barangay document issuance, resident profiling, and QR verification for public services.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="app-content">{children}</div>
        <footer className="site-footer">
          <div className="site-footer__inner">
            <span>KoneBarangay <span aria-hidden="true">·</span> Barangay services</span>
            <Link href="/">Home</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
