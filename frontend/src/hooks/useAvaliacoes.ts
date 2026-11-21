"use client";

import type { Avaliacao } from "@/types/avaliacao";
import { avaliacoesService, type NovaAvaliacao } from "@/services/api/avaliacoes.service";
import { analisesService, type Sentimento } from "@/services/api/analises.service";
import { useRecurso } from "./useRecurso";
import { useAcao } from "./useAcao";

/** Lista as avaliações de um produto, tratando carregando/erro/vazio. */
export function useAvaliacoes(produtoId: number) {
  const { dado, carregando, erro, recarregar } = useRecurso(`${produtoId}`, () => avaliacoesService.listarPorProduto(produtoId), [] as Avaliacao[]);
  return { avaliacoes: dado, carregando, erro, recarregar };
}

/** Envia uma nova avaliação, com seu próprio estado de envio/erro. */
export function useCriarAvaliacao() {
  const { executar, enviando, erro } = useAcao((dados: NovaAvaliacao) => avaliacoesService.criar(dados), "Não foi possível enviar sua avaliação.");
  return { criar: executar, enviando, erro };
}

/**
 * Sentimento das avaliações calculado pelo módulo de IA (GET /produtos/:id/sentimento). `versao`
 * muda quando uma avaliação nova entra, para recalcular. IA fora ou erro: null (a tela esconde o selo).
 */
export function useSentimento(produtoId: number, versao = 0) {
  const { dado } = useRecurso(`${produtoId}:${versao}`, () => analisesService.sentimento(produtoId), null as Sentimento | null);
  return dado?.fonte === "ia" ? dado : null;
}
