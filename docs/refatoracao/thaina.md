# Code smells — frontend (Thainá Pontes)

Desafio de Revisão de Código, Code Smells e Refatoração (Requisitos, Projeto de Software e Validação).
Parte analisada: `frontend/src/` (componentes, páginas e tema visual).

| # | Smell | Onde | Decisão |
|---|---|---|---|
| 1 | Magic Literal duplicado (cores) | 35 arquivos de `frontend/src/` | Refatorar (Replace Magic Literal with Symbolic Constant) |
| 2 | Large Class / God Component | `frontend/src/app/painel-artesao/page.tsx` | Não refatorar agora |

---

## 1. Cores da marca repetidas como código hex

### O problema

O tema do Tailwind já define as cores da marca em `frontend/src/styles/globals.css` (bloco `@theme`):
`--color-terracotta`, `--color-beige-dark`, `--color-charcoal`, `--color-green` e `--color-beige`.
Mesmo assim, nenhum componente usava esses tokens: todos repetiam o hex na classe
(ex.: `bg-[#C1522A]`). Eram 185 ocorrências em 35 arquivos.

### Impactos

- **Manutenibilidade:** trocar uma cor da marca exigia editar 185 lugares; fácil esquecer algum.
- **Legibilidade:** `bg-[#C1522A]` não diz o que a cor significa; `bg-terracotta` diz.
- **Coesão:** a identidade visual deveria morar num lugar só (o tema), mas estava espalhada.
- **Extensibilidade:** modo escuro ou troca de paleta ficavam inviáveis com as cores fixas em cada classe.

### Decisão e técnica

Refatorar, com **Replace Magic Literal with Symbolic Constant**: cada hex foi trocado pelo token que já
existia no tema (`[#C1522A]` → `terracotta`, `[#E8E0D5]` → `beige-dark`, `[#2C2C2C]` → `charcoal`,
`[#1B4332]` → `green`, `[#F5F0EB]` → `beige`). O token tem exatamente o mesmo hex, então o visual não muda.

### Validação

- `npm run build` sem erros.
- Nenhuma ocorrência dos 5 hex restou em `frontend/src/`.
- Telas comparadas antes e depois (vitrine, catálogo, detalhe do produto, artesãos, login, cadastro,
  carrinho e painel do artesão): visual idêntico.

### Riscos e limitações

- Risco baixo: se um token fosse digitado errado, o Tailwind não geraria a classe e a cor sumiria; por isso
  a comparação visual das telas.
- Limitação: cores de alerta e status (ex.: `[#dc2626]`, `[#92400E]`) continuam em hex porque não têm token.
  O próximo passo seria criar tokens para elas.

---

## 2. Painel do artesão em um único componente grande

### O problema

`frontend/src/app/painel-artesao/page.tsx` tem 321 linhas. Um único componente controla as 5 seções do
painel (visão geral, catálogo, adicionar produto, pedidos e estoque), com um bloco condicional por seção,
além do estado de edição de produto e de status de pedido.

### Impactos

Arquivo difícil de ler de uma vez; mudar uma seção arrisca quebrar outra; baixa coesão (cinco
responsabilidades num lugar só).

### Decisão: não refatorar agora

A refatoração natural seria **Extract Component** (um componente por seção). Decidi não fazer agora porque:

1. **A tela vai ser religada à API na etapa G.6 do plano da U2.** Essa etapa troca justamente os hooks e o
   fluxo de dados de cada seção. Dividir o componente agora significaria mexer duas vezes no mesmo código em
   poucas semanas, e o formato das seções extraídas provavelmente mudaria depois da integração.
2. **O frontend não tem testes automatizados.** Uma divisão grande, sem rede de segurança, perto de três
   entregas (24/11, 27/11 e 02/12), tem risco alto de regressão para um ganho que hoje é só de leitura.
3. **O custo atual de manutenção é moderado.** O arquivo já reaproveita componentes prontos
   (`ProductForm`, `ProductManageCard`, `OrderStatus`, `Sidebar`) e as seções são blocos independentes
   e fáceis de localizar.

### Quando refatorar

Junto com a etapa G.6: ao ligar cada seção à API, extraí-la para `components/painel/`
(ex.: `PainelVisaoGeral`, `PainelPedidos`). Assim a divisão é feita uma vez, já no formato final.

### Riscos de manter

Quem mexer no painel precisa ler o arquivo inteiro, e conflitos de merge são mais prováveis se duas pessoas
editarem o painel ao mesmo tempo.
