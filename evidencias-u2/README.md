# Evidências da U2 — banco de dados, recomendação e processamento assíncrono

Entregável obrigatório do projeto de Desenvolvimento Web. A pasta [`evidencias/`](../evidencias/) é da U1 de FCCPD e não foi tocada.

> **Ambiente desta coleta:** local, em 21/11/2026, com API, worker, módulo de IA, frontend e PostgreSQL
> rodando na mesma máquina, sobre o seed do projeto. Depois do deploy (`docs/deploy.md`), os mesmos dois
> comandos abaixo regravam esta pasta a partir do ambiente publicado.

| Arquivo | O que mostra |
|---|---|
| [`01-banco.txt`](01-banco.txt) | um pedido feito pela API e o que ficou no banco: carrinho salvo, `pedido`, `item_pedido` com o preço da hora da compra, `pagamento` simulado, baixa de estoque pelo checkout seguro e carrinho esvaziado |
| [`02-recomendacao.txt`](02-recomendacao.txt) | `GET /recomendacoes/produtos/1` e `GET /recomendacoes/eu` com `fonte: ia`: a API chama o módulo de IA com o usuário do login e devolve os produtos do banco, com o critério e o score de cada um |
| [`03-assincrono.txt`](03-assincrono.txt) | o mesmo pedido gera dois eventos em `evento_assincrono` (comprador e artesã), processados pelo worker em menos de 1 s, e as duas linhas que ele gravou em `notificacao` |
| [`04-sentimento-classificacao.txt`](04-sentimento-classificacao.txt) | os outros dois modelos da IA pela API: sentimento das avaliações do produto 1 e a categoria sugerida para cada produto da vitrine |
| [`05-cache.txt`](05-cache.txt) | a mesma consulta da vitrine duas vezes: `X-Cache: MISS` e depois `HIT` |
| [`06-navegador.txt`](06-navegador.txt) | o roteiro no navegador: 18 verificações do fluxo completo e a lista das chamadas `/api/...` que o site fez (a aba Network em texto) |
| [`07-log-uso-ia-trecho.jsonl`](07-log-uso-ia-trecho.jsonl) | o lado da IA: linhas do log de uso do módulo com `quem_chamou: backend` |
| [`prints/`](prints/) | telas do roteiro: vitrine, produto com o selo de sentimento, pedido confirmado, painel do artesão, admin e classificação |

## Como regravar

Com a API (e o worker), o módulo de IA, o banco e o frontend no ar:

```bash
# 01 a 05: faz um pedido de verdade pela API e consulta o banco
cd backend
API_URL=http://localhost:3333 DATABASE_URL=postgres://origem:origem@localhost:5434/origem npm run evidencias:u2

# 06 e prints/: o fluxo no navegador (precisa do pacote playwright e do Chromium dele)
cd ../evidencias-u2
SITE_URL=http://localhost:3000 node roteiro-navegador.mjs > 06-navegador.txt
```

No ambiente publicado, troque `API_URL` pela URL da API no Render, `DATABASE_URL` pela do Neon e
`SITE_URL` pela da Vercel. O roteiro cria um cadastro de artesão de teste (`@e2e.origem.invalid`) e
pedidos do comprador de demonstração a cada execução.

## O que o roteiro do navegador confere

Vitrine vinda do backend, busca sem acento (`ceramica`), selo de sentimento da IA e recomendações na
página do produto, login, carrinho do visitante salvo no servidor depois do login, sessão em cookie
httpOnly e nenhum token no `localStorage`, sessão mantida ao recarregar (`GET /auth/eu`), "Escolhidos
para você", pedido criado e listado em "Meus pedidos", painel do artesão com os indicadores do banco,
cadastro de artesão com região, admin vendo o cadastro pendente e os indicadores, e a classificação
da IA no admin. No fim, confere que a página não teve erro de JavaScript.
