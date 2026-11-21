# Métricas dos modelos do módulo de IA

## Recomendação (recomendador.py)

Dados lidos do banco: 13 produtos, 7 compradores, 5 com 2 ou mais compras.

### Deixa um de fora

Posição em que a compra escondida apareceu ("fora" = não entrou entre as 8):

| Comprador | Compras usadas | Escondida | Posição pela regra | Posição só por popularidade |
|---:|---|---:|---:|---:|
| 1 | 3, 1, 4 | 11 | 3 | 1 |
| 8 | 1 | 9 | 2 | 5 |
| 9 | 3 | 11 | 2 | 1 |
| 10 | 4 | 12 | 6 | 6 |
| 11 | 2 | 6 | 1 | 7 |

| Método | Acerto@3 | Acerto@8 |
|---|---:|---:|
| Regra (histórico + popularidade) | 80% (4/5) | 100% (5/5) |
| Linha de base: só popularidade | 40% (2/5) | 100% (5/5) |

### Cobertura e diversidade

- Produtos elegíveis (ativos, com estoque, artesão aprovado): 12 de 13.
- Elegíveis que aparecem em pelo menos uma lista (por produto ou por comprador): 12 de 12 (100%).
- Algum produto não elegível recomendado: não.
- Alguma lista com mais de 2 produtos do mesmo artesão: não.

## Sentimento (sentimento.py)

36 avaliações rotuladas à mão em `dados/avaliacoes_rotuladas.json`.

### Conjunto de teste (o número que vale: escrito com o léxico congelado)

| Método | Acurácia | F1 macro |
|---|---:|---:|
| Regra (léxico) | 50% (6/12) | 48% |
| Linha de base: sempre positivo | 42% | 20% |

| Classe | Precisão | Recall | F1 | Exemplos |
|---|---:|---:|---:|---:|
| positivo | 60% | 60% | 60% | 5 |
| neutro | 33% | 67% | 44% | 3 |
| negativo | 100% | 25% | 40% | 4 |

| Real ↓ / Previsto → | positivo | neutro | negativo |
|---|---:|---:|---:|
| positivo | 3 | 2 | 0 |
| neutro | 1 | 2 | 0 |
| negativo | 1 | 2 | 1 |

Erros da regra:

- "A pintura descascou em poucos dias.": era **negativo**, a regra disse **neutro** (termos: nenhum)
- "Minha família adorou o presente.": era **positivo**, a regra disse **neutro** (termos: nenhum)
- "Esperava mais, o tecido é fino demais.": era **negativo**, a regra disse **neutro** (termos: nenhum)
- "Nota dez para o atendimento da artesã.": era **positivo**, a regra disse **neutro** (termos: nenhum)
- "Nunca mais compro, demorou quase dois meses.": era **negativo**, a regra disse **positivo** (termos: demorou (+1))
- "Bonito, porém a alça é curta para mim.": era **neutro**, a regra disse **positivo** (termos: bonito (+1))

### Conjunto de desenvolvimento (otimista: o léxico foi escrito olhando para ele)

| Método | Acurácia | F1 macro |
|---|---:|---:|
| Regra (léxico) | 92% (22/24) | 90% |
| Linha de base: sempre positivo | 50% | 22% |

| Classe | Precisão | Recall | F1 | Exemplos |
|---|---:|---:|---:|---:|
| positivo | 100% | 92% | 96% | 12 |
| neutro | 80% | 80% | 80% | 5 |
| negativo | 88% | 100% | 93% | 7 |

| Real ↓ / Previsto → | positivo | neutro | negativo |
|---|---:|---:|---:|
| positivo | 11 | 1 | 0 |
| neutro | 0 | 4 | 1 |
| negativo | 0 | 0 | 7 |

Erros da regra:

- "Demorou um pouco, mas chegou inteiro.": era **neutro**, a regra disse **negativo** (termos: demorou (-1))
- "Gostei bastante, só a caixa veio amassada.": era **positivo**, a regra disse **neutro** (termos: gostei (+1), amassada (-1))

## Classificação (classificador.py)

### Conjunto de teste (12 produtos fictícios, palavras-chave congeladas)

- Acurácia: **75%** (9/12); F1 macro 82%.
- Quando decide (classe diferente de indefinida), acerta 9 de 9 (100%).
- Iriam para revisão: 3 de 12.
- Linha de base "sempre a categoria mais comum": 25%.

| Classe | Precisão | Recall | F1 | Exemplos |
|---|---:|---:|---:|---:|
| Cerâmica | 100% | 67% | 80% | 3 |
| Madeira | 100% | 33% | 50% | 3 |
| Renda | 100% | 100% | 100% | 3 |
| Couro | 100% | 100% | 100% | 3 |

| Real ↓ / Previsto → | Cerâmica | Madeira | Renda | Couro | indefinida |
|---|---:|---:|---:|---:|---:|
| Cerâmica | 2 | 0 | 0 | 0 | 1 |
| Madeira | 0 | 1 | 0 | 0 | 2 |
| Renda | 0 | 0 | 3 | 0 | 0 |
| Couro | 0 | 0 | 0 | 3 | 0 |

Erros:

- "Conjunto de Pratos Pintados": era **Cerâmica**, a regra disse **indefinida**
- "Santo de Ex-voto": era **Madeira**, a regra disse **indefinida**
- "Fruteira de Mesa": era **Madeira**, a regra disse **indefinida**

### Conjunto de desenvolvimento (os 13 produtos do seed: otimista)

- Acurácia: **100%** (13/13); F1 macro 100%.
- Quando decide (classe diferente de indefinida), acerta 13 de 13 (100%).
- Iriam para revisão: 0 de 13.
- Linha de base "sempre a categoria mais comum": 31%.

| Classe | Precisão | Recall | F1 | Exemplos |
|---|---:|---:|---:|---:|
| Cerâmica | 100% | 100% | 100% | 3 |
| Madeira | 100% | 100% | 100% | 4 |
| Renda | 100% | 100% | 100% | 4 |
| Couro | 100% | 100% | 100% | 2 |

| Real ↓ / Previsto → | Cerâmica | Madeira | Renda | Couro | indefinida |
|---|---:|---:|---:|---:|---:|
| Cerâmica | 3 | 0 | 0 | 0 | 0 |
| Madeira | 0 | 4 | 0 | 0 | 0 |
| Renda | 0 | 0 | 4 | 0 | 0 |
| Couro | 0 | 0 | 0 | 2 | 0 |

