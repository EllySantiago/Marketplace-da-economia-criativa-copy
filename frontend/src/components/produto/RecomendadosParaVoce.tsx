"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRecomendacoesParaMim } from "@/hooks/useRecomendacoes";
import ProductList from "./ProductList";

/**
 * RF-06: seção da página inicial com recomendações para o comprador logado. Visitantes,
 * artesãos e administradores não veem a seção; lista vazia também a esconde (RF-08).
 */
export default function RecomendadosParaVoce() {
  const { usuario } = useAuth();
  const comprador = usuario?.perfil === "comprador" ? usuario : null;
  const recomendados = useRecomendacoesParaMim(comprador?.id ?? null, 4);

  if (!comprador || recomendados.length === 0) return null;

  return (
    <ProductList
      id="recomendados-para-voce"
      produtos={recomendados}
      titulo={`Escolhidos para você, ${comprador.nome.split(" ")[0]}`}
      descricao="Sugestões a partir das suas compras e das peças mais procuradas no Origem."
    />
  );
}
