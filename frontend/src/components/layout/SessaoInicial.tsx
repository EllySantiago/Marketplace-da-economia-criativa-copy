"use client";

import { useConferirSessao } from "@/hooks/useAuth";

/** Confere o cookie de sessão ao abrir qualquer página (GET /auth/eu). Não desenha nada. */
export default function SessaoInicial() {
  useConferirSessao();
  return null;
}
