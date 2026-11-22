"use client";

import { useState } from "react";
import type { DadosNovoPedido, Pedido, StatusPedido } from "@/types/pedido";
import { pedidosService } from "@/services/api/pedidos.service";
import { useRecurso } from "./useRecurso";
import { useAcao } from "./useAcao";

type Origem = { tipo: "cliente"; email: string } | { tipo: "artesao"; artesaoId: number } | { tipo: "todos" };

/** Lista pedidos por cliente, por artesão ou todos (admin) — o escopo real vem do perfil do login. */
export function usePedidos(origem: Origem) {
  const { dado: pedidos, carregando, erro, recarregar, setDado } = useRecurso(
    JSON.stringify(origem),
    () =>
      origem.tipo === "cliente"
        ? pedidosService.listarPorCliente(origem.email)
        : origem.tipo === "artesao"
          ? pedidosService.listarPorArtesao(origem.artesaoId)
          : pedidosService.listarTodos(),
    [] as Pedido[],
    "Não foi possível carregar os pedidos.",
  );
  const [salvandoCodigo, setSalvandoCodigo] = useState<string | null>(null);
  const [erroAtualizacao, setErroAtualizacao] = useState<string | null>(null);

  /**
   * `salvandoCodigo` guarda o código do pedido em atualização (em vez de um booleano
   * único), pra que só a linha daquele pedido fique desativada/mostre "Salvando..." —
   * os outros pedidos continuam interativos normalmente.
   */
  async function atualizarStatus(codigo: string, novoStatus: StatusPedido) {
    if (origem.tipo !== "artesao") {
      throw new Error("Apenas artesãos podem atualizar pedidos.");
    }

    setSalvandoCodigo(codigo);
    setErroAtualizacao(null);
    try {
      const pedidoAtualizado = await pedidosService.atualizarStatus(codigo, origem.artesaoId, novoStatus);
      // Atualiza só o pedido alterado, em vez de recarregar a lista inteira — evita o "piscar"
      // da tela voltando pro esqueleto de carregamento.
      setDado((atuais) => atuais.map((pedido) => (pedido.codigo === codigo ? pedidoAtualizado : pedido)));
    } catch (erroCapturado) {
      setErroAtualizacao(erroCapturado instanceof Error ? erroCapturado.message : "Não foi possível atualizar o pedido.");
      throw erroCapturado;
    } finally {
      setSalvandoCodigo(null);
    }
  }

  return { pedidos, carregando, erro, recarregar, atualizarStatus, salvandoCodigo, erroAtualizacao };
}

/** Busca um pedido específico pelo código (usado na tela de confirmação do checkout). */
export function usePedido(codigo: string | null) {
  const { dado, carregando, erro } = useRecurso(codigo, () => pedidosService.buscarPorCodigo(codigo ?? ""), null as Pedido | null);
  return { pedido: dado, carregando, erro };
}

/** Confirma o pedido a partir do carrinho (checkout) com seu próprio estado de envio/erro. */
export function useCriarPedido() {
  const { executar, enviando, erro } = useAcao((dados: DadosNovoPedido) => pedidosService.criarPedido(dados), "Não foi possível confirmar o pedido.");
  return { criar: executar, enviando, erro };
}
