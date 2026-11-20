# Resultado do benchmark (20/11/2026 13:42)

- **Volume:** 5007 compradores × 4013 produtos (`fccpd-u2/carga.sql` + seed)
- **Máquina:** 13th Gen Intel(R) Core(TM) i5-13450HX, 16 núcleos lógicos · Linux-7.3.4-ogc8.1.fc45.x86_64-x86_64-with-glibc2.44 · Python 3.13.16 · PostgreSQL 16.15
- **Repetições:** 5 por configuração, intercaladas, após 1 aquecimento descartado; mediana
- **Leitura (2 consultas, sequencial), mediana:** 0.074 s

| Processos | Cálculo, mediana (s) | Faixa das 5 (s) | Speedup do cálculo | Eficiência | Total, mediana (s) | Speedup do total |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 11.979 | 11.902–14.396 | 1.00× | 100% | 12.051 | 1.00× |
| 2 | 6.188 | 6.043–7.354 | 1.94× | 97% | 6.260 | 1.93× |
| 4 | 3.563 | 3.439–4.392 | 3.36× | 84% | 3.637 | 3.31× |
| 8 | 2.601 | 2.510–3.522 | 4.61× | 58% | 2.676 | 4.50× |
| 16 | 2.558 | 2.485–2.760 | 4.68× | 29% | 2.636 | 4.57× |

Speedup = mediana sequencial ÷ mediana com N processos. Eficiência = speedup ÷ N.
Todas as rodadas paralelas deram exatamente o mesmo resultado que a sequencial.
