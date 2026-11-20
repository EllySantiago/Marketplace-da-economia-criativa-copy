# Módulo de recomendação do Origem (BentoML)

Mockup executável do módulo especificado na AV1 de IA. **Instalação, tabela RF → endpoint e
casos de teste estão no [README da raiz](../README.md#ia--av2-mockup-do-módulo-de-recomendação-trilha-a-bentoml).**
Este arquivo explica o que há dentro da pasta.

Base: [lgallindo/recomendador-bentoml](https://github.com/lgallindo/recomendador-bentoml)
(Trilha A). As regras e o contrato HTTP seguem a AV1 do Origem. Desde a U2 não há mais treino
offline: os dados vêm do PostgreSQL do backend a cada chamada, pelas funções de `dados.py`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `dados/catalogo.json` | retrato do banco (produtos, compradores, histórico e avaliações), usado quando o banco está fora do ar |
| `exportar.py` | gera o retrato a partir do banco, pelas funções de `dados.py` (`just retrato`) |
| `dados.py` | funções de acesso: `listar_produtos`, `buscar_produto`, `historico_do_usuario`, `listar_avaliacoes`; o módulo só chega aos dados por elas |
| `recomendador.py` | regras puras: elegibilidade, similaridade, histórico, popularidade, limite por artesão |
| `service.py` | online: serviço BentoML com as rotas REST da AV1 (FastAPI montada em `/api`) |
| `testes/casos.sh` | roda os casos de teste do README e mostra OK/FALHOU |
| `logs/recomendacao_log.jsonl` | criado em execução; simula a tabela `recomendacao_log` |

## Dados sintéticos

- **Fonte:** o seed do backend (`backend/sql/02_seed.sql`), lido do PostgreSQL a cada chamada.
  São 13 produtos, 5 artesãs e artesãos (uma da Comunidade do Pilar) e 7 compradores. Todas as
  pessoas são fictícias.
- **`vendas`:** unidades vendidas em pedidos não cancelados. **`notaMedia`:** média das
  avaliações do produto, ou 0 sem avaliação.
- **Histórico:** só ids de produto por usuário (RNF-03: nada de endereço ou pagamento).
- **Casos difíceis de propósito:** o produto 8 está **sem estoque** (RF-04); a compradora 13
  não tem **nenhuma compra** e recebe só popularidade; o produto 13 não tem venda nem avaliação;
  o pedido 9 está **cancelado** e não conta como compra; produto ou usuário inexistente devolve
  404. Com o **banco fora do ar**, as funções de `dados.py` respondem pelo retrato
  `dados/catalogo.json`, com o mesmo resultado.

## Regras

- **Similaridade (RF-01):** mesmo artesão +3, mesma técnica +2, mesma região +1. O `criterio`
  devolvido é o atributo de maior peso em comum.
- **Histórico (RF-06):** técnica de algum item comprado +2, categoria +1; itens já comprados
  não voltam.
- **Popularidade (RF-07):** `0,7 × vendas / maior venda + 0,3 × nota média / 5`, calculada na
  hora, a partir das vendas e notas atuais do banco. Completa qualquer lista que fique abaixo do `limite`.
- **Elegibilidade (RF-04)** e **no máximo 2 por artesão (RNF-06)** valem para todas as listas.
  Empates no score saem pelo mais popular e, depois, pelo menor id — a resposta é sempre a mesma.

## Decisões do mockup

- **Rotas REST em vez do `@bentoml.api`:** a AV1 especifica `GET /produtos/:id/recomendados`
  com erros 400/404/503 e corpo `{ "erro": ... }`. Uma app FastAPI montada no serviço BentoML
  (`@bentoml.asgi_app`) mantém esse contrato.
  As rotas ficam sob `/api`, como no ponto de integração descrito no `design.md` da AV1.
- **Porta 3001:** a 3000 é do frontend Next.js.
- **Autenticação simulada:** o header `X-Usuario-Id` faz o papel do usuário logado (a Fake API
  também não tem JWT).
- **Falha simulada:** o header `X-Simular-Falha: erro | lentidao` existe só para demonstrar o
  RF-08; sem ele, o timeout de 2 s e o tratamento de erro valem do mesmo jeito.
- **Log em arquivo:** o `recomendacao_log` vira um JSONL, gravado só quando a resposta é 200; se a
  gravação falhar, a resposta sai mesmo assim (best-effort, como no `design.md`).
- **Fora do mockup:** as metas de desempenho do RNF-01/RNF-05 (p95 de 300 ms com 10.000
  produtos) não foram medidas.

## Empacotar (opcional)

`just imagem` gera o Bento e a imagem Docker `recomendador-origem:av2`; `just serve-container`
sobe a mesma API na porta 3001. Precisa de Docker.
