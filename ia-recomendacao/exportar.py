"""Exporta o retrato dados/catalogo.json a partir do banco, usando só as funções de dados.py.

O retrato é o que o módulo usa quando o banco está fora do ar (caso difícil
documentado no README). Rode de novo sempre que o seed mudar:

    uv run python exportar.py        (ou: just retrato)

Nada de dado pessoal vai para o arquivo: produtos, ids de usuário, ids de
produtos comprados e avaliações sem autor.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import dados


def main() -> None:
    produtos = dados.listar_produtos()
    if dados.ULTIMA_FONTE != "banco":
        raise SystemExit("O banco está fora do ar: suba-o (cd ../backend && docker compose up -d) e rode de novo.")
    usuarios = dados._ids_de_usuarios()
    historico = {str(u): h for u in usuarios if (h := dados.historico_do_usuario(u))}
    avaliacoes = {str(p["id"]): a for p in produtos if (a := dados.listar_avaliacoes(p["id"]))}
    retrato = {
        "exportadoEm": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "origem": "PostgreSQL do backend (backend/sql/02_seed.sql), via dados.py",
        "produtos": produtos,
        "usuarios": usuarios,
        "compradores": dados.listar_compradores(),
        "historico": historico,
        "avaliacoes": avaliacoes,
    }
    dados.RETRATO.write_text(json.dumps(retrato, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(produtos)} produtos, {len(usuarios)} usuários, {len(historico)} com compras, "
          f"{sum(len(a) for a in avaliacoes.values())} avaliações → {dados.RETRATO.name}")


if __name__ == "__main__":
    main()
