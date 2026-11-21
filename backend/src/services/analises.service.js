// ============================================================================
// Sentimento e classificação pela API (E.6) — docs/api.md, seção 7c.
//
// Mesmo princípio das recomendações (E.4): o navegador pede à API, e a API
// pede ao módulo de IA. Assim os três modelos da IA (recomendação, sentimento
// e classificação) são consumidos pela aplicação Web pelo mesmo caminho, com
// o log de uso da IA marcando "backend" como quem chamou.
//
// Diferente da recomendação, aqui não existe uma resposta de reserva que faça
// sentido: se a IA cair, a API responde 200 com fonte "indisponivel" e a tela
// simplesmente não mostra o selo de sentimento. A página do produto nunca
// quebra por causa da IA.
// ============================================================================

import * as produtosRepository from "../repositories/produtos.repository.js";
import { avisarIndisponivel, consultarIa } from "../utils/modulo-ia.js";
import { buscarVisivel } from "./produtos.service.js";

const ROTULOS = new Set(["positivo", "neutro", "negativo"]);
const LOTE_CLASSIFICACAO = 4; // chamadas simultâneas à IA no painel do admin

/** Só os campos que a tela usa, conferidos: a IA é outro serviço, a API não repassa qualquer coisa. */
function limparSentimento(corpo) {
  const resumo = corpo?.resumo;
  if (!resumo || typeof resumo.total !== "number" || !Array.isArray(corpo.avaliacoes)) {
    throw new Error("resposta do módulo de IA sem o resumo do sentimento");
  }
  return {
    resumo: {
      total: resumo.total,
      porRotulo: {
        positivo: Number(resumo.porRotulo?.positivo ?? 0),
        neutro: Number(resumo.porRotulo?.neutro ?? 0),
        negativo: Number(resumo.porRotulo?.negativo ?? 0),
      },
      rotuloGeral: ROTULOS.has(resumo.rotuloGeral) ? resumo.rotuloGeral : null,
      pontuacaoMedia: typeof resumo.pontuacaoMedia === "number" ? resumo.pontuacaoMedia : null,
    },
    avaliacoes: corpo.avaliacoes
      .filter((a) => Number.isSafeInteger(Number(a?.id)) && ROTULOS.has(a.sentimento))
      .map((a) => ({ id: Number(a.id), sentimento: a.sentimento, pontuacao: Number(a.pontuacao) || 0 })),
    modelo: typeof corpo.modelo === "string" ? corpo.modelo : null,
  };
}

/** Sentimento das avaliações de um produto da vitrine. Produto escondido ou inexistente: 404. */
export async function sentimentoDoProduto(produtoId, usuario) {
  await buscarVisivel(produtoId, usuario);
  try {
    const corpo = await consultarIa(`/api/produtos/${produtoId}/sentimento`, usuario);
    return { produtoId, fonte: "ia", ...limparSentimento(corpo) };
  } catch (erro) {
    avisarIndisponivel("sentimento", erro, "a tela segue sem o selo");
    return { produtoId, fonte: "indisponivel", resumo: null, avaliacoes: [], modelo: null };
  }
}

async function classificarUm(registro, usuario) {
  const corpo = await consultarIa(`/api/produtos/${registro.id}/classificacao`, usuario);
  if (typeof corpo?.classe !== "string" || typeof corpo.confianca !== "number") {
    throw new Error("resposta do módulo de IA sem a classe");
  }
  return {
    produtoId: Number(registro.id),
    nome: registro.nome,
    artesao: registro.artesao.usuario.nome,
    categoriaAtual: registro.categoria.nome,
    classe: corpo.classe,
    confianca: corpo.confianca,
    status: corpo.status === "aprovado" ? "aprovado" : "revisao",
    palavras: Array.isArray(corpo.palavras) ? corpo.palavras.map(String) : [],
  };
}

/**
 * Painel do admin: a categoria que o texto de cada produto da vitrine sugere,
 * e quais precisam de revisão (classe diferente da categoria ou confiança baixa).
 *
 * O primeiro produto vai sozinho: se a IA estiver fora, a resposta sai na hora
 * com fonte "indisponivel", em vez de esperar o tempo limite de cada produto.
 */
export async function classificacoesDaVitrine(usuario) {
  const registros = await produtosRepository.listar({ somentePublicos: true });
  if (registros.length === 0) return { fonte: "ia", itens: [] };

  const itens = [];
  try {
    itens.push(await classificarUm(registros[0], usuario));
  } catch (erro) {
    avisarIndisponivel("classificacao", erro, "o painel mostra o aviso");
    return { fonte: "indisponivel", itens: [] };
  }

  for (let i = 1; i < registros.length; i += LOTE_CLASSIFICACAO) {
    const lote = registros.slice(i, i + LOTE_CLASSIFICACAO);
    const resultados = await Promise.allSettled(lote.map((registro) => classificarUm(registro, usuario)));
    resultados.forEach((resultado) => {
      if (resultado.status === "fulfilled") itens.push(resultado.value);
    });
  }
  // Os que precisam de revisão primeiro; depois, do menos para o mais confiante.
  itens.sort((a, b) => (a.status === b.status ? a.confianca - b.confianca : a.status === "revisao" ? -1 : 1));
  return { fonte: "ia", itens };
}
