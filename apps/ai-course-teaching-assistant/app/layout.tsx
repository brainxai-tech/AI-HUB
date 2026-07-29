import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "AI 课程助教",
  description: "面向老师和培训师的 AI 教学包生成工作台",
  icons: {
    icon: `${basePath}/icon.svg`,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="suite-enhanced-root">
      <body className="suite-enhanced">
        {children}
        <Script
          src="/hub/suite-shell.js?v=20260729-course-unified1"
          strategy="afterInteractive"
          data-suite-project="AI · 课程助教"
          data-suite-id="ai-course-teaching-assistant"
          data-suite-api="/course"
          data-suite-hub="/hub/"
        />
      </body>
    </html>
  );
}
