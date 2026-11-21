import { apiFetch } from "./client";

/** Números do Painel Administrativo, lidos da view vw_indicadores_admin. */
export interface IndicadoresAdmin {
  totalUsuarios: number;
  produtosAtivos: number;
  totalPedidos: number;
  /** Soma dos pedidos não cancelados. */
  totalVendas: number;
}

export const adminService = {
  /** GET /admin/indicadores. */
  async indicadores(): Promise<IndicadoresAdmin> {
    return apiFetch<IndicadoresAdmin>("/admin/indicadores");
  },
};
