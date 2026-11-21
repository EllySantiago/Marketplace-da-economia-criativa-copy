// ============================================================================
// Cliente do módulo de IA (ia-recomendacao/) — usado pelas recomendações (E.4)
// e pelo sentimento e pela classificação (E.6).
//
// Toda chamada:
//   - se identifica como "backend" no log de uso da IA (X-Origem-Chamador);
//   - leva o usuário que a API autenticou (X-Usuario-Id), nunca o do navegador;
//   - desiste depois de RECOMENDACAO_TIMEOUT_MS (2 s, RF-08 / RNF-02).
// Qualquer falha (rede, status diferente de 2xx, JSON inválido, tempo) vira
// exceção. Quem chama decide o que mostrar no lugar.
// ============================================================================

import { config } from "../config/env.js";

export async function consultarIa(caminho, usuario) {
  const cabecalhos = { "X-Origem-Chamador": "backend" };
  if (usuario) cabecalhos["X-Usuario-Id"] = String(usuario.id);
  const resposta = await fetch(`${config.recomendacaoUrl}${caminho}`, {
    headers: cabecalhos,
    signal: AbortSignal.timeout(config.recomendacaoTimeoutMs),
  });
  if (!resposta.ok) throw new Error(`módulo de IA respondeu ${resposta.status}`);
  return resposta.json();
}

/** Uma linha curta no log quando a IA falha (sem stack trace a cada visita). */
export function avisarIndisponivel(contexto, erro, plano) {
  console.warn(`[${contexto}] módulo de IA indisponível (${erro.name}: ${erro.message}); ${plano}.`);
}
