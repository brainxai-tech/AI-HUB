import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "塔罗圣殿",
  description: "一个本地运行的三牌阵塔罗反思工具。",
};

export default function RootLayout({
  children,
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
          data-suite-project="AI · 塔罗解读"
          data-suite-hub="/hub/"
        />
      </body>
    </html>
  );
}
