// ============================================================================
// Coleta as evidências da U2 de Web (entregável obrigatório): banco de dados,
// recomendação e processamento assíncrono, mais sentimento, classificação e
// cache. Grava os arquivos .txt em ../evidencias-u2/.
//
// Faz um pedido de verdade pela API (como o comprador de demonstração) e
// confere no banco o que ele gerou: pedido, itens, pagamento, baixa de
// estoque, eventos na fila e as notificações gravadas pelo worker.
//
// Uso (API, worker e IA no ar; DATABASE_URL = o mesmo banco da API):
//   API_URL=http://localhost:3333 DATABASE_URL=postgres://... npm run evidencias:u2
// No ambiente publicado: API_URL=https://<api no Render> e a DATABASE_URL do Neon.
// ============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import pg from "pg";

const API = (process.env.API_URL ?? "http://localhost:3333").replace(/\/+$/, "");
const PASTA = new URL("../../evidencias-u2/", import.meta.url);
const SENHA_DEMO = "origem123";
const PRODUTO = 1;

if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL (o mesmo banco que a API usa).");
  process.exit(1);
}
// TIMESTAMP sem fuso: o banco grava em UTC. Mostra como está gravado, sem o driver converter para a hora local.
pg.types.setTypeParser(1114, (valor) => `${valor} UTC`);
const ssl = /sslmode=require|neon\.tech/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined;
const banco = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });

const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
})();
const cabecalho = (titulo) =>
  [`# ${titulo}`, `# Gerado por backend/scripts/evidencias-u2.js em ${new Date().toISOString()}`, `# API: ${API} · commit ${commit}`, ""].join("\n");

const linhas = [];
const escrever = (texto = "") => linhas.push(texto);
function salvar(arquivo, titulo) {
  writeFileSync(new URL(arquivo, PASTA), `${cabecalho(titulo)}${linhas.join("\n")}\n`);
  console.log(`  ${arquivo}`);
  linhas.length = 0;
}
const json = (valor) => JSON.stringify(valor, null, 2);
const tabela = (rows) => (rows.length ? rows.map((r) => "  " + Object.entries(r).map(([k, v]) => `${k}=${v instanceof Date ? v.toISOString() : v}`).join(" | ")).join("\n") : "  (nenhuma linha)");

async function chamar(metodo, caminho, { token, corpo } = {}) {
  const resposta = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(corpo && { "Content-Type": "application/json" }) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resposta.text();
  return { status: resposta.status, cache: resposta.headers.get("x-cache"), corpo: texto ? JSON.parse(texto) : null };
}
const entrar = async (email) => (await chamar("POST", "/auth/login", { corpo: { email, senha: SENHA_DEMO } })).corpo.token;
const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));

mkdirSync(PASTA, { recursive: true });
await banco.connect();
console.log(`Coletando evidências em evidencias-u2/ (API ${API})`);

// ---------------------------------------------------------------- 1. banco + 3. assíncrono
const comprador = await entrar("comprador@origem.com.br");
// O pedido usa a peça da vitrine com mais estoque (rodar o script várias vezes não esgota uma só).
const COMPRA = Number((await banco.query(
  `SELECT p.id FROM produto p JOIN artesao a ON a.usuario_id = p.artesao_id
    WHERE p.status = 'ativo' AND a.aprovado ORDER BY p.estoque DESC, p.id LIMIT 1`)).rows[0].id);
const estoqueAntes = (await banco.query("SELECT estoque FROM produto WHERE id = $1", [COMPRA])).rows[0].estoque;
await chamar("PUT", "/carrinho", { token: comprador, corpo: { itens: [{ produtoId: COMPRA, quantidade: 1 }] } });
const carrinhoSalvo = await banco.query(
  `SELECT ic.produto_id, ic.quantidade FROM item_carrinho ic JOIN carrinho c ON c.id = ic.carrinho_id
     JOIN usuario u ON u.id = c.usuario_id WHERE u.email = 'comprador@origem.com.br'`,
);
const pedido = await chamar("POST", "/pedidos", {
  token: comprador,
  corpo: { enderecoEntrega: "Rua da Evidência, 10 — Recife/PE", metodoPagamento: "pix", itens: [{ produtoId: COMPRA, quantidade: 1 }] },
});
if (pedido.status !== 201) {
  console.error(`POST /pedidos respondeu ${pedido.status}: ${JSON.stringify(pedido.corpo)}`);
  process.exit(1);
}
const codigo = pedido.corpo.codigo;
await esperar(3000); // tempo para o worker processar a fila
const { id: pedidoId } = (await banco.query("SELECT id FROM pedido WHERE codigo = $1", [codigo])).rows[0];

escrever("Fluxo: o comprador de demonstração salva o carrinho e fecha um pedido pela API; depois, o banco é consultado.");
escrever();
escrever("## Carrinho salvo no banco (PUT /carrinho → item_carrinho)");
escrever(tabela(carrinhoSalvo.rows));
escrever();
escrever(`## POST /pedidos → HTTP ${pedido.status}`);
escrever(json({ codigo, status: pedido.corpo.status, subtotal: pedido.corpo.subtotal, frete: pedido.corpo.frete, total: pedido.corpo.total, pagamento: pedido.corpo.pagamento }));
escrever();
escrever("## pedido");
escrever(tabela((await banco.query("SELECT id, codigo, comprador_id, status, valor_total, frete FROM pedido WHERE id = $1", [pedidoId])).rows));
escrever("## item_pedido (preço gravado na hora da compra)");
escrever(tabela((await banco.query("SELECT produto_id, artesao_id, quantidade, preco_unitario, subtotal FROM item_pedido WHERE pedido_id = $1", [pedidoId])).rows));
escrever("## pagamento (simulado)");
escrever(tabela((await banco.query("SELECT metodo, status, valor FROM pagamento WHERE pedido_id = $1", [pedidoId])).rows));
const estoqueDepois = (await banco.query("SELECT estoque FROM produto WHERE id = $1", [COMPRA])).rows[0].estoque;
escrever(`## Baixa de estoque do produto ${COMPRA} (checkout seguro do FCCPD U1)`);
escrever(`  antes=${estoqueAntes} depois=${estoqueDepois}`);
escrever("## Carrinho esvaziado depois do pedido");
escrever(tabela((await banco.query(`SELECT count(*)::int AS itens FROM item_carrinho ic JOIN carrinho c ON c.id = ic.carrinho_id JOIN usuario u ON u.id = c.usuario_id WHERE u.email = 'comprador@origem.com.br'`)).rows));
salvar("01-banco.txt", "Evidência de banco de dados: pedido gravado de ponta a ponta");

escrever(`O mesmo pedido (${codigo}) enfileira um aviso para o comprador e um para cada artesã, na MESMA transação`);
escrever("do pedido (transactional outbox). O worker (embutido na API em produção, WORKER_EMBUTIDO=true)");
escrever("consome a fila com FOR UPDATE SKIP LOCKED e grava as notificações.");
escrever();
escrever("## evento_assincrono (a fila) — eventos deste pedido");
escrever(tabela((await banco.query(
  `SELECT id, tipo, status, tentativas, payload->>'papel' AS papel, payload->>'usuarioId' AS usuario, criado_em, processado_em
     FROM evento_assincrono WHERE payload->>'pedidoId' = $1 ORDER BY id`, [String(pedidoId)])).rows));
escrever();
escrever("## notificacao — gravadas pelo worker");
escrever(tabela((await banco.query(
  `SELECT usuario_id, tipo, mensagem, criado_em FROM notificacao WHERE mensagem LIKE $1 ORDER BY id`, [`%${codigo}%`])).rows));
escrever();
escrever("## Situação geral da fila");
escrever(tabela((await banco.query("SELECT status, count(*)::int AS total FROM evento_assincrono GROUP BY status ORDER BY status")).rows));
salvar("03-assincrono.txt", "Evidência de processamento assíncrono: fila de notificações do pedido");

// ---------------------------------------------------------------- 2. recomendação
const similares = await chamar("GET", `/recomendacoes/produtos/${PRODUTO}?limite=4`);
const paraMim = await chamar("GET", "/recomendacoes/eu?limite=4", { token: comprador });
const resumoRecomendacao = (r) => r.corpo.recomendacoes.map((p) => `  ${p.id} ${p.nome} · ${p.criterio} · score ${p.score}`).join("\n");
escrever("O navegador pede à API; a API chama o módulo de IA (BentoML) com o usuário do LOGIN e troca os ids");
escrever("pelos produtos do banco. fonte=ia: veio do módulo; fonte=popularidade: a IA caiu ou passou de 2 s.");
escrever();
escrever(`## GET /recomendacoes/produtos/${PRODUTO} → HTTP ${similares.status}, fonte=${similares.corpo.fonte}`);
escrever(resumoRecomendacao(similares));
escrever();
escrever(`## GET /recomendacoes/eu (comprador@origem.com.br) → HTTP ${paraMim.status}, fonte=${paraMim.corpo.fonte}`);
escrever(resumoRecomendacao(paraMim));
escrever();
escrever("O lado do módulo de IA (cada chamada registrada com quem_chamou=backend) está em");
escrever("ia-recomendacao/logs/uso_dados.jsonl; o resumo do log sai com `just resumo` dentro de ia-recomendacao/.");
salvar("02-recomendacao.txt", "Evidência de recomendação: módulo de IA consumido pela API");

// ---------------------------------------------------------------- 4. sentimento e classificação
const sentimento = await chamar("GET", `/produtos/${PRODUTO}/sentimento`);
const admin = await entrar("admin@origem.com.br");
const classificacoes = await chamar("GET", "/admin/classificacoes", { token: admin });
escrever(`## GET /produtos/${PRODUTO}/sentimento → HTTP ${sentimento.status}, fonte=${sentimento.corpo.fonte}`);
escrever(json({ resumo: sentimento.corpo.resumo, avaliacoes: sentimento.corpo.avaliacoes, modelo: sentimento.corpo.modelo }));
escrever();
escrever(`## GET /admin/classificacoes → HTTP ${classificacoes.status}, fonte=${classificacoes.corpo.fonte}, ${classificacoes.corpo.itens.length} produtos`);
for (const item of classificacoes.corpo.itens) {
  escrever(`  ${item.produtoId} ${item.nome} · cadastrada=${item.categoriaAtual} · sugerida=${item.classe} · confiança=${item.confianca} · ${item.status}`);
}
salvar("04-sentimento-classificacao.txt", "Evidência dos outros dois modelos da IA consumidos pela API");

// ---------------------------------------------------------------- 5. cache
const primeira = await chamar("GET", "/produtos?categoria=Cerâmica");
const segunda = await chamar("GET", "/produtos?categoria=Cerâmica");
escrever("A vitrine (GET /produtos) e os filtros ficam em memória por CACHE_TTL_MS. Criar pedido ou mexer em");
escrever("produto limpa o cache. O cabeçalho X-Cache diz de onde veio a resposta.");
escrever();
escrever(`  1ª chamada GET /produtos?categoria=Cerâmica → HTTP ${primeira.status}, X-Cache: ${primeira.cache}`);
escrever(`  2ª chamada GET /produtos?categoria=Cerâmica → HTTP ${segunda.status}, X-Cache: ${segunda.cache}`);
salvar("05-cache.txt", "Evidência do cache da vitrine");

await banco.end();
console.log(`Pronto. Pedido de evidência: ${codigo}.`);
