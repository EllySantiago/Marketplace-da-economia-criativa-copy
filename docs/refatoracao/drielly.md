# Code smells — SQL e seed (Drielly Santiago)

Desafio de Revisão de Código, Code Smells e Refatoração (Requisitos, Projeto de Software e Validação).
Parte analisada: `backend/sql/02_seed.sql` (dados iniciais do banco).

| # | Smell | Onde | Decisão |
|---|---|---|---|
| 1 | Duplicated Code / Magic Literal | `INSERT INTO usuario` em `backend/sql/02_seed.sql` | Refatorar (Extract Variable, com `WITH`) |
| 2 | Derived Value (dado calculável guardado de novo) | `INSERT` de `pedido`, `item_pedido` e `pagamento` no mesmo arquivo | Não refatorar |

---

## 1. Hash de senha copiado 11 vezes

### O problema

As 11 linhas do `INSERT INTO usuario` repetiam o mesmo literal
`'$2a$10$JQELM0iQFH9b/dfw7mgyC.lgfl4wX7a/PRUkPAAfhfZBr3.Yf5OBu'` (o bcrypt da senha de demonstração `origem123`).

### Impactos

- **Manutenibilidade:** trocar a senha de demonstração exigia editar 11 lugares; se um ficasse para trás,
  uma conta passaria a ter senha diferente sem ninguém perceber.
- **Legibilidade:** a string longa dominava cada linha e escondia os dados que importam (nome, e-mail, perfil).
- **Extensibilidade:** cada usuário novo no seed copiava o hash de novo.

### Decisão e técnica

Refatorar, com **Extract Variable**: um `WITH senha_padrao AS (...)` dá nome ao hash uma única vez, e o
`INSERT ... SELECT` o reaproveita para as 11 linhas. É SQL puro (PostgreSQL), então funciona no Docker,
no psql e em qualquer editor SQL.

### Validação

Banco recriado do zero com o seed novo (`docker compose down -v && docker compose up -d`):

- Nenhum erro no log do PostgreSQL.
- `SELECT count(*), count(DISTINCT senha_hash) FROM usuario;` → `11 | 1`.
- Ids, e-mails, perfis, fotos e datas dos 11 usuários iguais aos de antes.
- Testes automatizados da API: 109 de 109 passaram (incluem login com `origem123`).

### Riscos e limitações

- Risco baixo: se o `WITH` tivesse erro, o seed inteiro falharia ao subir o banco (erro visível, não silencioso).
- Limitação: o hash continua no repositório; aceitável por ser senha de demonstração, nunca de produção.

---

## 2. Valores dos pedidos calculados à mão

### O problema

Nos `INSERT` de `pedido`, `item_pedido` e `pagamento`, valores que poderiam ser calculados estão escritos à mão:
`item_pedido.subtotal` = quantidade × preço; `pedido.valor_total` = soma dos itens + frete;
`pagamento.valor` repete o `valor_total`; e `preco_unitario` repete o preço do produto.

### Impactos

Se alguém mudar a quantidade ou o preço de um item no seed e esquecer de recalcular os outros valores, o
banco fica inconsistente (total que não fecha com os itens) e o painel do artesão mostra números errados.

### Decisão: não refatorar

A refatoração seria calcular esses valores no próprio seed com `INSERT ... SELECT`, ou remover as colunas do
schema e calculá-las numa view. Decidi manter porque:

1. **Os valores são uma foto do momento da compra, não redundância acidental.** Se o artesão mudar o preço de um
   produto amanhã, o pedido de ontem precisa continuar mostrando o que o comprador pagou. Por isso o modelo de dados
   guarda `preco_unitario`, `subtotal` e `valor_total` em vez de recalcular; é a prática comum em e-commerce.
2. **O sistema real grava assim.** O checkout da API (evidência do trabalho de FCCPD) grava esses valores exatamente
   dessa forma, e a view `vw_indicadores_artesao` soma `item_pedido.subtotal`. Calcular só no seed faria os
   pedidos de exemplo nascerem diferentes dos pedidos reais.
3. **Risco alto, ganho baixo.** Mudar o schema mexeria no Prisma, nas views e no checkout perto das entregas
   de 24/11, 27/11 e 02/12. São só 3 pedidos e 4 itens, todos conferidos.

### Como reduzir o risco sem refatorar

A regra fica registrada aqui (`subtotal = quantidade × preco_unitario`; `valor_total = soma dos subtotais + frete`;
`pagamento.valor = valor_total`) e esta consulta confere o seed (com o seed atual, ela volta vazia):

```sql
SELECT p.codigo, p.valor_total, SUM(i.subtotal) + p.frete AS esperado
FROM pedido p JOIN item_pedido i ON i.pedido_id = p.id
GROUP BY p.id
HAVING p.valor_total <> SUM(i.subtotal) + p.frete; -- deve voltar vazio
```

### Riscos de manter

Quem editar o seed à mão precisa lembrar de recalcular os três valores e rodar a consulta acima.
