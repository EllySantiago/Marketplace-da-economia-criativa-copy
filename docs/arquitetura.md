# Arquitetura — Origem (U2)

O Origem é um marketplace de artesanato de Pernambuco em quatro peças: o **site** (Next.js), a **API**
(Node/Express), o **módulo de IA** (Python/BentoML) e o **banco** (PostgreSQL). O site nunca fala com o
banco nem com a IA: tudo passa pela API.

## 1. Visão geral

```
                         navegador
                             │  https://<site>/api/...   (mesmo domínio: cookie de sessão SameSite=Lax, sem CORS)
                             ▼
  ┌──────────────────────────────────────────┐
  │ Frontend Next.js (Vercel)                │  rewrite /api/:caminho → API_URL/:caminho
  └───────────────────┬──────────────────────┘
                      ▼
  ┌──────────────────────────────────────────┐   HTTP, 2 s de limite    ┌──────────────────────────┐
  │ API Node/Express (Render)                │ ───────────────────────▶ │ Módulo de IA (BentoML,   │
  │ routes → controllers → services →        │  recomendação,           │ Render): recomendação,   │
  │ repositories   · JWT em cookie httpOnly  │  sentimento, classific.  │ sentimento, classificação│
  │ cache da vitrine · Swagger em /docs      │ ◀─ se cair: popularidade │ + log de uso dos dados   │
  │ worker da fila (embutido em produção)    │    ou "indisponivel"     └────────────┬─────────────┘
  └───────────────────┬──────────────────────┘                                       │ lê pelas funções
                      │ Prisma + SQL puro (checkout, fila, busca)                     │ de acesso (dados.py)
                      ▼                                                               ▼
  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │ PostgreSQL (Neon): catálogo, usuários, carrinho, pedidos, pagamento, avaliações,            │
  │ evento_assincrono (fila), notificacao, classificacao_produto                                │
  └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Peça | Responsabilidade | Onde |
|---|---|---|
| Frontend | telas, estado da tela (carrinho e usuário), chamadas à API | `frontend/` |
| API | regras de negócio, autenticação e perfis, checkout seguro, cache, repasse da IA, documentação | `backend/src/` |
| Worker | consome a fila `evento_assincrono` e grava as notificações do pedido | `backend/src/worker.js` (processo separado em dev, `WORKER_EMBUTIDO=true` em produção) |
| Módulo de IA | recomendação por regras, sentimento por léxico, classificação por palavras-chave, log de uso | `ia-recomendacao/` |
| Banco | dados do marketplace e a fila | `backend/sql/` (DDL da equipe + extensões da U2) |

Por que cada serviço existe separado (e por que o resto não foi separado) está no relatório do FCCPD U2:
[`fccpd-u2/RELATORIO.md`](../fccpd-u2/RELATORIO.md).

## 2. Frontend

Next.js 15 (App Router) + TypeScript, em camadas com uma responsabilidade cada:

```
Página (app/.../page.tsx)
   └─ componente de domínio ("use client")          ex.: CatalogView, ProductReviews
        └─ hook (hooks/*.ts)                          ex.: useProdutos(filtros) → { produtos, carregando, erro }
             └─ service (services/api/*.service.ts)   ex.: produtosService.filtrar(...)
                  └─ apiFetch (services/api/client.ts) → GET /api/produtos?busca=...
```

- **`services/api/` é a única fronteira com a API.** Cada service tem as mesmas assinaturas da época da
  Fake API (U1), por isso trocar os mocks pelo backend (etapa G) quase não mexeu nas telas.
- **`apiFetch`** usa `NEXT_PUBLIC_API_URL` (padrão `/api`, o próprio site), envia o cookie com
  `credentials: "include"` e transforma o erro do contrato (`{ erro, mensagem }`) em `ApiError`, cuja
  mensagem vai direto para o `<ErrorState />`.
- **Três estados em toda tela que busca dado:** carregando (`LoadingState`), erro (`ErrorState`) e vazio
  (`EmptyState`).
- **Estado global (Zustand):** `authStore` guarda só os dados do usuário (o token nunca fica no navegador);
  `cartStore` é o carrinho da tela, com resposta imediata ao clique.
- **Componentes sem desenho no layout raiz** (`components/layout/SessaoInicial.tsx`):
  - confere a sessão ao abrir a página (`GET /auth/eu`; 401 limpa o usuário guardado);
  - sincroniza o carrinho do comprador com o servidor: no login junta o carrinho do visitante com o salvo
    (maior quantidade de cada produto), depois salva cada mudança em `PUT /carrinho` com 400 ms de espera.
- **Opções de filtro** (regiões, categorias e técnicas) vêm de `GET /filtros`, com as listas fixas da U1
  como valor inicial.

## 3. Backend (API)

Node/Express + PostgreSQL, nas camadas pedidas na disciplina de Web:

```
requisição → routes → (middlewares de autenticação) → controller → service → repository → banco
                                                                                 │
                                                       Prisma (ORM) ─────────────┤
                                                       driver pg (SQL puro) ─────┘
```

| Camada | Responsabilidade | Exemplo |
|---|---|---|
| `routes/` | liga método + URL ao controller e aos middlewares | `GET /produtos` → `produtosController.listar` |
| `controllers/` | lê e valida a requisição, monta a resposta HTTP | filtro `"Todas"` é ignorado; `artesaoId` precisa ser número |
| `services/` | regras de negócio | só produto ativo de artesão aprovado aparece na vitrine |
| `repositories/` | acesso ao banco | `prisma.produto.findMany(...)` |
| `utils/` | mapeadores banco → API, validação, cache, cliente do módulo de IA | `utils/modulo-ia.js` |

**Prisma e SQL puro convivem de propósito.** O Prisma faz as consultas comuns. O SQL puro fica onde o
Prisma não alcança: o checkout seguro (`UPDATE` condicional atômico e ordem anti-deadlock) e a fila
(`FOR UPDATE SKIP LOCKED`), que são a entrega do FCCPD U1, e a busca sem acento (`unaccent`). O schema
continua sendo o SQL da equipe; o `prisma/schema.prisma` é gerado dele. Passo a passo para criar uma
rota: [`backend/README.md`](../backend/README.md). Contrato completo: [`api.md`](api.md) e o Swagger em `/docs`.

### Autenticação e perfis

- Login e cadastro devolvem um JWT (8 h) e gravam o mesmo token no cookie `origem_sessao`
  (`HttpOnly`, `SameSite=Lax`, `Secure` em produção). O navegador usa o cookie; testes e scripts usam
  `Authorization: Bearer`.
- Senhas com bcrypt. A cada requisição o usuário é recarregado do banco: o perfil do token não é confiado.
- Três perfis: comprador e artesão se cadastram (artesão nasce pendente até o admin aprovar);
  administrador é conta interna.

### Pontos de desempenho e concorrência

| Onde | O quê |
|---|---|
| `POST /pedidos` | checkout seguro do FCCPD U1: baixa de estoque condicional, ordenada por produto, numa transação com o pedido, o pagamento e os eventos da fila |
| `GET /produtos`, `GET /filtros` | cache em memória (`CACHE_TTL_MS`, 30 s), `X-Cache: HIT/MISS`, limpo ao mexer em produto ou pedido. Medido: ~3,8× mais requisições por segundo |
| Fila | pedido grava os avisos na mesma transação (transactional outbox); o worker processa com `SKIP LOCKED`, retentativas e dead-letter |

## 4. Módulo de IA e a integração com a Web

O módulo (`ia-recomendacao/`, BentoML na porta 3001) lê o Postgres só pelas funções de acesso de
`dados.py` (com um retrato JSON quando o banco está fora) e registra cada uso dos dados em
`logs/uso_dados.jsonl`. Detalhes, métricas e o log: [README do módulo](../ia-recomendacao/README.md).

Os três modelos chegam ao site pelo mesmo caminho, **navegador → API → IA**:

| Tela | Rota da API | Rota do módulo | Se a IA cair ou passar de 2 s |
|---|---|---|---|
| Produto: "Peças relacionadas" | `GET /recomendacoes/produtos/:id` | `/api/produtos/:id/recomendados` | mais vendidos (`fonte: popularidade`) |
| Início: "Escolhidos para você" | `GET /recomendacoes/eu` | `/api/usuarios/:id/recomendados` | mais vendidos |
| Produto: sentimento das avaliações | `GET /produtos/:id/sentimento` | `/api/produtos/:id/sentimento` | o selo some (`fonte: indisponivel`) |
| Admin: classificação automática | `GET /admin/classificacoes` | `/api/produtos/:id/classificacao` | aviso no painel |

Passar pela API, e não chamar a IA direto do navegador, garante três coisas: o usuário vem do login (e
não de um cabeçalho que o navegador pode forjar), os dados exibidos (preço, estoque) são os do banco na
hora, e o site nunca quebra por causa da IA. Toda chamada aparece no log de uso com `quem_chamou: backend`.

## 5. Implantação

Banco no Neon, API e IA no Render (`render.yaml`), site na Vercel. Tudo que depende do provedor está em
variáveis de ambiente (`DATABASE_URL`, `JWT_SECRET`, `RECOMENDACAO_URL`, `CORS_ORIGEM`, `WORKER_EMBUTIDO`,
`API_URL`). Passo a passo e restrições do plano gratuito: [`deploy.md`](deploy.md).

## 6. Decisões e limitações

| Decisão | Por quê |
|---|---|
| Rewrite `/api` no Next em vez de chamar a API em outro domínio | cookie do mesmo site (`SameSite=Lax` basta) e nenhum CORS no navegador; em dev o rewrite aponta para `localhost:3333` |
| Carrinho salvo no banco só para comprador logado | visitante compra sem conta até o checkout; o carrinho dele vai para o servidor no login |
| Worker dentro da API em produção | o Render não tem worker gratuito; localmente ele roda em processo separado, como na U1 |
| IA por regras, sem treino | a disciplina pede dados, funções de acesso e log, não modelo treinado; as regras foram congeladas antes dos conjuntos de teste |

Limitações conhecidas: sem upload real de imagem (o produto recebe uma URL), sem paginação (catálogo
pequeno), pagamento simulado, e o serviço gratuito do Render dorme depois de 15 min sem uso (o primeiro
acesso leva cerca de 1 min; a recomendação cai para popularidade enquanto a IA acorda).
