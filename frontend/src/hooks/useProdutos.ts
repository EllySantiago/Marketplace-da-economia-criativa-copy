"use client";

import type { FiltrosProduto, NovoProduto, Produto } from "@/types/produto";
import { produtosService } from "@/services/api/produtos.service";
import { useRecurso } from "./useRecurso";
import { useAcao } from "./useAcao";

/** Lista produtos (com filtros opcionais), tratando os 3 estados obrigatórios: carregando/erro/vazio. */
export function useProdutos(filtros?: FiltrosProduto) {
  const atuais = filtros ?? {};
  // Painel com o artesão ainda desconhecido (-1 antes do login carregar): nada a buscar.
  const semArtesao = atuais.artesaoId !== undefined && !(atuais.artesaoId > 0);
  const { dado, carregando, erro, recarregar } = useRecurso(
    semArtesao ? null : JSON.stringify(atuais),
    () => (Object.keys(atuais).length ? produtosService.filtrar(atuais) : produtosService.listarTodos()),
    [] as Produto[],
    "Não foi possível carregar os produtos.",
  );
  return { produtos: dado, carregando, erro, recarregar };
}

/** Busca um único produto por id, tratando carregando/erro/não encontrado. */
export function useProduto(id: number) {
  const { dado, carregando, erro } = useRecurso(`${id}`, () => produtosService.buscarPorId(id), null as Produto | null, "Produto não encontrado.");
  return { produto: dado, carregando, erro };
}

/** Cria ou edita um produto (painel do artesão) com seu próprio estado de carregamento/erro. */
export function useSalvarProduto() {
  const { executar, enviando, erro } = useAcao(
    (dados: NovoProduto, idParaEditar?: number) => (idParaEditar ? produtosService.atualizar(idParaEditar, dados) : produtosService.criar(dados)),
    "Não foi possível salvar o produto.",
  );
  return { salvar: executar, enviando, erro };
}

/** Desativa um produto do catálogo (painel do artesão). Devolve true se deu certo. */
export function useRemoverProduto() {
  const { executar, enviando, erro } = useAcao(async (id: number) => {
    await produtosService.remover(id);
    return true;
  }, "Não foi possível remover o produto.");
  const remover = async (id: number) => (await executar(id)) === true;
  return { remover, removendo: enviando, erro };
}
