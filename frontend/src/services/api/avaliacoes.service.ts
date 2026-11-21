import type { Avaliacao } from "@/types/avaliacao";
import { apiFetch } from "./client";

export interface NovaAvaliacao {
  produtoId: number;
  nota: number;
  comentario: string;
}

export const avaliacoesService = {
  /** GET /produtos/:id/avaliacoes, mais recentes primeiro. */
  async listarPorProduto(produtoId: number): Promise<Avaliacao[]> {
    return apiFetch<Avaliacao[]>(`/produtos/${produtoId}/avaliacoes`);
  },

  /**
   * POST /produtos/:id/avaliacoes (comprador). O nome do autor vem do login; uma avaliação por
   * comprador por produto (409 AVALIACAO_DUPLICADA na segunda).
   */
  async criar({ produtoId, nota, comentario }: NovaAvaliacao): Promise<Avaliacao> {
    return apiFetch<Avaliacao>(`/produtos/${produtoId}/avaliacoes`, { metodo: "POST", corpo: { nota, comentario } });
  },
};
