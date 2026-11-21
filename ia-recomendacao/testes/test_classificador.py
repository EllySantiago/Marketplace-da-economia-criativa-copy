"""Testes da classificação por palavras-chave (classificador.py) e da gravação (dados.gravar_classificacao).

A parte do classificador é pura; a gravação precisa do banco com o seed e
acrescenta uma linha em classificacao_produto (o histórico é só de acréscimo).

    cd ia-recomendacao && uv run python testes/test_classificador.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import dados  # noqa: E402
import uso  # noqa: E402
from classificador import INDEFINIDA, classificar, status  # noqa: E402

uso.ativo.set(False)


class Classificador(unittest.TestCase):

    def test_nome_pesa_mais_que_a_descricao(self) -> None:
        r = classificar("Vaso de barro", "Acompanha cinto de couro para pendurar")
        self.assertEqual(r["classe"], "Cerâmica")
        self.assertEqual(r["pontos"], {"Cerâmica": 4, "Couro": 2})
        self.assertEqual(r["confianca"], round(4 / 6, 3))

    def test_sem_palavra_conhecida_e_indefinida(self) -> None:
        self.assertEqual(classificar("Peça única", "Feita com carinho")["classe"], INDEFINIDA)

    def test_empate_e_indefinida(self) -> None:
        r = classificar("Bolsa de crochê", None)
        self.assertEqual((r["classe"], r["confianca"]), (INDEFINIDA, 0.0))

    def test_status(self) -> None:
        self.assertEqual(status("Renda", 0.9, "Renda"), "aprovado")
        self.assertEqual(status("Renda", 0.9, "Couro"), "revisao")  # texto não bate com a categoria
        self.assertEqual(status("Renda", 0.5, "Renda"), "revisao")  # confiança baixa
        self.assertEqual(status(INDEFINIDA, 0.0, "Renda"), "revisao")


class Gravacao(unittest.TestCase):

    def test_grava_e_devolve_o_id(self) -> None:
        self.assertIn("id", dados.gravar_classificacao(1, "Cerâmica", 1.0, "aprovado"))

    def test_produto_inexistente(self) -> None:
        self.assertIsNone(dados.gravar_classificacao(999, "Cerâmica", 1.0, "aprovado"))

    def test_sem_banco_nao_grava(self) -> None:
        original = dados.DATABASE_URL
        dados.DATABASE_URL = "postgres://origem:origem@127.0.0.1:1/origem"
        try:
            with self.assertRaises(psycopg.OperationalError):
                dados.gravar_classificacao(1, "Cerâmica", 1.0, "aprovado")
        finally:
            dados.DATABASE_URL = original


if __name__ == "__main__":
    unittest.main(verbosity=2)
