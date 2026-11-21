"""Métricas dos três modelos por regra do módulo de IA: recomendação, sentimento e classificação.

Recomendação: "deixa um de fora". Para cada comprador com 2 ou mais compras,
esconde a última, recomenda a partir das outras e confere se a escondida voltou
entre as 3 primeiras (acerto@3) e entre as 8 (acerto@8). Compara com só popularidade.
Mede também a cobertura (quantos produtos elegíveis aparecem em alguma lista).

Classificação: compara classificador.classificar() com a categoria real nos
13 produtos do seed (desenvolvimento) e em dados/produtos_rotulados.json
(teste, escrito com as palavras-chave congeladas).

Sentimento: compara sentimento.analisar() com os rótulos dados à mão em
dados/avaliacoes_rotuladas.json, separando o conjunto de desenvolvimento
(usado enquanto o léxico era escrito) do conjunto de teste (escrito depois,
com o léxico congelado). Para ter com o que comparar, mede também a linha
de base "sempre positivo" (chutar a classe mais comum). Não há linha de base
"pela nota": as notas das avaliações fictícias foram escritas junto com os
rótulos, então essa comparação seria circular (daria 100% por construção).

Métricas: acurácia (acertos / total) e, por classe, precisão (dos que a regra
chamou de X, quantos eram X), recall (dos que eram X, quantos a regra achou)
e F1 (média harmônica das duas). Mais a matriz de confusão.

Uso (dentro de ia-recomendacao/):
    uv run python metricas.py                     # imprime em Markdown
    uv run python metricas.py --saida metricas.md # e grava num arquivo
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import classificador
import dados
import recomendador
import sentimento
import uso

PASTA_DADOS = Path(__file__).resolve().parent / "dados"
ROTULADAS = PASTA_DADOS / "avaliacoes_rotuladas.json"
PRODUTOS_ROTULADOS = PASTA_DADOS / "produtos_rotulados.json"
CLASSES_SENTIMENTO = ["positivo", "neutro", "negativo"]
CATEGORIAS = list(classificador.PALAVRAS_CHAVE)
TOPO = 8  # o mesmo limite padrão da rota /usuarios/{id}/recomendados
TOPOS = (3, TOPO)  # com só 13 produtos, 8 itens cobrem quase tudo: o @3 separa melhor os métodos
LIMITE_POR_PRODUTO = 4  # o da rota /produtos/{id}/recomendados


def avaliar(reais: list[str], previstos: list[str], classes: list[str], extras: tuple[str, ...] = ()) -> dict:
    """Acurácia, precisão/recall/F1 por classe, F1 macro e matriz de confusão.

    `extras` são classes que só podem ser previstas (ex.: "indefinida"): viram
    coluna na matriz, mas não entram no F1 macro.
    """
    total = len(reais)
    acertos = sum(r == p for r, p in zip(reais, previstos))
    por_classe = {}
    for classe in classes:
        vp = sum(r == classe and p == classe for r, p in zip(reais, previstos))
        previstos_x = sum(p == classe for p in previstos)
        reais_x = sum(r == classe for r in reais)
        precisao = vp / previstos_x if previstos_x else 0.0
        recall = vp / reais_x if reais_x else 0.0
        f1 = 2 * precisao * recall / (precisao + recall) if precisao + recall else 0.0
        por_classe[classe] = {"precisao": precisao, "recall": recall, "f1": f1, "suporte": reais_x}
    colunas = classes + list(extras)
    matriz = {r: {p: sum(a == r and b == p for a, b in zip(reais, previstos)) for p in colunas} for r in classes}
    return {"total": total, "acuracia": acertos / total if total else 0.0, "por_classe": por_classe,
            "f1_macro": sum(c["f1"] for c in por_classe.values()) / len(classes), "matriz": matriz}


def pct(valor: float) -> str:
    return f"{valor * 100:.0f}%"


def tabela_por_classe(resultado: dict) -> list[str]:
    linhas = ["| Classe | Precisão | Recall | F1 | Exemplos |", "|---|---:|---:|---:|---:|"]
    for classe, m in resultado["por_classe"].items():
        linhas.append(f"| {classe} | {pct(m['precisao'])} | {pct(m['recall'])} | {pct(m['f1'])} | {m['suporte']} |")
    return linhas


def tabela_matriz(resultado: dict, classes: list[str]) -> list[str]:
    colunas = list(next(iter(resultado["matriz"].values())))
    linhas = ["| Real ↓ / Previsto → | " + " | ".join(colunas) + " |", "|---|" + "---:|" * len(colunas)]
    for real in classes:
        linhas.append(f"| {real} | " + " | ".join(str(resultado["matriz"][real][p]) for p in colunas) + " |")
    return linhas


def ler_catalogo() -> tuple[list[dict], dict[int, list[int]], str]:
    """Produtos e históricos pelas funções de dados.py, sem escrever no log de uso."""
    token = uso.ativo.set(False)
    try:
        return dados.listar_produtos(), dados.historicos_de_todos(), dados.ULTIMA_FONTE
    finally:
        uso.ativo.reset(token)


def recomendacao_md(produtos: list[dict], historicos: dict[int, list[int]], fonte: str) -> str:
    artefato = recomendador.montar_artefato(produtos)
    casos = {u: h for u, h in historicos.items() if len(h) >= 2}
    acertos = {(metodo, k): 0 for metodo in ("regra", "pop") for k in TOPOS}
    linhas_casos = []
    for usuario, historico in casos.items():
        escondido, resto = historico[-1], historico[:-1]
        regra = [i["id"] for i in recomendador.por_usuario(artefato, resto, TOPO)]
        pop = [i["id"] for i in recomendador.por_usuario(artefato, [], len(produtos)) if i["id"] not in resto][:TOPO]
        for k in TOPOS:
            acertos["regra", k] += escondido in regra[:k]
            acertos["pop", k] += escondido in pop[:k]
        posicao = lambda lista: str(lista.index(escondido) + 1) if escondido in lista else "fora"  # noqa: E731
        linhas_casos.append(f"| {usuario} | {', '.join(map(str, resto))} | {escondido} | "
                            f"{posicao(regra)} | {posicao(pop)} |")
    elegiveis = {p["id"] for p in produtos if recomendador.elegivel(p)}
    vistos: set[int] = set()
    por_artesao_ok = True
    for p in produtos:
        lista = recomendador.por_produto(artefato, p["id"], LIMITE_POR_PRODUTO)
        vistos.update(i["id"] for i in lista)
        contagem: dict[int, int] = {}
        for i in lista:
            contagem[i["artesaoId"]] = contagem.get(i["artesaoId"], 0) + 1
        por_artesao_ok &= all(n <= recomendador.MAX_POR_ARTESAO for n in contagem.values())
    for h in historicos.values():
        vistos.update(i["id"] for i in recomendador.por_usuario(artefato, h, TOPO))
    n = len(casos)
    saida = ["## Recomendação (recomendador.py)\n",
             f"Dados lidos do {fonte}: {len(produtos)} produtos, {len(historicos)} compradores, "
             f"{n} com 2 ou mais compras.\n",
             "### Deixa um de fora\n",
             "Posição em que a compra escondida apareceu (\"fora\" = não entrou entre as 8):\n",
             "| Comprador | Compras usadas | Escondida | Posição pela regra | Posição só por popularidade |",
             "|---:|---|---:|---:|---:|", *linhas_casos, "",
             "| Método | " + " | ".join(f"Acerto@{k}" for k in TOPOS) + " |", "|---|" + "---:|" * len(TOPOS),
             "| Regra (histórico + popularidade) | " + " | ".join(
                 f"{pct(acertos['regra', k] / n) if n else '-'} ({acertos['regra', k]}/{n})" for k in TOPOS) + " |",
             "| Linha de base: só popularidade | " + " | ".join(
                 f"{pct(acertos['pop', k] / n) if n else '-'} ({acertos['pop', k]}/{n})" for k in TOPOS) + " |", "",
             "### Cobertura e diversidade\n",
             f"- Produtos elegíveis (ativos, com estoque, artesão aprovado): {len(elegiveis)} de {len(produtos)}.",
             f"- Elegíveis que aparecem em pelo menos uma lista (por produto ou por comprador): "
             f"{len(vistos & elegiveis)} de {len(elegiveis)} ({pct(len(vistos & elegiveis) / len(elegiveis)) if elegiveis else '-'}).",
             f"- Algum produto não elegível recomendado: {'sim (falha da RF-04)' if vistos - elegiveis else 'não'}.",
             f"- Alguma lista com mais de {recomendador.MAX_POR_ARTESAO} produtos do mesmo artesão: "
             f"{'não' if por_artesao_ok else 'sim (falha da RNF-06)'}.", ""]
    return "\n".join(saida)


def classificacao_md(produtos: list[dict]) -> str:
    teste = json.loads(PRODUTOS_ROTULADOS.read_text(encoding="utf-8"))["produtos"]
    saida = ["## Classificação (classificador.py)\n"]
    for titulo, grupo in (("Conjunto de teste (12 produtos fictícios, palavras-chave congeladas)", teste),
                          ("Conjunto de desenvolvimento (os 13 produtos do seed: otimista)", produtos)):
        reais = [p["categoria"] for p in grupo]
        resultados = [classificador.classificar(p["nome"], p["descricao"]) for p in grupo]
        previstos = [r["classe"] for r in resultados]
        m = avaliar(reais, previstos, CATEGORIAS, extras=(classificador.INDEFINIDA,))
        decididos = [(r, p) for r, p in zip(reais, previstos) if p != classificador.INDEFINIDA]
        certos_decididos = sum(r == p for r, p in decididos)
        revisao = sum(classificador.status(r["classe"], r["confianca"], p["categoria"]) == "revisao"
                      for r, p in zip(resultados, grupo))
        saida.append(f"### {titulo}\n")
        saida.append(f"- Acurácia: **{pct(m['acuracia'])}** ({round(m['acuracia'] * len(grupo))}/{len(grupo)}); F1 macro {pct(m['f1_macro'])}.")
        saida.append(f"- Quando decide (classe diferente de indefinida), acerta {certos_decididos} de {len(decididos)}"
                     f" ({pct(certos_decididos / len(decididos)) if decididos else '-'}).")
        saida.append(f"- Iriam para revisão: {revisao} de {len(grupo)}.")
        saida.append(f"- Linha de base \"sempre a categoria mais comum\": "
                     f"{pct(max(reais.count(c) for c in CATEGORIAS) / len(grupo))}.\n")
        saida.extend(tabela_por_classe(m))
        saida.append("")
        saida.extend(tabela_matriz(m, CATEGORIAS))
        saida.append("")
        erros = [(p, prev) for p, prev in zip(grupo, previstos) if p["categoria"] != prev]
        if erros:
            saida.append("Erros:\n")
            for p, prev in erros:
                saida.append(f"- \"{p['nome']}\": era **{p['categoria']}**, a regra disse **{prev}**")
            saida.append("")
    return "\n".join(saida)


def sentimento_md() -> str:
    dados_rotulados = json.loads(ROTULADAS.read_text(encoding="utf-8"))["avaliacoes"]
    saida = ["## Sentimento (sentimento.py)\n",
             f"{len(dados_rotulados)} avaliações rotuladas à mão em `dados/avaliacoes_rotuladas.json`.\n"]
    for conjunto in ("teste", "desenvolvimento"):
        grupo = [a for a in dados_rotulados if a["conjunto"] == conjunto]
        reais = [a["rotulo"] for a in grupo]
        previstos = [sentimento.analisar(a["comentario"])["rotulo"] for a in grupo]
        regra = avaliar(reais, previstos, CLASSES_SENTIMENTO)
        sempre = avaliar(reais, ["positivo"] * len(grupo), CLASSES_SENTIMENTO)
        titulo = ("Conjunto de teste (o número que vale: escrito com o léxico congelado)" if conjunto == "teste"
                  else "Conjunto de desenvolvimento (otimista: o léxico foi escrito olhando para ele)")
        saida.append(f"### {titulo}\n")
        saida.append("| Método | Acurácia | F1 macro |")
        saida.append("|---|---:|---:|")
        saida.append(f"| Regra (léxico) | {pct(regra['acuracia'])} ({round(regra['acuracia'] * len(grupo))}/{len(grupo)}) "
                     f"| {pct(regra['f1_macro'])} |")
        saida.append(f"| Linha de base: sempre positivo | {pct(sempre['acuracia'])} | {pct(sempre['f1_macro'])} |")
        saida.append("")
        saida.extend(tabela_por_classe(regra))
        saida.append("")
        saida.extend(tabela_matriz(regra, CLASSES_SENTIMENTO))
        saida.append("")
        erros = [(a, p) for a, p in zip(grupo, previstos) if a["rotulo"] != p]
        if erros:
            saida.append("Erros da regra:\n")
            for a, p in erros:
                termos = ", ".join(f"{t} ({v:+g})" for t, v in sentimento.analisar(a["comentario"])["termos"]) or "nenhum"
                saida.append(f"- \"{a['comentario']}\": era **{a['rotulo']}**, a regra disse **{p}** "
                             f"(termos: {termos})")
            saida.append("")
    return "\n".join(saida)


def montar() -> str:
    produtos, historicos, fonte = ler_catalogo()
    return "\n".join(["# Métricas dos modelos do módulo de IA\n", recomendacao_md(produtos, historicos, fonte),
                      sentimento_md(), classificacao_md(produtos)])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--saida", type=Path)
    args = parser.parse_args()
    texto = montar()
    print(texto)
    if args.saida:
        args.saida.write_text(texto + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
