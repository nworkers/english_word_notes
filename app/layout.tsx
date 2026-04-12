import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "English Memory Note Maker",
  description: "Upload vocabulary images and generate a printable memory note."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
