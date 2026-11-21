"""Testes do log de uso (uso.py): uma linha por chamada, com tudo o que a rubrica pede.

Cada teste grava num arquivo temporário, então o logs/uso_dados.jsonl de verdade
fica intacto. Precisam do banco com o seed (o mesmo de test_dados.py):

    cd ia-recomendacao && uv run python testes/test_uso.py      (ou: just testes-dados)
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import dados  # noqa: E402
import uso  # noqa: E402

BANCO_DESLIGADO = "postgres://origem:origem@127.0.0.1:1/origem"
CAMPOS = {"data_hora", "funcao", "quem_chamou", "parametros", "fonte", "resultado", "registros", "duracao_ms"}


class LogDeUso(unittest.TestCase):

    def setUp(self) -> None:
        self._pasta = tempfile.TemporaryDirectory()
        self._arquivo_original = uso.ARQUIVO
        self._url_original = dados.DATABASE_URL
        self._retrato_original = dados.RETRATO
        uso.ARQUIVO = Path(self._pasta.name) / "uso.jsonl"
        uso.quem_chamou.set("teste")

    def tearDown(self) -> None:
        uso.ARQUIVO = self._arquivo_original
        dados.DATABASE_URL = self._url_original
        dados.RETRATO = self._retrato_original
        self._pasta.cleanup()

    def linhas(self) -> list[dict]:
        return [json.loads(l) for l in uso.ARQUIVO.read_text(encoding="utf-8").splitlines()]

    def test_uma_linha_por_chamada_sem_apagar_as_anteriores(self) -> None:
        dados.buscar_produto(1)
        dados.buscar_produto(2)
        dados.historico_do_usuario(1)
        self.assertEqual([l["funcao"] for l in self.linhas()],
                         ["buscar_produto", "buscar_produto", "historico_do_usuario"])

    def test_linha_tem_os_campos_pedidos(self) -> None:
        dados.buscar_produto(8)
        linha = self.linhas()[0]
        self.assertTrue(CAMPOS <= set(linha), CAMPOS - set(linha))
        self.assertEqual(linha["parametros"], {"produto_id": 8})
        self.assertEqual((linha["quem_chamou"], linha["fonte"], linha["resultado"]), ("teste", "banco", "sucesso"))
        self.assertEqual((linha["registros"], linha["ids"]), (1, [8]))

    def test_nao_encontrado_fica_registrado(self) -> None:
        dados.buscar_produto(999)
        dados.historico_do_usuario(999)
        self.assertEqual([l["resultado"] for l in self.linhas()], ["nao-encontrado", "nao-encontrado"])

    def test_usuario_sem_historico_e_sucesso_com_zero_registros(self) -> None:
        dados.historico_do_usuario(13)
        linha = self.linhas()[0]
        self.assertEqual((linha["resultado"], linha["registros"], linha["ids"]), ("sucesso", 0, []))

    def test_leitura_em_massa_guarda_so_a_quantidade(self) -> None:
        dados.listar_produtos()
        linha = self.linhas()[0]
        self.assertEqual(linha["registros"], 13)
        self.assertNotIn("ids", linha)

    def test_banco_fora_do_ar_aparece_como_fonte_retrato(self) -> None:
        dados.DATABASE_URL = BANCO_DESLIGADO
        dados.buscar_produto(1)
        self.assertEqual(self.linhas()[0]["fonte"], "retrato")

    def test_erro_fica_registrado_com_o_motivo(self) -> None:
        # Banco fora do ar e sem retrato: não há de onde ler, e isso tem que aparecer no log.
        dados.DATABASE_URL = BANCO_DESLIGADO
        dados.RETRATO = Path(self._pasta.name) / "nao-existe.json"
        with self.assertRaises(FileNotFoundError):
            dados.listar_produtos()
        linha = self.linhas()[0]
        self.assertEqual(linha["resultado"], "erro")
        self.assertTrue(linha["erro"].startswith("FileNotFoundError"), linha["erro"])

    def test_log_desligado_nao_escreve(self) -> None:
        token = uso.ativo.set(False)
        try:
            dados.buscar_produto(1)
        finally:
            uso.ativo.reset(token)
        self.assertFalse(uso.ARQUIVO.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
