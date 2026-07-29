import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 围棋",
  description: "Hub-ready 9x9 Go duel with shared model-gateway coaching.",
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
