/**
 * Cliente HTTP do backend do Origem (contrato em docs/api.md).
 *
 * - URL: `NEXT_PUBLIC_API_URL`, padrão `/api`. O navegador chama o PRÓPRIO domínio do site e o
 *   rewrite do Next (next.config.mjs, variável API_URL) repassa para a API. Assim o cookie de sessão
 *   é do mesmo site (SameSite=Lax funciona) e não há CORS, tanto na Vercel quanto em desenvolvimento.
 * - Sessão: `credentials: "include"` faz o navegador enviar o cookie httpOnly `origem_sessao`
 *   sozinho. O token NUNCA é guardado no navegador (localStorage etc.): um script injetado não o lê.
 * - Erros: o backend responde `{ erro, mensagem }` (docs/api.md, seção 2). Viram `ApiError`, com a
 *   mensagem pronta para `<ErrorState mensagem={...} />`, o status HTTP e o código do erro.
 */
const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api").replace(/\/+$/, "");

/** Erro vindo da API: status HTTP + código do contrato (ex.: ESTOQUE_INSUFICIENTE). */
export class ApiError extends Error {
  constructor(
    mensagem: string,
    readonly status = 0,
    readonly codigo = "ERRO_DE_REDE",
  ) {
    super(mensagem);
    this.name = "ApiError";
  }
}

type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface OpcoesApi {
  metodo?: Metodo;
  corpo?: unknown;
  /** Query string; valores vazios ou undefined são omitidos. */
  query?: Record<string, string | number | undefined | null>;
}

function montarUrl(caminho: string, query?: OpcoesApi["query"]): string {
  const parametros = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== "") parametros.set(chave, String(valor));
  });
  const busca = parametros.toString();
  return `${BASE_URL}${caminho}${busca ? `?${busca}` : ""}`;
}

/** Chama a API e devolve o JSON já tipado. 204 devolve `undefined`. */
export async function apiFetch<T>(caminho: string, { metodo = "GET", corpo, query }: OpcoesApi = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(montarUrl(caminho, query), {
      method: metodo,
      credentials: "include",
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Não foi possível falar com o servidor. Confira sua conexão e tente de novo.");
  }

  if (resposta.status === 204) return undefined as T;

  const texto = await resposta.text();
  let dados: unknown = undefined;
  try {
    dados = texto ? JSON.parse(texto) : undefined;
  } catch {
    // corpo que não é JSON (ex.: página de erro de um proxy): cai na mensagem genérica abaixo
  }

  if (!resposta.ok) {
    const erro = dados as { erro?: string; mensagem?: string } | undefined;
    throw new ApiError(erro?.mensagem ?? `O servidor respondeu ${resposta.status}.`, resposta.status, erro?.erro ?? "ERRO_HTTP");
  }
  return dados as T;
}

/**
 * Latência simulada da Fake API da U1. Só os services ainda não migrados a usam;
 * sai junto com os mocks na G.8.
 */
export function delay<T>(valor: T, ms = 300 + Math.round(Math.random() * 200)): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(valor), ms));
}
