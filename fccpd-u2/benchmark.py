"""Benchmark do FCCPD U2: lote de recomendações, sequencial × paralelo.

Métrica: tempo de parede (time.perf_counter) da fase de CÁLCULO do lote, a
parte paralelizada. O tempo total (leitura + cálculo + gravação) também é
registrado, para mostrar o quanto do ganho chega ao usuário final.

Metodologia:
- banco de benchmark próprio (fccpd-u2/docker-compose.yml), com o volume de
  fccpd-u2/carga.sql, sempre igual;
- 1 rodada de aquecimento descartada (cache do banco e do sistema de arquivos);
- 5 repetições de cada configuração (1, 2, 4, 8 e 16 processos), INTERCALADAS:
  repetição 1 de todas, depois repetição 2 de todas... Assim uma variação de
  carga da máquina no meio do teste não prejudica só uma configuração;
- conta-se a MEDIANA das 5 (menos sensível a uma rodada fora da curva);
- cada rodada paralela é conferida contra a sequencial: resultado diferente
  aborta o benchmark (ganho de tempo com resposta errada não vale).

Uso (com o banco de benchmark no ar):
    cd fccpd-u2 && docker compose up -d
    cd ../ia-recomendacao && uv run python ../fccpd-u2/benchmark.py
Saída: fccpd-u2/resultados/benchmark.csv (todas as rodadas) e resumo.md.
"""

from __future__ import annotations

import csv
import os
import platform
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

PASTA = Path(__file__).resolve().parent
sys.path.insert(0, str(PASTA.parent / "ia-recomendacao"))
os.environ.setdefault("DATABASE_URL", "postgres://origem:origem@localhost:5435/origem")

import psycopg  # noqa: E402

import dados  # noqa: E402
import lote  # noqa: E402

PROCESSOS = [1, 2, 4, 8, 16]
REPETICOES = 5
RESULTADOS = PASTA / "resultados"


def esperar_carga(limite_s: int = 180) -> str:
    """Espera o banco de benchmark terminar a carga; devolve a versão do Postgres."""
    inicio = time.time()
    while True:
        try:
            with psycopg.connect(dados.DATABASE_URL, connect_timeout=2) as conexao:
                pronto = conexao.execute("SELECT 1 FROM produto WHERE nome LIKE '[carga]%' LIMIT 1").fetchone()
                if pronto:
                    return conexao.execute("SELECT version()").fetchone()[0]
        except psycopg.OperationalError:
            pass
        if time.time() - inicio > limite_s:
            raise SystemExit("O banco de benchmark não ficou pronto. Rode: cd fccpd-u2 && docker compose up -d")
        time.sleep(2)


def cpu() -> str:
    try:
        for linha in Path("/proc/cpuinfo").read_text().splitlines():
            if linha.startswith("model name"):
                return linha.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or platform.machine()


def main() -> None:
    versao_pg = esperar_carga()
    maquina = {
        "cpu": cpu(),
        "nucleos_logicos": os.cpu_count(),
        "sistema": platform.platform(),
        "python": platform.python_version(),
        "postgres": versao_pg.split(" on ")[0],
    }
    print("Máquina:", maquina)

    print("Aquecimento (descartado)...")
    base = lote.executar(1, gravar=False)
    if base["fonte"] != "banco":
        raise SystemExit("O lote leu o retrato, não o banco: confira a DATABASE_URL.")
    esperado = base["resultado"]
    print(f"{base['compradores']} compradores × {base['produtos']} produtos")

    linhas = []
    for repeticao in range(1, REPETICOES + 1):
        for n in PROCESSOS:
            r = lote.executar(n, gravar=False)
            if r["resultado"] != esperado:
                raise SystemExit(f"Resultado com {n} processos difere do sequencial: benchmark abortado.")
            linhas.append({
                "repeticao": repeticao, "processos": n,
                "leitura_s": round(r["leitura_s"], 4), "calculo_s": round(r["calculo_s"], 4),
                "gravacao_s": round(r["gravacao_s"], 4), "total_s": round(r["total_s"], 4),
            })
            print(f"  rep {repeticao}  {n:>2} processo(s)  cálculo {r['calculo_s']:.3f} s  total {r['total_s']:.3f} s")

    RESULTADOS.mkdir(exist_ok=True)
    with (RESULTADOS / "benchmark.csv").open("w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=list(linhas[0]))
        escritor.writeheader()
        escritor.writerows(linhas)

    def mediana(n: int, campo: str) -> float:
        return statistics.median(l[campo] for l in linhas if l["processos"] == n)

    def faixa(n: int, campo: str) -> str:
        valores = [l[campo] for l in linhas if l["processos"] == n]
        return f"{min(valores):.3f}–{max(valores):.3f}"

    seq_calc, seq_total = mediana(1, "calculo_s"), mediana(1, "total_s")
    tabela = [
        "| Processos | Cálculo, mediana (s) | Faixa das 5 (s) | Speedup do cálculo | Eficiência | Total, mediana (s) | Speedup do total |",
        "|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for n in PROCESSOS:
        calc, total = mediana(n, "calculo_s"), mediana(n, "total_s")
        tabela.append(
            f"| {n} | {calc:.3f} | {faixa(n, 'calculo_s')} | {seq_calc / calc:.2f}× | "
            f"{seq_calc / calc / n:.0%} | {total:.3f} | {seq_total / total:.2f}× |"
        )
    resumo = "\n".join([
        f"# Resultado do benchmark ({datetime.now():%d/%m/%Y %H:%M})",
        "",
        f"- **Volume:** {base['compradores']} compradores × {base['produtos']} produtos "
        f"(`fccpd-u2/carga.sql` + seed)",
        f"- **Máquina:** {maquina['cpu']}, {maquina['nucleos_logicos']} núcleos lógicos · "
        f"{maquina['sistema']} · Python {maquina['python']} · {maquina['postgres']}",
        f"- **Repetições:** {REPETICOES} por configuração, intercaladas, após 1 aquecimento descartado; mediana",
        f"- **Leitura (2 consultas, sequencial), mediana:** {mediana(1, 'leitura_s'):.3f} s",
        "",
        *tabela,
        "",
        "Speedup = mediana sequencial ÷ mediana com N processos. Eficiência = speedup ÷ N.",
        "Todas as rodadas paralelas deram exatamente o mesmo resultado que a sequencial.",
        "",
    ])
    (RESULTADOS / "resumo.md").write_text(resumo, encoding="utf-8")
    print()
    print(resumo)


if __name__ == "__main__":
    main()
