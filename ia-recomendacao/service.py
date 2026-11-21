"""Serviço BentoML do módulo de recomendação do Origem (contrato da AV1).

As rotas REST da AV1 (GET com id no caminho, erros 400/401/403/404/503 com `{ "erro": ... }`)
ficam numa app FastAPI montada dentro do serviço BentoML em /api.

Desde a U2 os dados vêm do PostgreSQL do backend, a cada chamada, pelas funções
de dados.py: não há mais treino offline nem catálogo fixo. Mudou o banco, muda
a resposta seguinte.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

import bentoml
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import dados
import recomendador

VERSAO_REGRAS = "regras-origem-u2"  # campo "modelo" da resposta (contrato da AV1)
TIMEOUT_S = 2.0  # RF-08 / RNF-02
LIMITE_PADRAO_PRODUTO = 4  # RF-05
LIMITE_PADRAO_USUARIO = 8
LIMITE_MIN, LIMITE_MAX = 1, 20

LOG = Path(os.environ.get("RECOMENDACAO_LOG", Path(__file__).resolve().parent / "logs" / "recomendacao_log.jsonl"))
ORIGENS = os.environ.get("RECOMENDACAO_CORS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app = FastAPI(title="Origem — módulo de recomendação")
app.add_middleware(CORSMiddleware, allow_origins=ORIGENS, allow_methods=["GET"], allow_headers=["*"])


class ErroHttp(Exception):
    def __init__(self, status: int, mensagem: str) -> None:
        self.status = status
        self.mensagem = mensagem


@app.exception_handler(ErroHttp)
async def _erro_http(_: Request, erro: ErroHttp) -> JSONResponse:
    return JSONResponse({"erro": erro.mensagem}, status_code=erro.status)


@app.exception_handler(Exception)
async def _erro_inesperado(_: Request, __: Exception) -> JSONResponse:
    # RF-08: nenhuma stack trace sai para o cliente.
    return JSONResponse({"erro": "Recomendações indisponíveis no momento"}, status_code=503)


def _limite(valor: str | None, padrao: int) -> int:
    """RF-05: inteiro entre 1 e 20; fora disso é 400, sem corrigir em silêncio."""
    if valor is None:
        return padrao
    try:
        limite = int(valor)
    except ValueError:
        raise ErroHttp(400, f"limite deve ser um inteiro entre {LIMITE_MIN} e {LIMITE_MAX}") from None
    if not LIMITE_MIN <= limite <= LIMITE_MAX:
        raise ErroHttp(400, f"limite deve ser um inteiro entre {LIMITE_MIN} e {LIMITE_MAX}")
    return limite


def _usuario_autenticado(request: Request) -> int | None:
    """Autenticação simulada: o id do usuário logado chega no header X-Usuario-Id."""
    valor = request.headers.get("x-usuario-id")
    try:
        return int(valor) if valor else None
    except ValueError:
        return None


async def _executar(request: Request, funcao, *args) -> list[dict]:
    """RF-08: roda a estratégia com timeout de 2 s; erro ou lentidão viram 503."""
    simular = request.headers.get("x-simular-falha", "")  # só para o caso de teste do RF-08

    def tarefa() -> list[dict]:
        if simular == "lentidao":
            time.sleep(TIMEOUT_S + 1)
        if simular == "erro":
            raise RuntimeError("falha simulada")
        return funcao(*args)

    try:
        return await asyncio.wait_for(asyncio.to_thread(tarefa), TIMEOUT_S)
    except Exception:
        raise ErroHttp(503, "Recomendações indisponíveis no momento") from None


def _registrar(itens: list[dict], usuario_id: int | None, referencia: dict) -> None:
    """RF-03 / RNF-04: uma linha por produto recomendado. Best-effort: nunca derruba a resposta."""
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as arquivo:
            for item in itens:
                linha = {
                    "usuario_id": usuario_id,
                    "produto_id": item["id"],
                    "criterio": item["criterio"],
                    "score": item["score"],
                    "criado_em": agora,
                    **referencia,
                }
                arquivo.write(json.dumps(linha, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _recomendar_por_produto(produto_id: int, limite: int) -> list[dict] | None:
    """Busca os dados pelas funções de acesso e aplica as regras. None = produto inexistente."""
    if dados.buscar_produto(produto_id) is None:
        return None
    artefato = recomendador.montar_artefato(dados.listar_produtos())
    return recomendador.por_produto(artefato, produto_id, limite)


def _recomendar_por_usuario(usuario_id: int, limite: int) -> list[dict]:
    """Usuário inexistente ou sem compras recebe a mesma coisa: popularidade (RF-07)."""
    historico = dados.historico_do_usuario(usuario_id) or []
    artefato = recomendador.montar_artefato(dados.listar_produtos())
    return recomendador.por_usuario(artefato, historico, limite)


@bentoml.service(resources={"cpu": "1"})
@bentoml.asgi_app(app, path="/api")
class RecomendadorOrigem:

    @app.get("/produtos/{produto_id}/recomendados")
    async def recomendados_por_produto(self, produto_id: str, request: Request, limite: str | None = None):
        """RF-01, RF-02, RF-03, RF-04, RF-05, RF-07, RF-08."""
        if not produto_id.isdigit():
            raise ErroHttp(404, f"Produto {produto_id} não encontrado")
        qtd = _limite(limite, LIMITE_PADRAO_PRODUTO)
        pid = int(produto_id)
        itens = await _executar(request, _recomendar_por_produto, pid, qtd)
        if itens is None:
            raise ErroHttp(404, f"Produto {produto_id} não encontrado")
        _registrar(itens, _usuario_autenticado(request), {"produto_referencia_id": pid})
        return {"produtoReferenciaId": pid, "recomendacoes": itens, "modelo": VERSAO_REGRAS}

    @app.get("/usuarios/{usuario_id}/recomendados")
    async def recomendados_por_usuario(self, usuario_id: str, request: Request, limite: str | None = None):
        """RF-06; usuário sem histórico (inclusive recém-cadastrado) recebe popularidade (RF-07)."""
        autenticado = _usuario_autenticado(request)
        if autenticado is None:
            raise ErroHttp(401, "Autenticação necessária")
        if usuario_id != str(autenticado):
            raise ErroHttp(403, "Só é possível consultar as próprias recomendações")
        qtd = _limite(limite, LIMITE_PADRAO_USUARIO)
        itens = await _executar(request, _recomendar_por_usuario, autenticado, qtd)
        _registrar(itens, autenticado, {"produto_referencia_id": None})
        return {"usuarioId": autenticado, "recomendacoes": itens, "modelo": VERSAO_REGRAS}

    @app.get("/recomendacoes/metricas")
    async def metricas(self, de: str | None = None, ate: str | None = None):
        """RNF-07: quantidade de recomendações por critério num período (datas AAAA-MM-DD)."""
        try:
            inicio = date.fromisoformat(de) if de else date.min
            fim = date.fromisoformat(ate) if ate else date.max
        except ValueError:
            raise ErroHttp(400, "de/ate devem estar no formato AAAA-MM-DD") from None
        contagem: Counter[str] = Counter()
        if LOG.exists():
            for linha in LOG.read_text(encoding="utf-8").splitlines():
                registro = json.loads(linha)
                if inicio <= date.fromisoformat(registro["criado_em"][:10]) <= fim:
                    contagem[registro["criterio"]] += 1
        return {"de": de, "ate": ate, "total": sum(contagem.values()), "porCriterio": dict(contagem)}
