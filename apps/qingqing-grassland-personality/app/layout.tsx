import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "青青草原型人格测试器",
  description: "一个轻松、治愈、有梗但计分稳定的草原意象人格测试器。"
};

export const viewport: Viewport = {
  themeColor: "#dbeecb"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="suite-enhanced-root">
      <head>
        <link rel="stylesheet" href="/hub/suite-theme.css?v=20260628-design1" />
      </head>
      <body className="suite-enhanced">
        {children}
        <script
          defer
          src="/hub/suite-shell.js?v=20260628-design1"
          data-suite-project="AI · 草原人格"
          data-suite-hub="/hub/"
        />
      </body>
    </html>
  );
}
