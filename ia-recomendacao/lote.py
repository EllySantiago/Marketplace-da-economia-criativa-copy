"""Recalcula as recomendações de TODOS os compradores de uma vez, em sequência ou em paralelo.

Tarefa real: deixar pronta a lista "Escolhidos para você" de cada comprador
(RF-06), para a página inicial não precisar calcular nada na hora, e para
reprocessar tudo quando o catálogo muda. É o trecho paralelo do FCCPD U2.

Três fases, medidas separadamente:
  1. leitura  — produtos e históricos pelas funções de dados.py (2 consultas, sequencial);
  2. cálculo  — por_usuario() para cada comprador: só CPU, sem banco. É a fase
                paralelizada: com --processos N > 1, os compradores são divididos
                entre N processos (ProcessPoolExecutor). Processos, e não threads,
                porque no Python a GIL deixa só uma thread executar código Python
                por vez: threads não dariam ganho num cálculo puro de CPU;
  3. gravação — o resultado vai para logs/lote_recomendacoes.json.

Uso (dentro de ia-recomendacao/):
    uv run python lote.py                  # sequencial
    uv run python lote.py --processos 4    # 4 processos
"""

from __future__ import annotations

import argparse
import json
import math
import multiprocessing
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import dados
import recomendador

LIMITE = 8  # o mesmo padrão da rota /usuarios/{id}/recomendados
SAIDA = Path(__file__).resolve().parent / "logs" / "lote_recomendacoes.json"

# Cada processo do pool recebe o artefato UMA vez, no início (initializer), e
# não a cada tarefa: assim só os ids e históricos viajam entre processos.
_artefato_do_processo: dict | None = None


def _iniciar_processo(artefato: dict) -> None:
    global _artefato_do_processo
    _artefato_do_processo = artefato


def _recomendar(tarefa: tuple[int, list[int], int]) -> tuple[int, list[int]]:
    usuario_id, historico, limite = tarefa
    itens = recomendador.por_usuario(_artefato_do_processo, historico, limite)
    return usuario_id, [item["id"] for item in itens]


def calcular(artefato: dict, historicos: dict[int, list[int]], processos: int, limite: int = LIMITE) -> dict[int, list[int]]:
    """Fase 2. processos=1 roda no próprio processo, sem pool (a linha de base sequencial)."""
    tarefas = [(usuario, historico, limite) for usuario, historico in historicos.items()]
    if processos == 1:
        _iniciar_processo(artefato)
        return dict(map(_recomendar, tarefas))
    # Blocos maiores = menos idas e vindas entre processos; 4 blocos por processo
    # ainda equilibram a carga quando um bloco demora mais que outro.
    bloco = max(1, math.ceil(len(tarefas) / (processos * 4)))
    # "spawn" funciona igual em Linux, Windows e macOS (cada processo começa limpo).
    contexto = multiprocessing.get_context("spawn")
    with ProcessPoolExecutor(max_workers=processos, mp_context=contexto,
                             initializer=_iniciar_processo, initargs=(artefato,)) as pool:
        return dict(pool.map(_recomendar, tarefas, chunksize=bloco))


def executar(processos: int, limite: int = LIMITE, gravar: bool = True) -> dict:
    """Roda as três fases e devolve os tempos (em segundos) e o resultado."""
    t0 = time.perf_counter()
    artefato = recomendador.montar_artefato(dados.listar_produtos())
    historicos = dados.historicos_de_todos()
    t1 = time.perf_counter()
    resultado = calcular(artefato, historicos, processos, limite)
    t2 = time.perf_counter()
    if gravar:
        SAIDA.parent.mkdir(parents=True, exist_ok=True)
        SAIDA.write_text(json.dumps({str(u): ids for u, ids in resultado.items()}), encoding="utf-8")
    t3 = time.perf_counter()
    return {
        "processos": processos,
        "fonte": dados.ULTIMA_FONTE,
        "produtos": len(artefato["produtos"]),
        "compradores": len(historicos),
        "leitura_s": t1 - t0,
        "calculo_s": t2 - t1,
        "gravacao_s": t3 - t2,
        "total_s": t3 - t0,
        "resultado": resultado,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--processos", type=int, default=1, help="1 = sequencial (padrão)")
    parser.add_argument("--limite", type=int, default=LIMITE)
    args = parser.parse_args()
    r = executar(args.processos, args.limite)
    print(f"{r['compradores']} compradores × {r['produtos']} produtos, {r['processos']} processo(s), dados do {r['fonte']}")
    print(f"leitura {r['leitura_s']:.3f} s · cálculo {r['calculo_s']:.3f} s · "
          f"gravação {r['gravacao_s']:.3f} s · total {r['total_s']:.3f} s → {SAIDA}")


if __name__ == "__main__":
    main()
