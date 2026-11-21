"use client";

import { useConferirSessao } from "@/hooks/useAuth";
import { useSincronizarCarrinho } from "@/hooks/useSincronizarCarrinho";

/** Confere o cookie de sessão (GET /auth/eu) e mantém o carrinho do comprador no servidor. Não desenha nada. */
export default function SessaoInicial() {
  useConferirSessao();
  useSincronizarCarrinho();
  return null;
}
