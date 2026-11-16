// ============================================================================
// Erros de domínio do checkout (e da rota de imagens do laboratório).
//
// Moram aqui, e não num repositório, porque são regras de negócio: quem lança
// (repositórios e services do checkout) e quem traduz para HTTP
// (middlewares/erros.js) dependem deste arquivo neutro, sem que a camada HTTP
// precise importar a camada de acesso ao banco.
// ============================================================================

/** Não havia estoque suficiente no momento da compra. Vira HTTP 409 Conflict. */
export class EstoqueInsuficiente extends Error {
  constructor(produtoId) {
    super(`Estoque insuficiente para o produto ${produtoId}.`);
    this.name = "EstoqueInsuficiente";
    this.produtoId = produtoId;
  }
}

/** O produto não existe ou está inativo. Vira HTTP 404 Not Found. */
export class ProdutoInexistente extends Error {
  constructor(produtoId) {
    super(`Produto ${produtoId} não encontrado ou inativo.`);
    this.name = "ProdutoInexistente";
    this.produtoId = produtoId;
  }
}
