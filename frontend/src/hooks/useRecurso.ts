"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Busca um dado da API e controla os três estados de toda tela: carregando, erro e o dado.
 *
 * - `chave`: muda quando a busca precisa ser refeita (ex.: o id ou os filtros). `null` = ainda não dá
 *   para buscar (id desconhecido, usuário sem permissão): nada é chamado e `carregando` fica falso.
 * - Só a resposta da busca MAIS RECENTE é aplicada: uma resposta atrasada de um filtro antigo não
 *   sobrescreve a do filtro novo, e nada é aplicado depois que o componente sai da tela.
 * - Durante uma nova busca, o dado anterior continua na tela; em caso de erro, volta ao valor inicial.
 */
export function useRecurso<T>(chave: string | null, buscar: () => Promise<T>, inicial: T, mensagemErro = "Não foi possível carregar os dados.") {
  const [dado, setDado] = useState<T>(inicial);
  const [carregando, setCarregando] = useState(chave !== null);
  const [erro, setErro] = useState<string | null>(null);
  // A função e o valor inicial mudam a cada render; quem decide refazer a busca é só a chave.
  const buscarAtual = useRef(buscar);
  buscarAtual.current = buscar;
  const inicialAtual = useRef(inicial);
  const ultimaBusca = useRef(0);

  const recarregar = useCallback(() => {
    const numero = ++ultimaBusca.current;
    if (chave === null) {
      setDado(inicialAtual.current);
      setCarregando(false);
      setErro(null);
      return;
    }
    setCarregando(true);
    setErro(null);
    buscarAtual
      .current()
      .then((resultado) => numero === ultimaBusca.current && setDado(resultado))
      .catch((erroCapturado: unknown) => {
        if (numero !== ultimaBusca.current) return;
        setDado(inicialAtual.current);
        setErro(erroCapturado instanceof Error && erroCapturado.message ? erroCapturado.message : mensagemErro);
      })
      .finally(() => numero === ultimaBusca.current && setCarregando(false));
  }, [chave, mensagemErro]);

  useEffect(() => {
    recarregar();
    return () => {
      ultimaBusca.current++; // saiu da tela ou a chave mudou: ignora a resposta pendente
    };
  }, [recarregar]);

  return { dado, carregando, erro, recarregar, setDado };
}
