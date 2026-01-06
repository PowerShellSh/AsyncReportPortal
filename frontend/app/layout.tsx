import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Async Report Portal',
  description: '非同期レポート生成システム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
