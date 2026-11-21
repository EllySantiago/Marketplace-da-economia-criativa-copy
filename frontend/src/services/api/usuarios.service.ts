import type { CredenciaisLogin, DadosCadastro, Usuario } from "@/types/usuario";
import { apiFetch } from "./client";

/** Resposta de login e cadastro. O token também vai no cookie httpOnly; o frontend usa só o usuário. */
interface Sessao {
  token: string;
  usuario: Usuario;
}

export const usuariosService = {
  /** POST /auth/login. A API grava o cookie de sessão; o token do corpo é descartado de propósito. */
  async login(credenciais: CredenciaisLogin): Promise<Usuario> {
    const { usuario } = await apiFetch<Sessao>("/auth/login", { metodo: "POST", corpo: credenciais });
    return usuario;
  },

  /**
   * POST /auth/registrar. Artesão precisa de região (artesao.regiao_id é obrigatório no banco) e
   * nasce não aprovado; administrador nunca se autocadastra.
   */
  async registrar(dados: DadosCadastro): Promise<Usuario> {
    const corpo = dados.perfil === "artesao" ? dados : { ...dados, regiao: undefined };
    const { usuario } = await apiFetch<Sessao>("/auth/registrar", { metodo: "POST", corpo });
    return usuario;
  },

  /** GET /auth/eu: confirma a sessão do cookie ao recarregar a página (401 = sessão vencida). */
  async eu(): Promise<Usuario> {
    return apiFetch<Usuario>("/auth/eu");
  },

  /** POST /auth/sair: a API apaga o cookie de sessão. */
  async sair(): Promise<void> {
    await apiFetch<void>("/auth/sair", { metodo: "POST" });
  },

  async buscarPorId(id: number): Promise<Usuario> {
    return apiFetch<Usuario>(`/usuarios/${id}`);
  },
};
