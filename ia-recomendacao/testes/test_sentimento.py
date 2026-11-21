"""Testes das regras de sentimento (sentimento.py). Funções puras: não precisam de banco.

    cd ia-recomendacao && uv run python testes/test_sentimento.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from metricas import avaliar  # noqa: E402
from sentimento import analisar, resumir  # noqa: E402


def rotulo(texto: str) -> str:
    return analisar(texto)["rotulo"]


class Regras(unittest.TestCase):

    def test_palavras_positivas_e_negativas(self) -> None:
        self.assertEqual(rotulo("Peça linda e perfeita"), "positivo")
        self.assertEqual(rotulo("Chegou quebrada e suja"), "negativo")

    def test_acento_e_maiuscula_nao_importam(self) -> None:
        self.assertEqual(analisar("ÓTIMO")["pontuacao"], analisar("otimo")["pontuacao"])

    def test_negacao_inverte(self) -> None:
        self.assertEqual(rotulo("não é bonito"), "negativo")
        self.assertEqual(rotulo("nunca vi nada tão ruim"), "negativo")  # "tão ruim" continua ruim
        self.assertEqual(rotulo("não achei ruim"), "positivo")

    def test_intensificador_e_atenuador(self) -> None:
        self.assertEqual(analisar("muito bonita")["pontuacao"], 1.5)
        self.assertEqual(analisar("um pouco longo")["pontuacao"], -0.5)

    def test_depois_do_mas_pesa_mais(self) -> None:
        # +1 antes do "mas"; -1,5 e -1,5 depois: o defeito pesa mais que o elogio.
        self.assertEqual(rotulo("O bordado é bonito, mas a toalha chegou manchada e a entrega atrasou."), "negativo")
        # Um elogio contra um defeito só: +1 - 1,5 = -0,5, que fica na faixa do neutro.
        self.assertEqual(rotulo("O bordado é bonito, mas a toalha chegou manchada"), "neutro")
        self.assertEqual(rotulo("Demorou, mas é lindo e perfeito"), "positivo")

    def test_expressao_de_varias_palavras(self) -> None:
        resultado = analisar("Jarro bonito, mas menor do que parecia nas fotos.")
        self.assertEqual(resultado["rotulo"], "neutro")
        self.assertIn(("menor do que parecia", -1.5), resultado["termos"])

    def test_texto_vazio_ou_desconhecido_e_neutro(self) -> None:
        self.assertEqual(rotulo(""), "neutro")
        self.assertEqual(rotulo("Comprei para minha mãe."), "neutro")

    def test_resumo(self) -> None:
        analisadas = [{"sentimento": "positivo", "pontuacao": 2}, {"sentimento": "positivo", "pontuacao": 1},
                      {"sentimento": "negativo", "pontuacao": -3}]
        r = resumir(analisadas)
        self.assertEqual((r["total"], r["rotuloGeral"], r["pontuacaoMedia"]), (3, "positivo", 0.0))
        self.assertEqual(resumir([{"sentimento": "positivo", "pontuacao": 1},
                                  {"sentimento": "negativo", "pontuacao": -1}])["rotuloGeral"], "neutro")
        self.assertIsNone(resumir([])["rotuloGeral"])


class Metricas(unittest.TestCase):

    def test_precisao_recall_e_matriz(self) -> None:
        reais = ["positivo", "positivo", "negativo", "neutro"]
        previstos = ["positivo", "neutro", "negativo", "positivo"]
        m = avaliar(reais, previstos, ["positivo", "neutro", "negativo"])
        self.assertEqual(m["acuracia"], 0.5)
        self.assertEqual((m["por_classe"]["positivo"]["precisao"], m["por_classe"]["positivo"]["recall"]), (0.5, 0.5))
        self.assertEqual(m["por_classe"]["negativo"]["f1"], 1.0)
        self.assertEqual(m["por_classe"]["neutro"]["f1"], 0.0)  # sem divisão por zero
        self.assertEqual(m["matriz"]["positivo"], {"positivo": 1, "neutro": 1, "negativo": 0})


if __name__ == "__main__":
    unittest.main(verbosity=2)
