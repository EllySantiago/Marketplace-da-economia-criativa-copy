"""Métricas dos modelos por regra do módulo de IA.

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

import sentimento

ROTULADAS = Path(__file__).resolve().parent / "dados" / "avaliacoes_rotuladas.json"
CLASSES_SENTIMENTO = ["positivo", "neutro", "negativo"]


def avaliar(reais: list[str], previstos: list[str], classes: list[str]) -> dict:
    """Acurácia, precisão/recall/F1 por classe, F1 macro e matriz de confusão."""
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
    matriz = {r: {p: sum(a == r and b == p for a, b in zip(reais, previstos)) for p in classes} for r in classes}
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
    linhas = ["| Real ↓ / Previsto → | " + " | ".join(classes) + " |", "|---|" + "---:|" * len(classes)]
    for real in classes:
        linhas.append(f"| {real} | " + " | ".join(str(resultado["matriz"][real][p]) for p in classes) + " |")
    return linhas


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
    return "# Métricas dos modelos do módulo de IA\n\n" + sentimento_md()


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
