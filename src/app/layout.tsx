import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maguwo Bonding Quiz - 19 cerita, 19 kejutan",
  description: "A private little quiz for a little more togetherness.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
