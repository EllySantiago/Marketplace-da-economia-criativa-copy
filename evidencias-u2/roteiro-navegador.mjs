// Teste de ponta a ponta do front ligado à API (etapa G), num Chromium headless.
// Precisa do pacote playwright (npx playwright install chromium). Caminho alternativo: PLAYWRIGHT=/caminho/index.mjs
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");

const BASE = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SAIDA = process.argv[2] ?? new URL("./prints", import.meta.url).pathname;
const chamadas = [];
const resultados = [];
const ok = (nome, cond, extra = "") => {
  resultados.push(`${cond ? "OK  " : "FALHA"} ${nome}${extra ? ` — ${extra}` : ""}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.on("response", (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith("/api/")) chamadas.push(`${r.request().method()} ${u.pathname}${u.search} ${r.status()}`);
});
const erros = [];
page.on("pageerror", (e) => erros.push(e.message));

async function entrar(email) {
  await page.goto(`${BASE}/login`);
  await page.fill("#login-email", email);
  await page.fill("#login-senha", "origem123");
  const resp = page.waitForResponse((r) => r.url().includes("/api/auth/login"));
  await page.click("button[type=submit]");
  return (await resp).status();
}
async function sair() {
  await page.evaluate(() => fetch("/api/auth/sair", { method: "POST", credentials: "include" }));
  await page.evaluate(() => localStorage.clear());
}

try {
  // 1. Vitrine
  await page.goto(BASE);
  await page.getByText("Cangaceiro de Barro", { exact: false }).first().waitFor({ timeout: 20000 });
  ok("vitrine carrega do backend", chamadas.some((c) => c.startsWith("GET /api/produtos 200")));
  await page.screenshot({ path: `${SAIDA}/01-vitrine.png` });

  // 2. Busca sem acento
  await page.goto(`${BASE}/produtos?busca=ceramica`);
  await page.waitForResponse((r) => r.url().includes("/api/produtos?") && r.url().includes("busca=ceramica"), { timeout: 15000 });
  await page.waitForTimeout(500);
  ok("busca vai para a API", chamadas.some((c) => c.includes("busca=ceramica")));

  // 3. Produto: sentimento + recomendações + carrinho como visitante
  await page.goto(`${BASE}/produtos/1`);
  await page.getByTestId("sentimento-resumo").waitFor({ timeout: 15000 });
  ok("selo de sentimento da IA no produto", true, await page.getByTestId("sentimento-resumo").innerText());
  ok("recomendações pela API", chamadas.some((c) => c.startsWith("GET /api/recomendacoes/produtos/1")));
  await page.screenshot({ path: `${SAIDA}/02-produto-sentimento.png`, fullPage: true });
  // A compra usa a peça da vitrine com mais estoque (rodar o roteiro várias vezes não esgota uma só).
  const compra = await page.evaluate(() =>
    fetch("/api/produtos").then((r) => r.json()).then((lista) => lista.sort((a, b) => b.estoque - a.estoque)[0].id),
  );
  await page.goto(`${BASE}/produtos/${compra}`);
  await page.getByRole("button", { name: "Adicionar ao Carrinho" }).click();

  // 4. Login do comprador: carrinho do visitante vai para o servidor
  ok("login do comprador", (await entrar("comprador@origem.com.br")) === 200);
  await page.waitForResponse((r) => r.url().endsWith("/api/carrinho") && r.request().method() === "PUT", { timeout: 10000 });
  const carrinho = await page.evaluate(() => fetch("/api/carrinho", { credentials: "include" }).then((r) => r.json()));
  ok("carrinho salvo no servidor depois do login", carrinho.some((i) => i.produto.id === compra), JSON.stringify(carrinho.map((i) => [i.produto.id, i.quantidade])));
  const cookies = await ctx.cookies();
  const sessao = cookies.find((c) => c.name === "origem_sessao");
  ok("sessão em cookie httpOnly", sessao?.httpOnly === true);
  ok("token não fica no localStorage", !(await page.evaluate(() => JSON.stringify(localStorage))).includes("eyJ"));

  // 5. Recarregar mantém a sessão (GET /auth/eu)
  await page.goto(BASE);
  await page.waitForResponse((r) => r.url().includes("/api/auth/eu"), { timeout: 10000 });
  ok("sessão conferida ao recarregar", chamadas.some((c) => c.startsWith("GET /api/auth/eu 200")));
  await page.waitForTimeout(1500);
  ok("'Escolhidos para você' pela API", chamadas.some((c) => c.startsWith("GET /api/recomendacoes/eu")));

  // 6. Checkout
  await page.goto(`${BASE}/checkout`);
  await page.getByPlaceholder("Rua, número").fill("Rua do Teste, 10 — Recife/PE");
  const pedidoResp = page.waitForResponse((r) => r.url().endsWith("/api/pedidos") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  const pedido = await (await pedidoResp).json();
  ok("pedido criado pela API", Boolean(pedido.codigo), `${pedido.codigo} status=${pedido.status} total=${pedido.total}`);
  await page.waitForURL(/checkout\/sucesso/, { timeout: 10000 });
  await page.screenshot({ path: `${SAIDA}/03-pedido-confirmado.png`, fullPage: true });
  await page.goto(`${BASE}/pedidos`);
  await page.getByText(pedido.codigo).first().waitFor({ timeout: 10000 });
  ok("pedido aparece em Meus pedidos", true);
  await sair();

  // 7. Artesã: indicadores do banco
  await entrar("maria@origem.com.br");
  await page.goto(`${BASE}/painel-artesao`);
  await page.waitForResponse((r) => r.url().includes("/api/artesoes/eu/indicadores"), { timeout: 10000 });
  await page.waitForTimeout(800);
  ok("painel do artesão com indicadores da API", chamadas.some((c) => c.startsWith("GET /api/artesoes/eu/indicadores 200")));
  await page.screenshot({ path: `${SAIDA}/04-painel-artesao.png` });
  await sair();

  // 8. Cadastro de artesão com região, depois admin vê pendente e classificação
  const email = `artesao${Date.now()}@e2e.origem.invalid`;
  await page.goto(`${BASE}/cadastro`);
  await page.getByRole("button", { name: /Artesão/ }).click();
  await page.fill("#cadastro-nome", "Artesã do Teste E2E");
  await page.fill("#cadastro-email", email);
  await page.fill("#cadastro-senha", "segredo1");
  await page.fill("#cadastro-confirmar", "segredo1");
  await page.selectOption("#cadastro-regiao", "RMR");
  await page.check("input[type=checkbox]");
  const reg = page.waitForResponse((r) => r.url().includes("/api/auth/registrar"));
  await page.getByRole("button", { name: "Criar Minha Conta" }).click();
  ok("cadastro de artesão com região", (await reg).status() === 201);
  await sair();

  await entrar("admin@origem.com.br");
  await page.goto(`${BASE}/admin`);
  await page.getByText("Artesã do Teste E2E").first().waitFor({ timeout: 10000 });
  ok("admin vê o cadastro pendente", true);
  ok("admin com indicadores da API", chamadas.some((c) => c.startsWith("GET /api/admin/indicadores 200")));
  await page.screenshot({ path: `${SAIDA}/05-admin.png` });
  await page.getByRole("button", { name: /Classificação \(IA\)/ }).first().click();
  await page.getByText("Sugerida pela IA").waitFor({ timeout: 15000 });
  const linhas = await page.locator("tbody tr").count();
  ok("classificação da IA no admin", linhas > 0, `${linhas} produtos`);
  await page.screenshot({ path: `${SAIDA}/06-admin-classificacao.png`, fullPage: true });
} catch (erro) {
  ok("execução", false, erro.message.split("\n")[0]);
  await page.screenshot({ path: `${SAIDA}/erro.png`, fullPage: true });
} finally {
  ok("sem erro de JavaScript na página", erros.length === 0, erros.join(" | "));
  console.log(resultados.join("\n"));
  console.log("\nChamadas à API:\n" + [...new Set(chamadas)].join("\n"));
  await browser.close();
}
