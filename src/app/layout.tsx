import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avrixo DataAgent",
  description:
    "Governed AI analytics with semantic metrics, read-only SQL, charts, and grounded insights",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray100">{children}</body>
    </html>
  );
}
