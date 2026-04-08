import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "cumulAnael — Cumul & Démission",
  description: "Analyse du cumul des mandats et des démissions des élus municipaux — Municipales 2020 & 2026",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
