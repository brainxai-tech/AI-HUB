import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 数据分析师",
  description: "本地优先的 CSV 与 Excel 智能分析工作台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="suite-enhanced-root">
      <body className="suite-enhanced">
        {children}
        <Script
          src="/hub/suite-shell.js?v=20260729-data-unified1"
          strategy="afterInteractive"
          data-suite-project="AI · 数据分析师"
          data-suite-id="ai-data-analyst"
          data-suite-api="/data"
          data-suite-hub="/hub/"
        />
      </body>
    </html>
  );
}
