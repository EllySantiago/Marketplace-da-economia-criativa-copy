# Code smells — backend (Everton Nunes Batista)

Desafio de Revisão de Código, Code Smells e Refatoração (Requisitos, Projeto de Software e Validação).
Parte analisada: `backend/src/`, camadas de repositório, service e middleware do checkout; e, no fechamento
da U2, `frontend/src/` depois da troca da Fake API pela API real.

| # | Smell | Onde | Decisão |
|---|---|---|---|
| A | Inappropriate Intimacy / dependência na direção errada | `backend/src/repositories/pedido.repository.js` | Refatorar (Move Class) |
| B | Duplicated Code | `backend/src/services/checkout-ingenuo.service.js` × `checkout-seguro.service.js` | Não refatorar |
| C | Duplicated Code | `frontend/src/hooks/*`, `ProductDetails`, `RecomendadosParaVoce`, checkout | Refatorar (Extract Function) |
| D | Duplicated Code | `MetricCard` em `app/admin/page.tsx` e `app/painel-artesao/page.tsx` | Refatorar (Extract Component) |

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

---

## C. O mesmo ciclo de busca e de envio copiado nos hooks do frontend

### O problema

Toda tela que busca dado precisa dos mesmos três estados (carregando, erro e o dado) e de uma proteção
para não aplicar a resposta depois que o componente saiu da tela. Esse ciclo estava **escrito à mão em
cada lugar**:

```tsx
const [dado, setDado] = useState(...);
const [carregando, setCarregando] = useState(true);
const [erro, setErro] = useState<string | null>(null);
useEffect(() => {
  let ativo = true;
  setCarregando(true);
  setErro(null);
  servico.buscar(...)
    .then((r) => ativo && setDado(r))
    .catch((e) => ativo && setErro(e.message))
    .finally(() => ativo && setCarregando(false));
  return () => { ativo = false; };
}, [...]);
```

| Onde | Cópias |
|---|---|
| `hooks/useProdutos.ts`, `useArtesoes.ts`, `useAvaliacoes.ts`, `usePedidos.ts`, `useAdmin.ts` | 12 hooks de busca |
| `components/produto/ProductDetails.tsx`, `RecomendadosParaVoce.tsx`, `app/checkout/page.tsx` | 3 componentes com o mesmo `useEffect` por dentro |
| `useSalvarProduto`, `useRemoverProduto`, `useCriarAvaliacao`, `useCriarPedido`, `useAuth` (entrar e cadastrar) | 6 ações com o mesmo `enviando`/`erro` + `try/catch/finally` |

### Impactos

- **Manutenibilidade:** uma correção no ciclo precisava ser repetida em 21 lugares. Exemplo real: as
  cópias não tratavam a **corrida entre requisições** (trocar o filtro rápido podia deixar na tela a
  resposta do filtro antigo, se ela chegasse por último), e algumas esqueciam de limpar o erro anterior.
- **Legibilidade:** cada hook tinha de 20 a 30 linhas de controle para 1 linha de regra (qual rota chamar).
- **Coesão:** a regra de "quando buscar" (id ainda desconhecido, usuário sem permissão) ficava misturada
  com o controle de estado.
- **Extensibilidade:** um hook novo nascia copiando um dos antigos, com as mesmas falhas.

### Decisão e técnica

Refatorar, com **Extract Function** (aqui, dois hooks genéricos do React):

- **`hooks/useRecurso.ts`** — `useRecurso(chave, buscar, inicial)` devolve `{ dado, carregando, erro,
  recarregar, setDado }`. A `chave` decide quando refazer a busca; `null` quer dizer "ainda não dá para
  buscar" (por exemplo, o id do artesão antes do login carregar). Só a resposta da busca mais recente é
  aplicada, o que resolve a corrida em todos os usos de uma vez.
- **`hooks/useAcao.ts`** — `useAcao(acao, mensagemPadrao)` devolve `{ executar, enviando, erro }`;
  `executar` devolve o resultado ou `null` se a API recusar, com a mensagem do contrato em `erro`.

**Antes** (`useArtesao`, 30 linhas)

```tsx
export function useArtesao(id: number) {
  const [artesao, setArtesao] = useState<Artesao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!(id > 0)) { setArtesao(null); setCarregando(false); return; }
    let ativo = true;
    setCarregando(true);
    setErro(null);
    artesoesService.buscarPorId(id)
      .then((resultado) => ativo && setArtesao(resultado))
      .catch((e: Error) => ativo && setErro(e.message || "Artesão não encontrado."))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [id]);
  return { artesao, carregando, erro };
}
```

**Depois** (4 linhas, mesma assinatura)

```tsx
export function useArtesao(id: number) {
  const { dado, carregando, erro } = useRecurso(id > 0 ? `${id}` : null, () => artesoesService.buscarPorId(id), null as Artesao | null, "Artesão não encontrado.");
  return { artesao: dado, carregando, erro };
}
```

Os hooks de domínio mantiveram **nomes e retornos** (`{ produtos, carregando, erro, recarregar }` etc.),
então nenhuma tela precisou mudar. As recomendações ganharam `hooks/useRecomendacoes.ts`, que tirou o
`useEffect` de dentro de `ProductDetails` e `RecomendadosParaVoce`.

**Tamanho:** `frontend/src` perdeu 212 linhas (431 removidas, 219 escritas, contando os arquivos novos);
`let ativo = true` caiu de 10 para 3 ocorrências.

### O que ficou de fora, e por quê

- **`useFiltros`** guarda a resposta de `GET /filtros` num cache do módulo, compartilhado por todos os
  componentes da página: é outro comportamento (uma requisição para todos), não o ciclo repetido.
- **`useSincronizarCarrinho`** assina o store do carrinho e salva com espera de 400 ms: também é outro
  comportamento.
- **`usePedidos.atualizarStatus`** continua com estado próprio (`salvandoCodigo`), porque marca qual
  linha da tabela está salvando, e não um "enviando" geral.

### Validação

Comportamento preservado, conferido antes e depois com o mesmo ambiente (API, worker, IA e Postgres
locais, banco recriado do seed):

| Verificação | Antes (`main` `c62dee4`) | Depois (commit `515be61`) |
|---|---|---|
| `tsc --noEmit` | ok | ok |
| `next build` | ok | ok |
| Roteiro do navegador (`evidencias-u2/roteiro-navegador.mjs`) | 18/18 | 18/18, sem erro de JavaScript, todas as chamadas `/api` com 2xx |

### Benefícios, riscos e limitações

- **Benefício:** uma correção no ciclo vale para todas as telas; os hooks de domínio ficaram só com a
  regra (qual rota, quando buscar).
- **Risco:** baixo e coberto pelo roteiro. Uma diferença pequena e intencional: depois de um erro, o dado
  volta ao valor inicial em todos os hooks (antes, alguns mantinham o dado anterior). As telas já mostram
  o `ErrorState` nesse caso, então nada visível muda.
- **Limitação:** o frontend não tem testes de unidade (só o roteiro de ponta a ponta). Um teste de unidade
  do `useRecurso` (corrida e chave `null`) é o próximo passo natural.

---

## D. `MetricCard` copiado nos dois painéis

### O problema e o impacto

A mesma função `MetricCard` (rótulo pequeno em cima, valor grande embaixo) estava declarada em
`app/admin/page.tsx` e em `app/painel-artesao/page.tsx`. Mudar o visual dos indicadores exigia lembrar
das duas cópias; uma terceira tela de indicadores nasceria com uma terceira cópia.

### Decisão e técnica

Refatorar, com **Extract Component**: `components/ui/MetricCard.tsx`, ao lado dos outros primitivos
visuais (`Button`, `Badge`, `Card`), importado pelas duas páginas. O JSX é o mesmo, sem nenhuma mudança
visual (conferido nos prints do roteiro do navegador). Commit `280210c`.
