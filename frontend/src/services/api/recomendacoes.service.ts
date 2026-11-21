import type { Produto } from "@/types/produto";
import { apiFetch } from "./client";

/**
 * Recomendações pela API (docs/api.md, seção 7b). A API chama o módulo de IA com o usuário do
 * LOGIN e devolve os produtos completos do banco (preço e estoque de agora). Se a IA cair ou
 * passar de 2 s (RF-08 / RNF-02), a própria API responde com os mais vendidos, então o frontend
 * não precisa mais de cálculo de reserva nem de falar com a IA direto.
 */
interface RespostaRecomendacoes {
  fonte: "ia" | "popularidade";
  recomendacoes: (Produto & { criterio: string; score: number })[];
}

export const recomendacoesService = {
  /** RF-01: peças parecidas, na página do produto. */
  async recomendarSimilares(produtoId: number, limite = 4): Promise<Produto[]> {
    const { recomendacoes } = await apiFetch<RespostaRecomendacoes>(`/recomendacoes/produtos/${produtoId}`, { query: { limite } });
    return recomendacoes;
  },

  /**
   * RF-06: "Escolhidos para você" (comprador logado). Os argumentos ficaram só para a tela não
   * mudar: o usuário vem do cookie de sessão, nunca de um cabeçalho que o navegador possa forjar.
   */
  async recomendarParaUsuario(_usuarioId: number, _email: string, limite = 4): Promise<Produto[]> {
    const { recomendacoes } = await apiFetch<RespostaRecomendacoes>("/recomendacoes/eu", { query: { limite } });
    return recomendacoes;
  },
};
