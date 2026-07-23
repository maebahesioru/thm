import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "テレビヒカマニ (THM)",
  description: "テレビヒカマニ公式サイト - 24時間ヒカマニ放送局",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
            <Link href="/" className="font-black text-lg tracking-tight">
              <span className="text-red-500">THM</span> テレビヒカマニ
            </Link>
            <nav className="flex gap-4 text-sm text-neutral-300">
              <Link href="/" className="hover:text-white">
                番組表
              </Link>
              <Link href="/watch" className="hover:text-white">
                視聴
              </Link>
              <Link href="/admin" className="hover:text-white">
                管理
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>
        <footer className="border-t border-neutral-800 py-4 text-center text-xs text-neutral-500">
          テレビヒカマニ (THM) - 非公式ファン放送局
        </footer>
      </body>
    </html>
  );
}
