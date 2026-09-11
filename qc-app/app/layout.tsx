import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: { default: "閥門零件品質檢驗系統", template: "%s · 品質檢驗" },
  description: "規格引擎 + 檢驗紀錄 + 報告產出",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className="h-full">
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 min-w-0">
            <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-8 md:py-7">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
