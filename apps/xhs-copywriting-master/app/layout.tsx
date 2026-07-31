import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "小红书文案写作大师",
  description: "面向小红书创作者的 AI 文案工作台",
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
      data-suite-id="xhs-copywriting-master"
      data-suite-kind="tool"
    >
      <body className="suite-enhanced">
        {children}
        <Script
          src="/hub/suite-shell.js?v=20260729-xhs-unified1"
          strategy="afterInteractive"
          data-suite-project="AI · 小红书文案大师"
          data-suite-id="xhs-copywriting-master"
          data-suite-hub="/hub/"
        />
      </body>
    </html>
  );
}
