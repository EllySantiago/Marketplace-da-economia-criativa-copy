"use client";

import { useEffect, useState } from "react";
import { filtrosService, type OpcoesFiltro } from "@/services/api/filtros.service";
import { REGIOES } from "@/constants/regioes";
import { CATEGORIAS } from "@/constants/categorias";
import { TECNICAS } from "@/constants/tecnicas";

/** Valores iniciais enquanto a API responde (e se ela falhar): as listas fixas da U1. */
const PADRAO: OpcoesFiltro = { regioes: [...REGIOES], categorias: [...CATEGORIAS], tecnicas: [...TECNICAS] };

// Uma requisição por carregamento da página, compartilhada por todos os componentes que usam o hook.
let pedido: Promise<OpcoesFiltro> | null = null;

/** Regiões, categorias e técnicas cadastradas no banco (GET /filtros). */
export function useFiltros(): OpcoesFiltro {
  const [opcoes, setOpcoes] = useState<OpcoesFiltro>(PADRAO);

  useEffect(() => {
    let ativo = true;
    pedido ??= filtrosService.listar().catch((erro) => {
      pedido = null; // tenta de novo na próxima montagem
      throw erro;
    });
    pedido.then((resultado) => ativo && setOpcoes(resultado)).catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  return opcoes;
}
