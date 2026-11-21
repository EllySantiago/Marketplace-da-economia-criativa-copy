import type { DadosNovoPedido, Pedido, StatusPedido } from "@/types/pedido";
import { apiFetch } from "./client";

/** Mesmas transições que a API aceita em PATCH /pedidos/:codigo/status (docs/api.md, seção 6). */
const transicoesStatus: Record<StatusPedido, StatusPedido[]> = {
  pendente: ["confirmado", "cancelado"],
  confirmado: ["em_producao", "cancelado"],
  em_producao: ["enviado", "cancelado"],
  enviado: ["entregue"],
  entregue: [],
  cancelado: [],
};

export function obterProximosStatus(status: StatusPedido): StatusPedido[] {
  return [...transicoesStatus[status]];
}

/**
 * Pedidos pela API. GET /pedidos decide o escopo pelo perfil do LOGIN (comprador: os dele; artesão:
 * os que têm item dele; admin: todos), então os argumentos de listarPorCliente e listarPorArtesao
 * ficaram só para as telas não mudarem: quem escolhe é o servidor, não o navegador.
 */
export const pedidosService = {
  async listarTodos(): Promise<Pedido[]> {
    return apiFetch<Pedido[]>("/pedidos");
  },

  async listarPorCliente(_email: string): Promise<Pedido[]> {
    return apiFetch<Pedido[]>("/pedidos");
  },

  async listarPorArtesao(_artesaoId: number): Promise<Pedido[]> {
    return apiFetch<Pedido[]>("/pedidos");
  },

  /** GET /pedidos/:codigo: 403 se o pedido for de outra pessoa, 404 se não existir. */
  async buscarPorCodigo(codigo: string): Promise<Pedido> {
    return apiFetch<Pedido>(`/pedidos/${encodeURIComponent(codigo)}`);
  },

  /** PATCH /pedidos/:codigo/status (artesão com item no pedido). Cancelar devolve o estoque na API. */
  async atualizarStatus(codigo: string, _artesaoId: number, novoStatus: StatusPedido): Promise<Pedido> {
    return apiFetch<Pedido>(`/pedidos/${encodeURIComponent(codigo)}/status`, { metodo: "PATCH", corpo: { status: novoStatus } });
  },

  /**
   * POST /pedidos: checkout seguro do FCCPD U1 (sem vender mais do que o estoque). O comprador vem
   * do login e o preço vem do banco: o navegador manda só produto e quantidade.
   */
  async criarPedido(dados: DadosNovoPedido): Promise<Pedido> {
    return apiFetch<Pedido>("/pedidos", {
      metodo: "POST",
      corpo: {
        enderecoEntrega: dados.enderecoEntrega,
        metodoPagamento: dados.metodoPagamento,
        itens: dados.itens.map((item) => ({ produtoId: item.produto.id, quantidade: item.quantidade })),
      },
    });
  },
};
