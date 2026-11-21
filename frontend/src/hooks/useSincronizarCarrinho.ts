"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { carrinhoService } from "@/services/api/carrinho.service";
import type { ItemCarrinho } from "@/types/carrinho";

const ESPERA_MS = 400; // junta cliques seguidos no "+" numa requisição só
const QUANTIDADE_MAXIMA = 99; // limite do PUT /carrinho

/** Junta o carrinho do navegador com o do servidor: cada produto uma vez, com a maior quantidade. */
function juntar(locais: ItemCarrinho[], doServidor: ItemCarrinho[]): ItemCarrinho[] {
  const porProduto = new Map<number, ItemCarrinho>();
  for (const item of doServidor) porProduto.set(item.produto.id, item);
  for (const item of locais) {
    const existente = porProduto.get(item.produto.id);
    const quantidade = Math.min(QUANTIDADE_MAXIMA, Math.max(item.quantidade, existente?.quantidade ?? 0));
    porProduto.set(item.produto.id, { produto: existente?.produto ?? item.produto, quantidade });
  }
  return [...porProduto.values()];
}

/**
 * Carrinho persistido (HU do carrinho, etapa D na API). Para o comprador logado:
 *  1. ao entrar, busca o carrinho salvo, junta com o que ele montou antes de logar e salva o resultado;
 *  2. depois, toda mudança no carrinho é salva no servidor (PUT /carrinho);
 *  3. ao sair, o carrinho local é limpo no useAuth.sair (o do servidor continua lá para o próximo login).
 * Artesão e admin não têm carrinho na API: o deles fica só no navegador.
 * Fica no layout raiz (components/layout/SessaoInicial.tsx).
 */
export function useSincronizarCarrinho() {
  const usuario = useAuthStore((state) => state.usuario);
  const compradorId = usuario?.perfil === "comprador" ? usuario.id : null;

  useEffect(() => {
    if (compradorId === null) return;
    let ativo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let pararDeOuvir: (() => void) | undefined;
    const { substituirItens } = useCartStore.getState();

    /** Se o servidor recusar (ex.: produto saiu da vitrine), volta ao que está salvo nele. */
    function ressincronizar() {
      carrinhoService.obter().then((itens) => ativo && substituirItens(itens)).catch(() => undefined);
    }

    async function iniciar() {
      try {
        const doServidor = await carrinhoService.obter();
        if (!ativo) return;
        const locais = useCartStore.getState().itens;
        const juntos = juntar(locais, doServidor);
        const salvos = locais.length > 0 ? await carrinhoService.salvar(juntos) : doServidor;
        if (!ativo) return;
        substituirItens(salvos);
      } catch {
        if (!ativo) return;
        ressincronizar();
      }

      pararDeOuvir = useCartStore.subscribe((estado, anterior) => {
        if (estado.itens === anterior.itens) return;
        clearTimeout(espera);
        espera = setTimeout(() => {
          // Saiu da conta nesse meio-tempo: não salva (o carrinho limpo na saída não é do servidor).
          if (useAuthStore.getState().usuario?.id !== compradorId) return;
          carrinhoService.salvar(useCartStore.getState().itens).catch(ressincronizar);
        }, ESPERA_MS);
      });
    }

    iniciar();
    return () => {
      ativo = false;
      clearTimeout(espera);
      pararDeOuvir?.();
    };
  }, [compradorId]);
}
