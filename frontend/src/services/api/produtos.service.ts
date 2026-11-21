import type { FiltrosProduto, NovoProduto, Produto } from "@/types/produto";
import { apiFetch } from "./client";

export const produtosService = {
  /** GET /produtos: só a vitrine (ativos de artesão aprovado). */
  async listarTodos(): Promise<Produto[]> {
    return apiFetch<Produto[]>("/produtos");
  },

  async buscarPorId(id: number): Promise<Produto> {
    return apiFetch<Produto>(`/produtos/${id}`);
  },

  /**
   * GET /produtos com filtros: a busca (sem acento, em nome, artesão e técnica) e os filtros rodam
   * no banco. Com o artesaoId do próprio artesão logado, a API devolve também os inativos dele.
   */
  async filtrar(filtros: FiltrosProduto): Promise<Produto[]> {
    return apiFetch<Produto[]>("/produtos", {
      query: {
        busca: filtros.busca?.trim(),
        regiao: filtros.regiao,
        tecnica: filtros.tecnica,
        categoria: filtros.categoria,
        artesaoId: filtros.artesaoId,
      },
    });
  },

  /** POST /produtos (artesão). O dono vem do login: o artesaoId do corpo é ignorado pela API. */
  async criar(dados: NovoProduto): Promise<Produto> {
    return apiFetch<Produto>("/produtos", { metodo: "POST", corpo: dados });
  },

  /** PUT /produtos/:id (só o dono). Troca só a foto principal; as outras ficam. */
  async atualizar(id: number, dados: NovoProduto): Promise<Produto> {
    return apiFetch<Produto>(`/produtos/${id}`, { metodo: "PUT", corpo: dados });
  },

  /**
   * DELETE /produtos/:id (só o dono): exclusão LÓGICA. O produto fica inativo, some da vitrine e
   * continua no painel e nos pedidos antigos (a chave estrangeira de item_pedido impede apagar).
   */
  async remover(id: number): Promise<void> {
    await apiFetch<void>(`/produtos/${id}`, { metodo: "DELETE" });
  },
};
