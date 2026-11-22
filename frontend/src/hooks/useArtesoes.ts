"use client";

import type { Artesao } from "@/types/artesao";
import { artesoesService, type IndicadoresArtesao } from "@/services/api/artesoes.service";
import { useRecurso } from "./useRecurso";

/** Lista os artesãos aprovados, tratando carregando/erro/vazio. */
export function useArtesoes() {
  const { dado, carregando, erro } = useRecurso("todos", () => artesoesService.listarTodos(), [] as Artesao[]);
  return { artesoes: dado, carregando, erro };
}

/** Busca um artesão por id, tratando carregando/erro/não encontrado. Id ainda desconhecido: espera. */
export function useArtesao(id: number) {
  const { dado, carregando, erro } = useRecurso(id > 0 ? `${id}` : null, () => artesoesService.buscarPorId(id), null as Artesao | null, "Artesão não encontrado.");
  return { artesao: dado, carregando, erro };
}

/** Fila de artesãos pendentes de aprovação, usada no Painel Administrativo. */
export function useArtesoesPendentes() {
  const { dado, carregando, erro, recarregar } = useRecurso("pendentes", () => artesoesService.listarPendentes(), [] as Artesao[]);

  async function aprovar(id: number) {
    await artesoesService.aprovar(id);
    recarregar();
  }

  async function rejeitar(id: number) {
    await artesoesService.rejeitar(id);
    recarregar();
  }

  return { pendentes: dado, carregando, erro, aprovar, rejeitar };
}

/** Indicadores do painel do artesão logado (GET /artesoes/eu/indicadores), com recarga após mudanças. */
export function useIndicadoresArtesao(ativo: boolean) {
  const { dado, erro, recarregar } = useRecurso(ativo ? "eu" : null, () => artesoesService.indicadores(), null as IndicadoresArtesao | null);
  return { indicadores: dado, erro, recarregar };
}
