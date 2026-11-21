"""Análise de sentimento das avaliações, por regra (sem modelo treinado).

Como funciona, palavra por palavra:
  1. o texto vai para minúsculas e perde os acentos ("ótimo" = "otimo");
  2. expressões de várias palavras são vistas primeiro ("menor do que parecia");
  3. cada palavra do léxico vale +1 (positiva) ou -1 (negativa);
  4. uma negação até 3 palavras antes inverte o sinal ("não gostei" = -1);
  5. um intensificador logo antes multiplica por 1,5 ("muito bonita") e um
     atenuador por 0,5 ("um pouco longo");
  6. depois de "mas", "porém", "entretanto" e afins, as palavras valem 1,5×:
     em português o que vem depois do "mas" costuma ser o que a pessoa quer dizer.
A soma dá a pontuação. Acima de +0,5 é positivo, abaixo de -0,5 é negativo,
e o resto é neutro (inclusive texto vazio ou sem nenhuma palavra conhecida).

Funções puras: nada aqui lê banco ou arquivo. Os dados chegam pelo serviço,
que usa dados.listar_avaliacoes.
"""

from __future__ import annotations

import re
import unicodedata

POSITIVAS = {
    "lindo", "linda", "lindos", "lindas", "bonito", "bonita", "bonitos", "bonitas", "belo", "bela",
    "perfeito", "perfeita", "impecavel", "otimo", "otima", "excelente", "maravilhoso", "maravilhosa",
    "incrivel", "impressionante", "caprichado", "caprichada", "capricho", "cuidado", "cuidadoso",
    "qualidade", "resistente", "confortavel", "delicado", "delicada", "elogios", "amei", "adorei",
    "gostei", "recomendo", "satisfeito", "satisfeita", "rapido", "rapida", "bem", "embalada",
    "embalado", "autentico", "autenticidade", "original", "vale", "leve", "macio", "macia",
    "encantador", "encantadora", "feliz", "superou", "pontual", "certinho", "bom", "boa",
}
NEGATIVAS = {
    "feio", "feia", "ruim", "pessimo", "pessima", "horrivel", "quebrado", "quebrada", "quebrou",
    "manchado", "manchada", "rasgado", "rasgada", "defeito", "defeituoso", "danificado", "danificada",
    "atrasou", "atraso", "atrasada", "atrasado", "demorou", "demora", "longo", "longa", "caro", "cara",
    "frageis", "fragil", "decepcionante", "decepcao", "decepcionei", "arrependi", "problema",
    "fraco", "fraca", "solto", "solta", "torto", "torta", "errado", "errada", "faltando", "sujo",
    "suja", "desbotou", "desbotado", "descosturou", "pior", "lamentavel", "insatisfeito",
    "insatisfeita", "devolver", "devolvi", "reclamacao", "amassado", "amassada",
}
# Expressões avaliadas antes das palavras soltas (o valor já é o da expressão inteira).
EXPRESSOES = {
    "menor do que parecia": -1, "diferente da foto": -1, "diferente das fotos": -1,
    "nao recomendo": -1, "nao gostei": -1, "deixou a desejar": -1, "nao chegou": -1,
    "melhor do que esperava": 1, "melhor do que parecia": 1, "vale a pena": 1, "chegou rapido": 1,
    "antes do prazo": 1, "dentro do prazo": 1, "chegou certinho": 1,
}
NEGACOES = {"nao", "nem", "nunca", "jamais", "nenhum", "nenhuma"}
INTENSIFICADORES = {"muito", "muita", "super", "bastante", "altissima", "altissimo", "extremamente", "tao", "demais"}
ATENUADORES = {"pouco", "meio", "levemente", "um pouco"}
ADVERSATIVAS = {"mas", "porem", "entretanto", "contudo", "todavia", "so que"}

JANELA_NEGACAO = 3
PESO_INTENSIFICADOR = 1.5
PESO_ATENUADOR = 0.5
PESO_DEPOIS_DO_MAS = 1.5
LIMIAR = 0.5


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]+", " ", sem_acento)


def _tokens(texto: str) -> list[str]:
    """Palavras, com as expressões do léxico e as adversativas/atenuadores de 2 palavras juntadas num token."""
    normal = " " + " ".join(normalizar(texto).split()) + " "
    for expressao in sorted(list(EXPRESSOES) + ["so que", "um pouco"], key=len, reverse=True):
        normal = normal.replace(f" {expressao} ", f" {expressao.replace(' ', '_')} ")
    return [t.replace("_", " ") for t in normal.split()]


def analisar(texto: str) -> dict:
    """{"rotulo": positivo|neutro|negativo, "pontuacao": float, "termos": [(termo, valor), ...]}."""
    tokens = _tokens(texto or "")
    pontuacao = 0.0
    termos: list[tuple[str, float]] = []
    depois_do_mas = False
    for i, token in enumerate(tokens):
        if token in ADVERSATIVAS:
            depois_do_mas = True
            continue
        if token in EXPRESSOES:
            valor = float(EXPRESSOES[token])
        elif token in POSITIVAS:
            valor = 1.0
        elif token in NEGATIVAS:
            valor = -1.0
        else:
            continue
        anteriores = tokens[max(0, i - JANELA_NEGACAO):i]
        if token not in EXPRESSOES and any(t in NEGACOES for t in anteriores):
            valor = -valor
        if i > 0 and tokens[i - 1] in INTENSIFICADORES:
            valor *= PESO_INTENSIFICADOR
        elif i > 0 and tokens[i - 1] in ATENUADORES:
            valor *= PESO_ATENUADOR
        if depois_do_mas:
            valor *= PESO_DEPOIS_DO_MAS
        pontuacao += valor
        termos.append((token, round(valor, 2)))
    if pontuacao > LIMIAR:
        rotulo = "positivo"
    elif pontuacao < -LIMIAR:
        rotulo = "negativo"
    else:
        rotulo = "neutro"
    return {"rotulo": rotulo, "pontuacao": round(pontuacao, 2), "termos": termos}


def resumir(analisadas: list[dict]) -> dict:
    """Contagem por rótulo e o rótulo geral do produto (o mais frequente; empate = neutro)."""
    contagem = {"positivo": 0, "neutro": 0, "negativo": 0}
    for a in analisadas:
        contagem[a["sentimento"]] += 1
    if not analisadas:
        return {"total": 0, "porRotulo": contagem, "rotuloGeral": None, "pontuacaoMedia": None}
    maior = max(contagem.values())
    vencedores = [r for r, n in contagem.items() if n == maior]
    media = round(sum(a["pontuacao"] for a in analisadas) / len(analisadas), 2)
    return {"total": len(analisadas), "porRotulo": contagem,
            "rotuloGeral": vencedores[0] if len(vencedores) == 1 else "neutro", "pontuacaoMedia": media}
