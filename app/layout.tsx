import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "영단어 연습노트",
  description: "영단어 이미지 파일을 업로드하고 PDF 또는 XLS 학습 노트를 생성합니다."
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
