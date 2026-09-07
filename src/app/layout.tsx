import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marcación y Horarios",
  description: "Sistema de gestión de personal, horarios y asistencia",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
