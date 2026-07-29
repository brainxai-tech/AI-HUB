import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 法务条款翻译器",
  description: "把复杂合同条款翻译成大白话，拆出你的责任和对方权利。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="suite-enhanced-root">
      <head>
        <link rel="stylesheet" href="/hub/suite-theme.css" />
      </head>
      <body className="suite-enhanced">
        {children}
        <Script
          src="/hub/suite-shell.js?v=20260729-legal-unified1"
          strategy="afterInteractive"
          data-suite-project="AI · 法务条款翻译器"
          data-suite-id="ai-legal-clause-translator"
          data-suite-api="/legal"
          data-suite-hub="/hub/"
        />
      </body>
    </html>
  );
}
