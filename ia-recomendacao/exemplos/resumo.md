# Resumo do log de uso do módulo de IA

35 chamadas registradas, de 2026-11-21T09:57:26-03:00 a 2026-11-21T09:57:31-03:00. Catálogo comparado: 13 produtos e 7 compradores (lidos do banco).

## Chamadas por função

| Função | Chamadas | Sucesso | Não encontrado | Erro | Registros devolvidos |
|---|---:|---:|---:|---:|---:|
| `buscar_produto` | 7 | 5 | 2 | 0 | 5 |
| `listar_produtos` | 7 | 7 | 0 | 0 | 91 |
| `recomendar_por_produto` | 5 | 2 | 2 | 1 | 8 |
| `listar_avaliacoes` | 4 | 3 | 1 | 0 | 2 |
| `sentimento_do_produto` | 4 | 3 | 1 | 0 | 2 |
| `historico_do_usuario` | 3 | 3 | 0 | 0 | 4 |
| `recomendar_por_usuario` | 3 | 3 | 0 | 0 | 15 |
| `classificar_produto` | 1 | 1 | 0 | 0 | 1 |
| `historicos_de_todos` | 1 | 1 | 0 | 0 | 7 |

Funções nunca chamadas: `listar_compradores`, `gravar_classificacao`.

## Quem chamou e de onde vieram os dados

Quem chamou: teste 20, api 12, lote 2, script 1.  
Fonte: banco 33, retrato 1.

## Produtos mais usados

"Consultado" = o produto foi o assunto da chamada (detalhe, avaliações, referência); "devolvido" = apareceu numa lista de recomendações ou num histórico.

| Produto | Nome | Consultado | Devolvido | Total |
|---:|---|---:|---:|---:|
| 1 | Cangaceiro de Barro — Lampião e Maria Bonita | 7 | 3 | 10 |
| 11 | Bolsa de Crochê Maré do Pilar | 2 | 5 | 7 |
| 12 | Toalha Bordada Casario do Recife | 4 | 1 | 5 |
| 3 | Caminho de Mesa em Renda Renascença | 0 | 5 | 5 |
| 5 | Família de Bonecos do Alto do Moura | 0 | 3 | 3 |

## Produtos nunca usados

| Produto | Nome | Por quê |
|---:|---|---|
| 6 | Escultura Cabra do Sertão em Madeira | elegível, mas nenhuma chamada pediu algo parecido com ele |
| 8 | Cinto de Vaqueiro em Couro Trançado | sem estoque → fora das recomendações pela RF-04 (correto) |
| 10 | Painel Entalhado Cordel do Sertão | sem venda e sem avaliação → popularidade 0 e nenhum semelhante pedido (arranque a frio) |

Compradores com recomendação ou histórico consultado: 2 de 7 (nunca consultados: 7, 8, 9, 10, 11).

## Erros

| Motivo | Vezes | Função | Última vez |
|---|---:|---|---|
| TimeoutError: passou de 2 s (RF-08) | 1 | recomendar_por_produto | 2026-11-21T09:57:28-03:00 |

Além disso, 6 chamada(s) pediram um id que não existe ("não encontrado"). Isso não é erro do módulo: a resposta certa é 404 (RF-02).

## Respostas

**(a) Qual dado o módulo mais usa?** `listar_produtos`: 7 de 35 chamadas e 91 registros devolvidos, mais que qualquer outra função. Ou seja, o catálogo inteiro de produtos: toda recomendação lê todos os produtos para comparar com a referência e calcular a popularidade. O registro mais usado foi o produto 1 (Cangaceiro de Barro — Lampião e Maria Bonita), em 10 chamadas.

**(b) Algum dado nunca foi usado?** 3 produto(s) nunca apareceram (6, 8, 10). O motivo de cada um está na tabela acima: os que estão sem estoque ou inativos ficam de fora pela regra (o filtro funciona); os que não têm venda nem avaliação mostram o arranque a frio, porque a popularidade não ajuda produto novo, e ele só aparece se alguém pedir um semelhante; as funções `listar_compradores`, `gravar_classificacao` não foram chamadas neste período.

**(c) Houve erro?** Sim, 1. 1× "TimeoutError: passou de 2 s (RF-08)": a estratégia passou de 2 s e o serviço respondeu 503 em vez de deixar o cliente esperando (RF-08). Em 1 chamada(s) o banco estava fora do ar e os dados vieram do retrato JSON; isso não conta como erro, porque a resposta saiu.

