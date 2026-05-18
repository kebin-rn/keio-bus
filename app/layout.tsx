import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "京王バス運行情報マップ",
  description:
    "公共交通オープンデータセンター (ODPT) のデータを利用した京王バスのリアルタイム運行情報",
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
