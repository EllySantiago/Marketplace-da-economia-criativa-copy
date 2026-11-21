"use client";

import { adminService, type IndicadoresAdmin } from "@/services/api/admin.service";
import { analisesService } from "@/services/api/analises.service";
import { useRecurso } from "./useRecurso";

/** Indicadores do Painel Administrativo (GET /admin/indicadores). */
export function useIndicadoresAdmin(ativo: boolean) {
  const { dado, recarregar } = useRecurso(ativo ? "admin" : null, () => adminService.indicadores(), null as IndicadoresAdmin | null);
  return { indicadores: dado, recarregar };
}

/** Categoria sugerida pelo módulo de IA para cada produto da vitrine (GET /admin/classificacoes). */
export function useClassificacoes(ativo: boolean) {
  const { dado, carregando, erro, recarregar } = useRecurso(ativo ? "classificacoes" : null, () => analisesService.classificacoes(), null as Awaited<ReturnType<typeof analisesService.classificacoes>> | null);
  return { itens: dado?.itens ?? [], indisponivel: dado?.fonte === "indisponivel", carregando, erro, recarregar };
}
