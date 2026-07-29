import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 国际象棋",
  description: "Hub-ready AI chess duel with shared model-gateway coaching.",
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
