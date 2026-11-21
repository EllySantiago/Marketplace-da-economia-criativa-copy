import type { ItemCarrinho } from "@/types/carrinho";
import { apiFetch } from "./client";

export interface ProblemaEstoque {
  produtoId: number;
  nome: string;
  disponivel: number;
  solicitado: number;
}

/** O que a API recebe: só produto e quantidade (o preço é sempre o do banco). */
const paraEnvio = (itens: ItemCarrinho[]) => itens.map((item) => ({ produtoId: item.produto.id, quantidade: item.quantidade }));

/**
 * Carrinho do comprador logado, salvo no banco (docs/api.md, seção 6). Quem não está logado fica
 * só com o carrinho do navegador (Zustand + localStorage), que é enviado logo depois do login.
 */
export const carrinhoService = {
  /** GET /carrinho (comprador). */
  async obter(): Promise<ItemCarrinho[]> {
    return apiFetch<ItemCarrinho[]>("/carrinho");
  },

  /** PUT /carrinho: substitui o carrinho inteiro (lista vazia = esvaziar). */
  async salvar(itens: ItemCarrinho[]): Promise<ItemCarrinho[]> {
    return apiFetch<ItemCarrinho[]>("/carrinho", { metodo: "PUT", corpo: { itens: paraEnvio(itens) } });
  },

  /**
   * POST /carrinho/validar: confere o estoque ATUAL de cada item antes do checkout. O carrinho
   * não reserva estoque, então outra pessoa pode ter comprado a peça. Lista vazia = tudo certo.
   */
  async validarEstoque(itens: ItemCarrinho[]): Promise<ProblemaEstoque[]> {
    return apiFetch<ProblemaEstoque[]>("/carrinho/validar", { metodo: "POST", corpo: { itens: paraEnvio(itens) } });
  },
};
