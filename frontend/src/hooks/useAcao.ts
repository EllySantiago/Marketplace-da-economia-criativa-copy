"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Envia uma ação para a API (salvar, remover, confirmar...) com o próprio estado de envio e erro.
 * `executar` devolve o resultado da ação, ou `null` se ela falhar; nesse caso a mensagem do erro
 * (a do contrato da API, ou `mensagemPadrao`) fica em `erro`, pronta para o `<ErrorState />`.
 */
export function useAcao<A extends unknown[], R>(acao: (...argumentos: A) => Promise<R>, mensagemPadrao: string) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const acaoAtual = useRef(acao);
  acaoAtual.current = acao;

  const executar = useCallback(
    async (...argumentos: A): Promise<R | null> => {
      setEnviando(true);
      setErro(null);
      try {
        return await acaoAtual.current(...argumentos);
      } catch (erroCapturado) {
        setErro(erroCapturado instanceof Error && erroCapturado.message ? erroCapturado.message : mensagemPadrao);
        return null;
      } finally {
        setEnviando(false);
      }
    },
    [mensagemPadrao],
  );

  return { executar, enviando, erro };
}
