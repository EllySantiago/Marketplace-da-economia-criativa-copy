"""Classifica todos os produtos do catálogo e, com --gravar, salva em classificacao_produto.

Lê os produtos por dados.listar_produtos(), aplica classificador.classificar()
e mostra, para cada um, a categoria atual, a classe sugerida, a confiança e o
status (aprovado ou revisao). Com --gravar, cada resultado vira uma linha nova
em classificacao_produto por dados.gravar_classificacao() (o histórico fica:
a classificação vigente é a mais recente).

Uso (dentro de ia-recomendacao/):
    uv run python classificar.py            # só mostra
    uv run python classificar.py --gravar   # mostra e grava no banco
"""

from __future__ import annotations

import argparse

import classificador
import dados
import uso


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--gravar", action="store_true", help="grava o resultado em classificacao_produto")
    args = parser.parse_args()
    produtos = dados.listar_produtos()
    if args.gravar and dados.ULTIMA_FONTE != "banco":
        raise SystemExit("O banco está fora do ar (dados vieram do retrato): não há onde gravar.")
    print("| Produto | Categoria atual | Classe sugerida | Confiança | Status |")
    print("|---:|---|---|---:|---|")
    revisao = 0
    for produto in produtos:
        r = classificador.classificar(produto["nome"], produto["descricao"])
        st = classificador.status(r["classe"], r["confianca"], produto["categoria"])
        revisao += st == "revisao"
        if args.gravar:
            dados.gravar_classificacao(produto["id"], r["classe"], r["confianca"], st)
        print(f"| {produto['id']} | {produto['categoria']} | {r['classe']} | {r['confianca']:.3f} | {st} |")
    print(f"\n{len(produtos)} produtos, {revisao} para revisão" + (" — gravados em classificacao_produto." if args.gravar else "."))


if __name__ == "__main__":
    uso.quem_chamou.set("script")
    main()
