import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "迹算 · Excel 清洗与可追溯分析",
  description: "用自然语言合并、清洗和分析 Excel，并保留可复核、可回滚的完整操作记录。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="suite-enhanced-root"
      data-suite-id="trace-sheet-workbench"
      data-suite-kind="tool"
    >
      <body className="suite-enhanced">
        {children}
        <Script
          src="/hub/suite-shell.js?v=20260731-tracesheet2"
          strategy="afterInteractive"
          data-suite-project="迹算 · Excel 清洗工作台"
          data-suite-id="trace-sheet-workbench"
          data-suite-hub="/hub/"
        />
      </body>
    </html>
  );
}
