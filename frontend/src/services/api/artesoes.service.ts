import type { Artesao } from "@/types/artesao";
import { apiFetch } from "./client";

/** Números do painel do artesão, calculados no banco (só a parte dele, sem pedidos cancelados). */
export interface IndicadoresArtesao {
  totalVendido: number;
  totalPedidos: number;
  pedidosPendentes: number;
  produtosAtivos: number;
}

export const artesoesService = {
  /** GET /artesoes/eu/indicadores (artesão logado). */
  async indicadores(): Promise<IndicadoresArtesao> {
    return apiFetch<IndicadoresArtesao>("/artesoes/eu/indicadores");
  },

  /** Só retorna artesãos já aprovados pela administração — é o que aparece na vitrine pública. */
  async listarTodos(): Promise<Artesao[]> {
    return apiFetch<Artesao[]>("/artesoes");
  },

  /** GET /artesoes/:id: avaliação média, vendas e produtos são calculados pela API. */
  async buscarPorId(id: number): Promise<Artesao> {
    return apiFetch<Artesao>(`/artesoes/${id}`);
  },

  /** GET /admin/artesoes/pendentes: fila de aprovação do Painel Administrativo. */
  async listarPendentes(): Promise<Artesao[]> {
    return apiFetch<Artesao[]>("/admin/artesoes/pendentes");
  },

  /** PATCH /admin/artesoes/:id/aprovar: os produtos dele entram na vitrine na hora. */
  async aprovar(id: number): Promise<Artesao> {
    return apiFetch<Artesao>(`/admin/artesoes/${id}/aprovar`, { metodo: "PATCH" });
  },

  /** DELETE /admin/artesoes/:id: só para cadastro pendente (apaga o usuário e os produtos dele). */
  async rejeitar(id: number): Promise<void> {
    await apiFetch<void>(`/admin/artesoes/${id}`, { metodo: "DELETE" });
  },
};
