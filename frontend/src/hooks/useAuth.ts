"use client";

import { useCallback, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { usuariosService } from "@/services/api/usuarios.service";
import { ApiError } from "@/services/api/client";
import type { CredenciaisLogin, DadosCadastro } from "@/types/usuario";
import { useAcao } from "./useAcao";

/**
 * Sessão do usuário. A sessão de verdade é o cookie httpOnly que a API grava no login; o store
 * (Zustand persistido) guarda só os dados do usuário, para o cabeçalho não piscar ao recarregar.
 */
export function useAuth() {
  const usuario = useAuthStore((state) => state.usuario);
  const autenticar = useAuthStore((state) => state.autenticar);
  const limparSessao = useAuthStore((state) => state.sair);
  const login = useAcao(usuariosService.login, "Não foi possível entrar.");
  const cadastro = useAcao(usuariosService.registrar, "Não foi possível criar a conta.");

  const entrar = useCallback(
    async (credenciais: CredenciaisLogin) => {
      const usuarioAutenticado = await login.executar(credenciais);
      if (usuarioAutenticado) autenticar(usuarioAutenticado);
      return usuarioAutenticado;
    },
    [login.executar, autenticar],
  );

  const cadastrar = useCallback(
    async (dados: DadosCadastro) => {
      const novoUsuario = await cadastro.executar(dados);
      if (novoUsuario) autenticar(novoUsuario);
      return novoUsuario;
    },
    [cadastro.executar, autenticar],
  );

  /** Apaga o cookie na API e os dados locais. Se a rede falhar, sai do mesmo jeito neste navegador. */
  const sair = useCallback(async () => {
    try {
      await usuariosService.sair();
    } catch {
      // sem rede: o cookie vence sozinho em 8 h; aqui o importante é a tela sair da conta
    }
    const eraComprador = useAuthStore.getState().usuario?.perfil === "comprador";
    limparSessao();
    // O carrinho do comprador está salvo no servidor: não fica neste navegador para a próxima pessoa.
    if (eraComprador) useCartStore.getState().limparCarrinho();
  }, [limparSessao]);

  const carregando = login.enviando || cadastro.enviando;
  const erro = login.erro ?? cadastro.erro;
  return { usuario, estaAutenticado: Boolean(usuario), carregando, erro, entrar, cadastrar, sair };
}

let sessaoConferida = false;

/**
 * Confere uma vez por carregamento da página se o cookie ainda vale (GET /auth/eu). Sessão vencida
 * (401) limpa o usuário guardado; dados mudados no servidor (ex.: artesão aprovado) são atualizados.
 * Fica no layout raiz (components/layout/SessaoInicial.tsx).
 */
export function useConferirSessao() {
  const usuario = useAuthStore((state) => state.usuario);
  const autenticar = useAuthStore((state) => state.autenticar);
  const limparSessao = useAuthStore((state) => state.sair);

  useEffect(() => {
    if (sessaoConferida || !usuario) return;
    sessaoConferida = true;
    usuariosService
      .eu()
      .then(autenticar)
      .catch((erro) => {
        if (erro instanceof ApiError && erro.status === 401) limparSessao();
      });
  }, [usuario, autenticar, limparSessao]);
}
