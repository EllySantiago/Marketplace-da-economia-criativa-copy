# ADR-001: Adotar arquitetura em Camadas com baixa de estoque atômica no checkout

- **Status:** Proposta
- **Data:** 2026-11-18
- **Autor:** THAINA PONTES DA SILVA (tps2@cesar.school)
- **Turma:** Embarque (segundas)
- **Projeto:** Origem · marketplace da economia criativa e do artesanato de Pernambuco

## Contexto

O Origem é um marketplace de peças artesanais de Pernambuco, muitas delas únicas ou com pouquíssimas unidades. A equipe tem quatro estudantes que cursam outras disciplinas em paralelo, com prazo de um semestre e sem orçamento de infraestrutura. A stack (Node/Express + PostgreSQL) foi acordada com Desenvolvimento Web, e o modelo de dados com Banco de Dados. O backend já está organizado em rotas, controllers, serviços e repositórios. Um teste com a versão ingênua do checkout (ler o estoque e depois atualizar) aprovou 50 compras de um produto com 10 unidades e perdeu 41 escritas.

## Preocupações

ausência de falhas, integridade do estoque, concorrência, prazo, simplicidade, custo de infraestrutura

## Decisão

Adotar a arquitetura em Camadas no backend, concentrando a regra do checkout na camada de serviço, que abre uma transação, e a baixa de estoque na camada de repositório, por meio de um UPDATE condicional atômico executado item a item em ordem fixa. Tarefas pós-pedido saem do caminho do checkout para uma fila assíncrona.

## Justificativa

O cenário exige que, entre 50 compras simultâneas para 10 unidades, exatamente 10 sejam aprovadas. A baixa condicional atômica faz a verificação e a baixa do estoque num único passo no banco, sem intervalo em que outra requisição possa interferir. Com isso, o resultado é sempre 10 aprovados, 40 rejeitados e estoque 0. As Camadas garantem que essa regra fique em um único ponto (serviço + repositório) e que nenhuma rota ou tela consiga alterar o estoque por fora dela. Por fim, é o padrão que a equipe já domina e que cabe no prazo e na hospedagem disponíveis.

## Consequências

Ganhos: impossibilidade de vender além do estoque, mesmo sob compras simultâneas; pedidos com vários itens são tudo-ou-nada; transação curta; nenhuma infraestrutura extra; código organizado e fácil de testar por camada.
Perdas: mais código intermediário e chamadas entre camadas; dependência de disciplina da equipe, porque quem acessar o banco fora do repositório quebra a garantia; convivência de Prisma com SQL puro, o que reduz a uniformidade do código; acoplamento ao PostgreSQL; o comprador que perde a disputa recebe erro de estoque insuficiente, e a interface precisa tratar isso bem.

## Alternativas consideradas

Orientado a Eventos no checkout: descartado porque traz consistência eventual, e o comprador poderia receber aprovação antes da confirmação do estoque, o que viola o cenário. Ficou restrito às tarefas pós-pedido.
CQRS: descartado porque não resolve a concorrência na escrita do estoque e adiciona complexidade incompatível com o prazo.
Leitura seguida de atualização na aplicação: descartada porque o teste mostrou 50 aprovações e 41 escritas perdidas.
Lock distribuído (Redis): descartado porque exige infraestrutura extra sem orçamento, e o PostgreSQL já resolve o problema.

## Rastreabilidade

**Atributo de qualidade:** Confiabilidade · Ausência de falhas

**Cenário que originou a decisão:**

> Durante um pico de acesso, com uma peça em destaque na vitrine, 50 compradores autenticados confirmam ao mesmo tempo o checkout do mesmo produto, que tem 10 unidades em estoque. O serviço de checkout aprova apenas os pedidos cobertos pelo estoque e rejeita os demais com a mensagem de estoque insuficiente, resultando em exatamente 10 pedidos aprovados, 40 rejeitados e estoque final igual a 0, sem estoque negativo nem escritas perdidas, em 100% das execuções do teste de concorrência.

**Padrão arquitetural adotado:** Camadas

**Táticas empacotadas:** Encapsular responsabilidades por faixa; Restringir dependências a uma direção; Usar intermediário entre camadas

backend/ (camadas routes, controllers, services, repositories); RELATORIO.md (entrega FCCPD U1); evidencias/ (saídas dos testes de concorrência); docs/arquitetura.md; docs/Origem_DDL.md

## Verificação

- **Teste do cenário:** Teste de concorrência do backend, executado com npm run evidencias na pasta backend/. Ele dispara 50 compras simultâneas de um produto com 10 unidades e verifica 10 aprovadas, 40 rejeitadas, estoque final 0 e nenhuma escrita perdida. As saídas ficam registradas em evidencias/. O teste deve passar em execuções repetidas.

---

_Gerado pelo estudo dirigido de Arquitetura de Software · ADS020 · 2026.2._
