import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 中国象棋",
  description: "用 Pikafish 对弈、提示和赛后分析，并用多模型教练解释关键走法。",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
