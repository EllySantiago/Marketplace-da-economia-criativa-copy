import { apiFetch } from "./client";

/** Opções dos selects (vitrine e formulário de produto), vindas das tabelas regiao, categoria e tecnica. */
export interface OpcoesFiltro {
  regioes: string[];
  categorias: string[];
  tecnicas: string[];
}

export const filtrosService = {
  /** GET /filtros (com cache de 30 s na API). */
  async listar(): Promise<OpcoesFiltro> {
    return apiFetch<OpcoesFiltro>("/filtros");
  },
};
