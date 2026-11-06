import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

import { GoogleAnalytics } from '@next/third-parties/google'
import { API_CONFIG } from '@/config/api.config';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Simplicity Unchained",
  description: "Executable spending policies with Simplicity. Explore verified transaction approvals on Bitcoin and Liquid.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
      <GoogleAnalytics gaId={API_CONFIG.GOOGLE_ANALYTICS_ID} />
    </html>
  );
}
