"""Classificação automática de produtos por palavras-chave (sem modelo treinado).

Para que serve no Origem: quando o artesão cadastra uma peça, o módulo lê o
nome e a descrição e diz a que categoria ela parece pertencer. Se a
categoria escolhida pelo artesão bate com a do texto, a classificação fica
"aprovado"; se não bate, ou se o texto não deixa claro, fica "revisao" para o
administrador olhar. O resultado vai para a tabela classificacao_produto
(classe + confiança), que já existia no schema desde a U1.

Como funciona:
  1. nome e descrição vão para minúsculas e perdem os acentos;
  2. cada palavra-chave de uma categoria encontrada no NOME vale 2 pontos, e
     na DESCRIÇÃO vale 1 (o nome costuma dizer o material; a descrição fala de
     muita coisa, inclusive embalagem e forro);
  3. a classe é a categoria com mais pontos, e a confiança é a fatia dela no
     total de pontos (0 a 1). Empate ou nenhum ponto = "indefinida", confiança 0;
  4. confiança abaixo de 0,6 ou classe diferente da categoria do produto = "revisao".

Funções puras: nada aqui lê banco ou arquivo.
"""

from __future__ import annotations

from sentimento import normalizar

PALAVRAS_CHAVE = {
    "Cerâmica": {"ceramica", "barro", "argila", "vidrada", "vidrado", "jarro", "vaso", "moringa", "panela",
                 "bonecos", "boneco", "cozido", "queimado", "esmaltada", "terracota", "alto do moura"},
    "Madeira": {"madeira", "cedro", "entalhado", "entalhada", "entalhe", "entalhamento", "talhado", "imburana",
                "jacaranda", "oratorio", "escultura", "painel", "reaproveitada", "marcenaria", "tronco"},
    "Renda": {"renda", "renascenca", "bilro", "croche", "bordado", "bordada", "linha", "toalha", "caminho de mesa",
              "labirinto", "fuxico", "tecido", "trama", "agulha", "ponto"},
    "Couro": {"couro", "curtido", "curtida", "cru", "vaqueiro", "sela", "cinto", "sandalia", "bolsa", "trancado",
              "carteira", "gibao", "noz de galha"},
}
PESO_NOME = 2
PESO_DESCRICAO = 1
CONFIANCA_MINIMA = 0.6
INDEFINIDA = "indefinida"


def _encontradas(texto: str) -> dict[str, list[str]]:
    normal = " " + " ".join(normalizar(texto or "").split()) + " "
    achadas = {}
    for categoria, palavras in PALAVRAS_CHAVE.items():
        lista = [p for p in palavras if f" {p} " in normal]
        if lista:
            achadas[categoria] = sorted(lista)
    return achadas


def classificar(nome: str, descricao: str | None) -> dict:
    """{"classe", "confianca", "pontos": {categoria: pontos}, "palavras": {categoria: [...]}}."""
    no_nome = _encontradas(nome)
    na_descricao = _encontradas(descricao or "")
    pontos: dict[str, int] = {}
    palavras: dict[str, list[str]] = {}
    for categoria in PALAVRAS_CHAVE:
        p = PESO_NOME * len(no_nome.get(categoria, [])) + PESO_DESCRICAO * len(na_descricao.get(categoria, []))
        if p:
            pontos[categoria] = p
            palavras[categoria] = sorted(set(no_nome.get(categoria, []) + na_descricao.get(categoria, [])))
    total = sum(pontos.values())
    if not total:
        return {"classe": INDEFINIDA, "confianca": 0.0, "pontos": {}, "palavras": {}}
    maior = max(pontos.values())
    vencedoras = [c for c, p in pontos.items() if p == maior]
    if len(vencedoras) > 1:
        return {"classe": INDEFINIDA, "confianca": 0.0, "pontos": pontos, "palavras": palavras}
    return {"classe": vencedoras[0], "confianca": round(maior / total, 3), "pontos": pontos, "palavras": palavras}


def status(classe: str, confianca: float, categoria_atual: str | None) -> str:
    """'aprovado' se a classe bate com a categoria do produto e a confiança é suficiente; senão 'revisao'."""
    if classe == INDEFINIDA or confianca < CONFIANCA_MINIMA:
        return "revisao"
    if categoria_atual is not None and classe != categoria_atual:
        return "revisao"
    return "aprovado"
