import type { Artesao, DadosNovoArtesao } from "@/types/artesao";
import { artesoesMock } from "@/mocks/artesoes.mock";
import { apiFetch, delay, ApiError } from "./client";

const artesoes: Artesao[] = [...artesoesMock];
let proximoId = Math.max(...artesoes.map((artesao) => artesao.id)) + 1;

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

  /** Fila de aprovação exibida no Painel Administrativo. */
  async listarPendentes(): Promise<Artesao[]> {
    return delay(artesoes.filter((artesao) => !artesao.aprovado));
  },

  async aprovar(id: number): Promise<Artesao> {
    const artesao = artesoes.find((item) => item.id === id);
    if (!artesao) throw new ApiError(`Artesão ${id} não encontrado.`);
    artesao.aprovado = true;
    return delay(artesao, 300);
  },

  async rejeitar(id: number): Promise<void> {
    const indice = artesoes.findIndex((item) => item.id === id);
    if (indice === -1) throw new ApiError(`Artesão ${id} não encontrado.`);
    artesoes.splice(indice, 1);
    await delay(null, 300);
  },
};
