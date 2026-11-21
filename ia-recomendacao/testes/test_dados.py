"""Testes das funções de acesso (dados.py): o "não encontrado" e o banco fora do ar.

Rodam duas vezes cada: lendo o banco e lendo o retrato JSON (banco desligado
de propósito, numa porta onde não há nada). Precisam do banco com o seed:

    cd ../backend && docker compose up -d
    cd ../ia-recomendacao && uv run python testes/test_dados.py      (ou: just testes-dados)
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import dados  # noqa: E402
import uso  # noqa: E402

uso.quem_chamou.set("teste")
uso.ativo.set(False)  # estes testes não escrevem no log de uso (quem testa o log é test_uso.py)

BANCO_DESLIGADO = "postgres://origem:origem@127.0.0.1:1/origem"


class FuncoesDeAcesso:
    """Os mesmos casos para as duas fontes; cada subclasse escolhe a fonte."""

    fonte = ""
    url = dados.DATABASE_URL

    def setUp(self) -> None:
        self._url_original = dados.DATABASE_URL
        dados.DATABASE_URL = self.url

    def tearDown(self) -> None:
        self.assertEqual(dados.ULTIMA_FONTE, self.fonte, "a leitura veio da fonte errada")
        dados.DATABASE_URL = self._url_original

    def test_listar_produtos_traz_o_catalogo_inteiro(self) -> None:
        produtos = dados.listar_produtos()
        self.assertEqual([p["id"] for p in produtos], list(range(1, 14)))
        self.assertEqual(produtos[10]["artesao"], "Severina Cavalcanti")  # Comunidade do Pilar

    def test_buscar_produto_existente_e_inexistente(self) -> None:
        self.assertEqual(dados.buscar_produto(8)["estoque"], 0)
        self.assertIsNone(dados.buscar_produto(999))

    def test_historico_ignora_pedido_cancelado(self) -> None:
        self.assertEqual(dados.historico_do_usuario(9), [3, 11])  # o pedido 9 (produto 5) foi cancelado

    def test_historico_usuario_sem_compras_e_usuario_inexistente(self) -> None:
        self.assertEqual(dados.historico_do_usuario(13), [])
        self.assertIsNone(dados.historico_do_usuario(999))

    def test_avaliacoes_sem_autor(self) -> None:
        avaliacoes = dados.listar_avaliacoes(12)
        self.assertEqual([a["nota"] for a in avaliacoes], [2])
        self.assertNotIn("usuario_id", avaliacoes[0])

    def test_avaliacoes_produto_sem_avaliacao_e_inexistente(self) -> None:
        self.assertEqual(dados.listar_avaliacoes(13), [])
        self.assertIsNone(dados.listar_avaliacoes(999))

    def test_listar_compradores(self) -> None:
        self.assertEqual(dados.listar_compradores(), [1, 7, 8, 9, 10, 11, 13])


class NoBanco(FuncoesDeAcesso, unittest.TestCase):
    fonte = "banco"


class NoRetrato(FuncoesDeAcesso, unittest.TestCase):
    fonte = "retrato"
    url = BANCO_DESLIGADO


if __name__ == "__main__":
    unittest.main(verbosity=2)
