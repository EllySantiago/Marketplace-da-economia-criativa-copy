import type { Metadata } from "next";
import "../styles/globals.css";
import SessaoInicial from "@/components/layout/SessaoInicial";

export const metadata: Metadata = {
  title: "Origem | Artesanato pernambucano",
  description: "Marketplace de artesanato e economia criativa de Pernambuco.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <SessaoInicial />
        {children}
      </body>
    </html>
  );
}
