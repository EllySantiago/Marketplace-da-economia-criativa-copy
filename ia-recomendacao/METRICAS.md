# Métricas dos três modelos, interpretadas

Os três "modelos" do módulo são regras escritas à mão, sem treino: recomendação
(`recomendador.py`), sentimento (`sentimento.py`) e classificação (`classificador.py`). Os
números abaixo saem de `just metricas` (= `uv run python metricas.py --saida resultados/metricas.md`),
rodado sobre o seed do backend. As tabelas completas, com matriz de confusão e cada erro, ficam em
[`resultados/metricas.md`](resultados/metricas.md).

**Como ler.** Sentimento e classificação têm dois conjuntos. O de **desenvolvimento** é o que
tínhamos na frente enquanto escrevíamos as regras, então o acerto nele é otimista. O de **teste**
foi escrito depois, com as regras já congeladas num commit (léxico em `b85937a`, palavras-chave
em `7b87ca3`), e nenhuma regra foi ajustada para ele. **O número que vale é o do teste.** Cada
modelo é comparado com uma linha de base boba, porque uma acurácia só diz alguma coisa quando
sabemos quanto se acertaria sem esforço nenhum.

## Resumo

| Modelo | Métrica principal | Resultado | Linha de base |
|---|---|---:|---:|
| Recomendação | acerto@3 (deixa um de fora, 5 compradores) | **80%** (4/5) | 40%, só popularidade |
| Sentimento | acurácia no teste (12 avaliações) | **50%** (6/12) | 42%, sempre "positivo" |
| Classificação | acurácia no teste (12 produtos) | **75%** (9/12) | 25%, sempre a mesma categoria |

## Recomendação

**O que foi medido.** Para cada comprador com 2 ou mais compras, escondemos a última,
recomendamos a partir das outras e olhamos em que posição a compra escondida apareceu. O
"acerto@3" conta as vezes em que ela ficou entre as 3 primeiras.

**O que os números dizem.**
- A regra coloca a compra escondida entre as 3 primeiras em 4 de 5 casos; só popularidade fica
  em 2 de 5. O histórico (mesma técnica, mesma categoria) traz informação que a popularidade
  sozinha não tem. Exemplo: o usuário 11 comprou o oratório de madeira e depois a escultura
  de madeira. A regra pôs a escultura em 1º lugar, e a popularidade em 7º.
- O acerto@8 dá 100% para os dois métodos. Isso não quer dizer nada: com só 12 produtos
  elegíveis, uma lista de 8 cobre dois terços do catálogo. Por isso o @3 é o número usado.
- Todos os 12 produtos elegíveis aparecem em alguma lista (cobertura de 100%), nenhum produto
  sem estoque ou inativo foi recomendado (RF-04) e nenhuma lista passou de 2 produtos do mesmo
  artesão (RNF-06).

**Cuidados.** São só 5 casos, então um acerto a mais ou a menos muda 20 pontos percentuais. Há
também um pequeno vazamento a favor da popularidade: a compra escondida continua contando
nas vendas que calculam a popularidade. Mesmo com essa ajuda, a popularidade perdeu.

## Sentimento

**O que foi medido.** 36 avaliações com o sentimento dado à mão (`dados/avaliacoes_rotuladas.json`):
24 de desenvolvimento (as 8 do seed e mais 16) e 12 de teste.

**O que os números dizem.**
- No desenvolvimento a regra acerta 92%; no teste, **50%**. A diferença é o tamanho do
  "decoreba": o léxico conhece as palavras que estavam na nossa frente.
- 50% é pouco acima da linha de base "sempre positivo" (42%). O F1 macro (48% contra 20%)
  mostra melhor a vantagem: a linha de base nunca acerta neutro nem negativo, e a regra acerta.
- **Negativo tem precisão de 100% e recall de 25%.** Quando a regra diz "negativo", está certa,
  mas ela deixa passar 3 de cada 4 reclamações. Para o Origem esse é o erro mais caro, porque
  uma reclamação que não aparece é um problema que o artesão não fica sabendo.

**Por que erra (os 6 erros do teste):**
- 4 erros são **palavra fora do léxico**: "descascou", "adorou" (o léxico tem "adorei"), "fino
  demais", "nota dez". A regra não conhece a palavra e cai em neutro. É a limitação clássica
  do léxico: cada flexão e cada expressão precisa estar escrita.
- 1 erro é um **defeito da regra de negação**: em "Nunca mais compro, demorou quase dois
  meses", o "nunca" inverteu o "demorou" e a reclamação virou elogio. A negação não deveria
  passar de vírgula, nem inverter uma palavra que já é negativa.
- 1 erro é de **julgamento**: "Bonito, porém a alça é curta para mim" foi rotulado como neutro,
  e a regra não conhece "curta".

**O que faríamos a seguir:** reduzir as palavras ao radical ("ador-", "descasc-"), cortar a
negação na pontuação e trocar o léxico por um modelo treinado quando houver avaliações reais
suficientes. Sem rótulos reais, um modelo treinado só aprenderia os nossos 36 exemplos.

## Classificação

**O que foi medido.** A categoria que a regra tira do nome e da descrição, comparada com a
categoria certa, nos 13 produtos do seed (desenvolvimento) e em 12 produtos fictícios
(`dados/produtos_rotulados.json`, teste).

**O que os números dizem.**
- Desenvolvimento 100%, teste **75%**, e a linha de base fica em 25% (as 4 categorias estão
  equilibradas no teste).
- **Os 3 erros do teste foram "indefinida", nenhum foi uma categoria errada.** Quando a regra
  decide, acerta 9 de 9, com precisão de 100% em todas as classes. O erro dela é não saber, e
  não chutar errado. Em produção esses 3 produtos iriam para `revisao` e o administrador
  decidiria.
- Madeira é a classe mais fraca (recall de 33%): "Santo de Ex-voto" e "Fruteira de Mesa" não
  dizem o material, e "talhada" não está no léxico (só "talhado"). Cerâmica errou "Conjunto de
  Pratos Pintados" pelo mesmo motivo: "louça" não está na lista.

**Para que serve no Origem.** A classificação não substitui a categoria escolhida pelo artesão.
Ela confere essa categoria: se o texto aponta para outra categoria, ou não aponta para nenhuma,
o produto vai para revisão. Com precisão alta e recall médio, o risco é pedir revisão demais,
e não aprovar errado, que é o lado certo para errar.

## Limitações gerais

- Conjuntos pequenos (5, 12 e 12 casos): os números servem para comparar a regra com a linha
  de base e para achar onde ela erra, e não como estimativa precisa.
- Rótulos dados pela equipe, com texto fictício. Não há avaliações nem cadastros reais no
  repositório, e isso é de propósito (sem dados pessoais).
- Revisão dos rótulos em 23/11, feita depois das medições. Os conjuntos não foram alterados,
  para não mexer no teste depois de ver o resultado, e os problemas ficam registrados aqui:
  - **"Jogo Americano de Fuxico" (1009) está como Renda, mas fuxico é costura de retalho.**
    Como o Origem só tem 4 categorias, Renda é a mais próxima, e a palavra "fuxico" está nas
    palavras-chave de Renda. Esse acerto vem da própria lista da regra: sem ele, o produto
    ficaria "indefinida" e o teste daria **67% (8/12)**. O número honesto fica entre 67% e 75%.
  - "Toalhinha de Labirinto" (1007) diz "tear de bastidor", mas labirinto se faz em bastidor,
    sem tear. É erro de texto e não muda o resultado.
  - "Porta-documentos Sertanejo" (1012) é descrito como "carteira de bolso". Também é palavra-chave
    de Couro, mas a descrição já diz "couro legítimo", então o acerto não depende dela.
  - No sentimento, a avaliação 212 ("Bonito, porém a alça é curta para mim", neutro) é parecida
    com a 116 ("Gostei bastante, só a caixa veio amassada", positivo). Os dois rótulos são
    defensáveis, e é o caso mais discutível do conjunto.
