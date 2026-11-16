# Code smells — backend (Everton Nunes Batista)

Desafio de Revisão de Código, Code Smells e Refatoração (Requisitos, Projeto de Software e Validação).
Parte analisada: `backend/src/`, camadas de repositório, service e middleware do checkout.

| # | Smell | Onde | Decisão |
|---|---|---|---|
| A | Inappropriate Intimacy / dependência na direção errada | `backend/src/repositories/pedido.repository.js` | Refatorar (Move Class) |
| B | Duplicated Code | `backend/src/services/checkout-ingenuo.service.js` × `checkout-seguro.service.js` | Não refatorar |

---

## A. Exceções de domínio dentro de um repositório

### O problema

`EstoqueInsuficiente` e `ProdutoInexistente` são erros de regra de negócio, mas estavam declarados em
`repositories/pedido.repository.js`, o arquivo que grava o pedido no banco. Para usar as duas classes,
outros quatro módulos precisavam importar esse repositório:

| Quem importava | Camada | Para quê |
|---|---|---|
| `middlewares/erros.js` | HTTP | traduzir os erros em 409 e 404 |
| `services/pedidos.service.js` | regra de negócio | transformar `ProdutoInexistente` em 404 do contrato |
| `services/checkout-ingenuo.service.js` | regra de negócio | lançar os dois erros |
| `repositories/laboratorio.repository.js` | acesso a dados | lançar `ProdutoInexistente` na rota de imagens |

### Impactos

- **Acoplamento:** a camada HTTP (middleware) dependia da camada de acesso ao banco só para conhecer dois
  tipos de erro. Qualquer mudança no repositório (trocar o driver, dividir o arquivo) arrastava o middleware.
- **Coesão:** o repositório misturava duas responsabilidades: SQL do checkout e definição de erros de domínio.
- **Legibilidade:** quem procura "onde estão os erros do checkout" não espera encontrá-los num repositório.
- **Extensibilidade:** um erro novo de checkout (ex.: pagamento recusado) tenderia a nascer no mesmo lugar errado.

### Decisão e técnica

Refatorar, com **Move Class**: as duas classes foram movidas, sem nenhuma alteração, para
`backend/src/utils/erros-checkout.js`, um módulo neutro do qual todas as camadas podem depender. Os cinco
imports foram ajustados.

**Antes**

```js
// middlewares/erros.js
import { EstoqueInsuficiente, ProdutoInexistente } from "../repositories/pedido.repository.js";
```

**Depois**

```js
// middlewares/erros.js
import { EstoqueInsuficiente, ProdutoInexistente } from "../utils/erros-checkout.js";
```

O mesmo vale para `pedidos.service.js`, `checkout-ingenuo.service.js` e `laboratorio.repository.js`;
`pedido.repository.js` passou a importar as classes em vez de declará-las.

### Validação

Comportamento preservado: nenhuma linha de lógica mudou, só o endereço das classes. A mesma bateria foi
rodada na `main` e nesta branch, com o banco recriado do zero antes de cada uma:

| Teste | Antes (`main`) | Depois (branch) |
|---|---|---|
| Testes da API (`node --test testes/api/*.test.js`) | 109/109 | 109/109 |
| FCCPD: checkout seguro, 50 compras, estoque 10 | 10 aprovadas, 40 × 409, estoque 0 | idêntico |
| FCCPD: checkout ingênuo, 50 compras, estoque 10 | 50 aprovadas, inconsistente (esperado) | idêntico |
| FCCPD: deadlock, 40 requisições | nenhum deadlock | idêntico |
| FCCPD: fila, 200 jobs | nada perdido, nada duplicado | idêntico |
| Chamadas manuais aos erros movidos (404 `PRODUTO_INEXISTENTE`, 409 `ESTOQUE_INSUFICIENTE`) | respostas registradas | respostas iguais byte a byte |

### Benefícios, riscos e limitações

- **Benefício:** as dependências agora apontam para dentro (HTTP → domínio ← dados); o repositório só
  faz acesso a dados.
- **Risco:** baixo. Se algum arquivo novo, criado em outra branch, ainda importar as classes do caminho
  antigo, o Node falha ao subir (erro explícito, fácil de corrigir), não em silêncio.
- **Limitação:** `ErroApi` continua em `middlewares/erros.js` e os services a importam de lá (o mesmo
  tipo de dependência). Ficou fora deste commit para manter a mudança pequena e verificável; é o próximo
  candidato.

---

## B. Duplicação entre o checkout ingênuo e o seguro

### O problema

`checkout-ingenuo.service.js` e `checkout-seguro.service.js` têm a mesma estrutura: abrem transação,
percorrem os itens, dão baixa no estoque, gravam o pedido. A diferença está só no trecho da baixa de
estoque (ler-e-depois-escrever × `UPDATE` condicional atômico com ordem por `produto_id`).

### Impactos possíveis

Duplicação costuma significar que uma correção feita num lado é esquecida no outro, e que o código fica
maior do que precisa.

### Decisão: não refatorar

A técnica natural seria **Form Template Method** ou **Extract Function** com a baixa de estoque passada
como parâmetro (uma função `checkout(estrategiaDeBaixa)`). Decidi manter as duas versões separadas porque:

1. **A duplicação é o objetivo do código.** A versão ingênua existe para o trabalho de FCCPD (Unidade 1)
   demonstrar uma *race condition*: 50 compras simultâneas de um produto com 10 unidades aprovaram 50
   pedidos na versão ingênua e 10 na segura. Para a demonstração ser convincente, quem lê precisa comparar
   os dois arquivos lado a lado e ver que só o trecho da baixa de estoque muda. Escondê-lo atrás de uma
   abstração tornaria a diferença menos visível justamente onde ela é o ponto.
2. **O que é comum já foi extraído.** Tudo o que não faz parte do experimento (calcular frete, arredondar,
   gravar pedido, itens, pagamento e enfileirar a notificação) já está em um lugar só,
   `repositories/pedido.repository.js`, usado pelas duas versões. O que sobrou duplicado é pouco e é
   exatamente a parte que precisa ser diferente.
3. **A versão ingênua não é código de produção.** Ela só roda pelas rotas do laboratório ou com
   `NAIVE_CHECKOUT=true`. Uma correção de produção acontece no checkout seguro; a ingênua não precisa
   acompanhar, porque o comportamento "errado" dela é intencional.
4. **Risco alto, ganho baixo.** As evidências do FCCPD (`evidencias/`) e o `RELATORIO.md` citam esses
   arquivos e foram geradas com eles. Uma refatoração aqui obrigaria a regerar e revalidar as evidências
   de uma entrega já avaliada, perto dos prazos de 24/11, 27/11 e 02/12.

### Riscos e limitações da decisão

- Uma mudança na regra geral do checkout (ex.: um novo campo do pedido) precisa ser feita nos dois
  arquivos, a não ser que vá para `pedido.repository.js`, que é o lugar indicado.
- Se o laboratório do FCCPD for removido no futuro, a versão ingênua pode ser apagada e a duplicação
  desaparece sem precisar de refatoração.
