// ============================================================================
// Testes do sentimento e da classificação pela API (etapa E.6) — docs/api.md,
// seção 7c. Como em recomendacoes.test.js, o módulo de IA é um servidor HTTP
// falso numa porta livre, que responde, falha ou demora conforme o teste.
// ============================================================================

import { test, before, after, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import request from "supertest";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/database.js";
import { config } from "../../src/config/env.js";

const t = {};
const ia = { modo: "ok", pedidos: [], revisar: new Set() };
let servidor;
const urlOriginal = config.recomendacaoUrl;
const timeoutOriginal = config.recomendacaoTimeoutMs;

function respostaSentimento(produtoId) {
  return {
    produtoId,
    avaliacoes: [
      { id: 1, nota: 5, comentario: "linda", sentimento: "positivo", pontuacao: 2, termos: ["linda"] },
      { id: 2, nota: 2, comentario: "quebrou", sentimento: "negativo", pontuacao: -1, termos: ["quebrou"] },
      { id: 3, nota: 4, comentario: "ok", sentimento: "positivo", pontuacao: 1, termos: [] },
      { id: "x", sentimento: "furioso" }, // lixo: a API descarta
    ],
    resumo: { total: 3, porRotulo: { positivo: 2, neutro: 0, negativo: 1 }, rotuloGeral: "positivo", pontuacaoMedia: 0.67 },
    modelo: "lexico-falso",
  };
}

before(async () => {
  servidor = http.createServer((req, res) => {
    ia.pedidos.push({ url: req.url, usuario: req.headers["x-usuario-id"], chamador: req.headers["x-origem-chamador"] });
    if (ia.modo === "lenta") return setTimeout(() => res.end("{}"), 1000);
    if (ia.modo === "erro") {
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ erro: "indisponível" }));
    }
    if (ia.modo === "lixo") return res.end("isto não é JSON");
    const id = Number(req.url.match(/produtos\/(\d+)/)?.[1]);
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.url.endsWith("/sentimento")) return res.end(JSON.stringify(respostaSentimento(id)));
    const revisar = ia.revisar.has(id);
    res.end(JSON.stringify({
      produtoId: id,
      categoriaAtual: "Cerâmica",
      classe: revisar ? "Têxtil" : "Cerâmica",
      confianca: revisar ? 0.4 : 0.9,
      status: revisar ? "revisao" : "aprovado",
      palavras: ["barro"],
      modelo: "palavras-falso",
    }));
  });
  await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  config.recomendacaoUrl = `http://127.0.0.1:${servidor.address().port}`;
  config.recomendacaoTimeoutMs = 300;

  const entrar = async (email) => (await request(app).post("/auth/login").send({ email, senha: "origem123" })).body.token;
  t.admin = await entrar("admin@origem.com.br");
  t.maria = await entrar("maria@origem.com.br");
});

beforeEach(() => {
  ia.modo = "ok";
  ia.pedidos = [];
  ia.revisar = new Set();
});

after(async () => {
  config.recomendacaoUrl = urlOriginal;
  config.recomendacaoTimeoutMs = timeoutOriginal;
  servidor.close();
  await pool.end();
});

const comToken = (req, token) => (token ? req.set("Authorization", `Bearer ${token}`) : req);
const sentimento = (id, token) => comToken(request(app).get(`/produtos/${id}/sentimento`), token);
const classificacoes = (token) => comToken(request(app).get("/admin/classificacoes"), token);

describe("GET /produtos/:id/sentimento", () => {
  test("repassa o resumo e o rótulo de cada avaliação, sem o lixo da IA", async () => {
    const r = await sentimento(1);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.fonte, "ia");
    assert.equal(r.body.produtoId, 1);
    assert.equal(r.body.resumo.rotuloGeral, "positivo");
    assert.deepEqual(r.body.resumo.porRotulo, { positivo: 2, neutro: 0, negativo: 1 });
    assert.deepEqual(r.body.avaliacoes.map((a) => [a.id, a.sentimento]), [[1, "positivo"], [2, "negativo"], [3, "positivo"]]);
    assert.equal(r.body.avaliacoes[0].comentario, undefined, "o texto já vem de /avaliacoes: não é repetido");
    assert.equal(ia.pedidos[0].url, "/api/produtos/1/sentimento");
    assert.equal(ia.pedidos[0].chamador, "backend");
  });

  test("leva o usuário do login para a IA, e não o do navegador", async () => {
    await sentimento(1, t.maria).set("X-Usuario-Id", "999");
    assert.equal(ia.pedidos[0].usuario, "2");
  });

  for (const modo of ["erro", "lenta", "lixo"]) {
    test(`IA ${modo}: 200 com fonte "indisponivel"`, async () => {
      ia.modo = modo;
      const r = await sentimento(1);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { produtoId: 1, fonte: "indisponivel", resumo: null, avaliacoes: [], modelo: null });
    });
  }

  test("produto inexistente: 404, sem chamar a IA", async () => {
    const r = await sentimento(999999);
    assert.equal(r.status, 404);
    assert.equal(ia.pedidos.length, 0);
  });
});

describe("GET /admin/classificacoes", () => {
  test("classifica cada produto da vitrine, com os que precisam de revisão primeiro", async () => {
    ia.revisar = new Set([3]);
    const r = await classificacoes(t.admin);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.fonte, "ia");
    // Outros arquivos de teste criam produtos em paralelo: confere os do seed, não o total.
    const ids = r.body.itens.map((item) => item.produtoId);
    assert.equal(new Set(ids).size, ids.length, "produto repetido");
    for (const id of [1, 2, 3, 5, 11]) assert.ok(ids.includes(id), `faltou o produto ${id}`);
    assert.equal(r.body.itens[0].produtoId, 3);
    assert.equal(r.body.itens[0].status, "revisao");
    assert.ok(r.body.itens[0].nome && r.body.itens[0].artesao && r.body.itens[0].categoriaAtual);
    assert.ok(r.body.itens.slice(1).every((item) => item.status === "aprovado"));
    assert.ok(ia.pedidos.every((p) => p.chamador === "backend"));
  });

  test("IA fora: responde logo, com fonte \"indisponivel\" e uma chamada só", async () => {
    ia.modo = "erro";
    const r = await classificacoes(t.admin);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { fonte: "indisponivel", itens: [] });
    assert.equal(ia.pedidos.length, 1);
  });

  test("sem login: 401; artesão: 403", async () => {
    assert.equal((await classificacoes()).status, 401);
    assert.equal((await classificacoes(t.maria)).status, 403);
  });
});
