"use client";

import { useCallback, useEffect, useState } from "react";
import { adminService, type IndicadoresAdmin } from "@/services/api/admin.service";
import { analisesService, type Classificacao } from "@/services/api/analises.service";

/** Indicadores do Painel Administrativo (GET /admin/indicadores). */
export function useIndicadoresAdmin(ativo: boolean) {
  const [indicadores, setIndicadores] = useState<IndicadoresAdmin | null>(null);

  const carregar = useCallback(() => {
    if (!ativo) return;
    adminService.indicadores().then(setIndicadores).catch(() => setIndicadores(null));
  }, [ativo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { indicadores, recarregar: carregar };
}

/** Categoria sugerida pelo módulo de IA para cada produto da vitrine (GET /admin/classificacoes). */
export function useClassificacoes(ativo: boolean) {
  const [itens, setItens] = useState<Classificacao[]>([]);
  const [indisponivel, setIndisponivel] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (!ativo) return;
    setCarregando(true);
    setErro(null);
    analisesService
      .classificacoes()
      .then((resposta) => {
        setItens(resposta.itens);
        setIndisponivel(resposta.fonte === "indisponivel");
      })
      .catch((erroCapturado: Error) => setErro(erroCapturado.message))
      .finally(() => setCarregando(false));
  }, [ativo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { itens, indisponivel, carregando, erro, recarregar: carregar };
}
