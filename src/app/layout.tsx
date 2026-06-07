import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Benben Chat",
  description: "Chat UI for Agent Benben",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
