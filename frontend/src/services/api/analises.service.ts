import { apiFetch } from "./client";

/**
 * Sentimento e classificação do módulo de IA, repassados pela API (docs/api.md, seção 7c). Com a
 * IA fora do ar, a API responde 200 com fonte "indisponivel" e a tela só esconde o selo.
 */
export type RotuloSentimento = "positivo" | "neutro" | "negativo";

export interface Sentimento {
  produtoId: number;
  fonte: "ia" | "indisponivel";
  resumo: {
    total: number;
    porRotulo: Record<RotuloSentimento, number>;
    rotuloGeral: RotuloSentimento | null;
    pontuacaoMedia: number | null;
  } | null;
  /** Mesmo id de GET /produtos/:id/avaliacoes. */
  avaliacoes: { id: number; sentimento: RotuloSentimento; pontuacao: number }[];
  modelo: string | null;
}

export interface Classificacao {
  produtoId: number;
  nome: string;
  artesao: string;
  categoriaAtual: string;
  classe: string;
  confianca: number;
  /** revisao = a categoria sugerida pelo texto difere da cadastrada, ou a confiança é baixa. */
  status: "aprovado" | "revisao";
  palavras: string[];
}

export const analisesService = {
  /** GET /produtos/:id/sentimento (público). */
  async sentimento(produtoId: number): Promise<Sentimento> {
    return apiFetch<Sentimento>(`/produtos/${produtoId}/sentimento`);
  },

  /** GET /admin/classificacoes (admin): os que precisam de revisão vêm primeiro. */
  async classificacoes(): Promise<{ fonte: "ia" | "indisponivel"; itens: Classificacao[] }> {
    return apiFetch(`/admin/classificacoes`);
  },
};
