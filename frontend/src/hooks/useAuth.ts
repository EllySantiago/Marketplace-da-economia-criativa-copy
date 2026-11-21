"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { usuariosService } from "@/services/api/usuarios.service";
import { ApiError } from "@/services/api/client";
import type { CredenciaisLogin, DadosCadastro } from "@/types/usuario";

/**
 * Sessão do usuário. A sessão de verdade é o cookie httpOnly que a API grava no login; o store
 * (Zustand persistido) guarda só os dados do usuário, para o cabeçalho não piscar ao recarregar.
 */
export function useAuth() {
  const usuario = useAuthStore((state) => state.usuario);
  const autenticar = useAuthStore((state) => state.autenticar);
  const limparSessao = useAuthStore((state) => state.sair);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const entrar = useCallback(
    async (credenciais: CredenciaisLogin) => {
      setCarregando(true);
      setErro(null);
      try {
        const usuarioAutenticado = await usuariosService.login(credenciais);
        autenticar(usuarioAutenticado);
        return usuarioAutenticado;
      } catch (erroCapturado) {
        setErro(erroCapturado instanceof Error ? erroCapturado.message : "Não foi possível entrar.");
        return null;
      } finally {
        setCarregando(false);
      }
    },
    [autenticar],
  );

  const cadastrar = useCallback(
    async (dados: DadosCadastro) => {
      setCarregando(true);
      setErro(null);
      try {
        const novoUsuario = await usuariosService.registrar(dados);
        autenticar(novoUsuario);
        return novoUsuario;
      } catch (erroCapturado) {
        setErro(erroCapturado instanceof Error ? erroCapturado.message : "Não foi possível criar a conta.");
        return null;
      } finally {
        setCarregando(false);
      }
    },
    [autenticar],
  );

  /** Apaga o cookie na API e os dados locais. Se a rede falhar, sai do mesmo jeito neste navegador. */
  const sair = useCallback(async () => {
    try {
      await usuariosService.sair();
    } catch {
      // sem rede: o cookie vence sozinho em 8 h; aqui o importante é a tela sair da conta
    }
    limparSessao();
  }, [limparSessao]);

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
