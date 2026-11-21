"use client";

import type { Produto } from "@/types/produto";
import { recomendacoesService } from "@/services/api/recomendacoes.service";
import { useRecurso } from "./useRecurso";

/**
 * Peças parecidas com o produto (RF-01). `produtoId` null = produto ainda carregando. Qualquer erro
 * vira lista vazia: a seção some, sem mostrar erro ao comprador (RF-08).
 */
export function useRecomendacoesSimilares(produtoId: number | null, limite: number) {
  const { dado } = useRecurso(produtoId === null ? null : `${produtoId}:${limite}`, () => recomendacoesService.recomendarSimilares(produtoId ?? 0, limite), [] as Produto[]);
  return dado;
}

/** "Escolhidos para você" (RF-06) do comprador logado. `usuarioId` null = visitante, artesão ou admin. */
export function useRecomendacoesParaMim(usuarioId: number | null, limite: number) {
  const { dado } = useRecurso(usuarioId === null ? null : `${usuarioId}:${limite}`, () => recomendacoesService.recomendarParaUsuario(usuarioId ?? 0, "", limite), [] as Produto[]);
  return dado;
}
