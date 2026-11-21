"""Funções de acesso aos dados do módulo de recomendação.

O módulo SÓ chega aos dados por estas funções: nem o recomendador nem o
serviço HTTP escrevem SQL. Os dados vêm do mesmo PostgreSQL do backend
(o seed fica em backend/sql/02_seed.sql), então mudar um preço, uma nota ou
um pedido no banco muda a próxima resposta, sem treinar nada de novo.

Banco fora do ar (caso difícil): se a conexão falhar, as mesmas funções leem o
retrato dados/catalogo.json, exportado do banco por exportar.py, com a mesma
resposta e o mesmo tratamento de "não encontrado". O serviço continua de pé,
só com dados da data do retrato (ULTIMA_FONTE diz de onde veio a última leitura).

Cada função trata o caso "não encontrado" do seu jeito, sempre documentado:
- buscar_produto: None se o produto não existe.
- historico_do_usuario: None se o usuário não existe; [] se existe e nunca comprou.
- listar_avaliacoes: None se o produto não existe; [] se existe e não tem avaliação.

Nada de dado pessoal sai daqui (RNF-03): o histórico é só uma lista de ids de
produto, e as avaliações não trazem quem avaliou.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://origem:origem@localhost:5434/origem")
TIMEOUT_CONEXAO_S = 1  # abaixo do teto de 2 s do RF-08: sobra tempo para usar o retrato
RETRATO = Path(__file__).resolve().parent / "dados" / "catalogo.json"
ULTIMA_FONTE = "banco"  # "banco" ou "retrato"

# Um produto no formato que o recomendador usa. `vendas` conta as unidades
# vendidas em pedidos não cancelados; `notaMedia` é 0 quando não há avaliação.
# `imagem` é a foto principal disponível (ordem 0).
_SQL_PRODUTOS = """
    SELECT p.id,
           p.nome,
           p.preco::float                            AS preco,
           img.chave_armazenamento                   AS imagem,
           c.nome                                    AS categoria,
           t.nome                                    AS tecnica,
           r.nome                                    AS regiao,
           u.nome                                    AS artesao,
           p.artesao_id                              AS "artesaoId",
           ar.aprovado                               AS "artesaoAprovado",
           p.estoque,
           p.status::text                            AS status,
           COALESCE(v.vendas, 0)::int                AS vendas,
           COALESCE(a.nota_media, 0)::float          AS "notaMedia"
      FROM produto p
      JOIN categoria c ON c.id = p.categoria_id
      JOIN tecnica   t ON t.id = p.tecnica_id
      JOIN regiao    r ON r.id = p.regiao_id
      JOIN artesao  ar ON ar.usuario_id = p.artesao_id
      JOIN usuario   u ON u.id = p.artesao_id
      LEFT JOIN LATERAL (
            SELECT i.chave_armazenamento
              FROM produto_imagem i
             WHERE i.produto_id = p.id AND i.status = 'disponivel'
             ORDER BY i.ordem, i.id
             LIMIT 1) img ON TRUE
      LEFT JOIN (
            SELECT ip.produto_id, SUM(ip.quantidade) AS vendas
              FROM item_pedido ip
              JOIN pedido pe ON pe.id = ip.pedido_id
             WHERE pe.status <> 'cancelado'
             GROUP BY ip.produto_id) v ON v.produto_id = p.id
      LEFT JOIN (
            SELECT produto_id, ROUND(AVG(nota), 2) AS nota_media
              FROM avaliacao_produto
             GROUP BY produto_id) a ON a.produto_id = p.id
"""


def _conectar() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL, connect_timeout=TIMEOUT_CONEXAO_S, row_factory=dict_row)


def _ler(do_banco, do_retrato):
    """Tenta o banco; se ele estiver fora do ar, responde pelo retrato JSON."""
    global ULTIMA_FONTE
    try:
        resultado = do_banco()
        ULTIMA_FONTE = "banco"
        return resultado
    except psycopg.OperationalError:
        retrato = json.loads(RETRATO.read_text(encoding="utf-8"))
        ULTIMA_FONTE = "retrato"
        return do_retrato(retrato)


def listar_produtos() -> list[dict]:
    """Todos os produtos do catálogo, inclusive inativos e sem estoque.

    Quem decide o que pode ser recomendado é o recomendador (RF-04), não esta
    função: ela só entrega os dados. Lista vazia se o catálogo estiver vazio.
    """
    def do_banco():
        with _conectar() as conexao:
            return conexao.execute(_SQL_PRODUTOS + " ORDER BY p.id").fetchall()

    return _ler(do_banco, lambda retrato: retrato["produtos"])


def buscar_produto(produto_id: int) -> dict | None:
    """Um produto pelo id, no mesmo formato de listar_produtos. None se não existir."""
    def do_banco():
        with _conectar() as conexao:
            return conexao.execute(_SQL_PRODUTOS + " WHERE p.id = %s", (produto_id,)).fetchone()

    def do_retrato(retrato):
        return next((p for p in retrato["produtos"] if p["id"] == produto_id), None)

    return _ler(do_banco, do_retrato)


def historico_do_usuario(usuario_id: int) -> list[int] | None:
    """Ids dos produtos que o usuário comprou, sem repetir, na ordem da primeira compra.

    Pedidos cancelados não contam. None se o usuário não existir; [] se ele
    existe e nunca comprou (o caso "usuário sem histórico").
    """
    def do_banco():
        with _conectar() as conexao:
            existe = conexao.execute("SELECT 1 FROM usuario WHERE id = %s", (usuario_id,)).fetchone()
            if existe is None:
                return None
            linhas = conexao.execute(
                """
                SELECT ip.produto_id
                  FROM pedido pe
                  JOIN item_pedido ip ON ip.pedido_id = pe.id
                 WHERE pe.comprador_id = %s AND pe.status <> 'cancelado'
                 GROUP BY ip.produto_id
                 ORDER BY MIN(pe.criado_em), ip.produto_id
                """,
                (usuario_id,),
            ).fetchall()
            return [linha["produto_id"] for linha in linhas]

    def do_retrato(retrato):
        if usuario_id not in retrato["usuarios"]:
            return None
        return retrato["historico"].get(str(usuario_id), [])

    return _ler(do_banco, do_retrato)


def listar_compradores() -> list[int]:
    """Ids de todos os usuários com perfil comprador, em ordem. Lista vazia se não houver.

    Usada para recalcular as recomendações de todos de uma vez (lote do FCCPD)
    e para exportar o retrato. Só ids: nada de nome ou e-mail.
    """
    def do_banco():
        with _conectar() as conexao:
            linhas = conexao.execute("SELECT id FROM usuario WHERE perfil = 'comprador' ORDER BY id").fetchall()
            return [linha["id"] for linha in linhas]

    return _ler(do_banco, lambda retrato: retrato["compradores"])


def _ids_de_usuarios() -> list[int]:
    """Uso interno do exportar.py: ids de todos os usuários, para o retrato saber quem existe."""
    with _conectar() as conexao:
        return [linha["id"] for linha in conexao.execute("SELECT id FROM usuario ORDER BY id").fetchall()]


def listar_avaliacoes(produto_id: int) -> list[dict] | None:
    """Avaliações de um produto, da mais nova para a mais antiga, sem identificar quem avaliou.

    None se o produto não existir; [] se existe e ainda não foi avaliado.
    """
    def do_banco():
        with _conectar() as conexao:
            existe = conexao.execute("SELECT 1 FROM produto WHERE id = %s", (produto_id,)).fetchone()
            if existe is None:
                return None
            return conexao.execute(
                """
                SELECT id, produto_id AS "produtoId", nota, comentario,
                       to_char(criado_em, 'YYYY-MM-DD"T"HH24:MI:SS') AS "criadoEm"
                  FROM avaliacao_produto
                 WHERE produto_id = %s
                 ORDER BY criado_em DESC, id DESC
                """,
                (produto_id,),
            ).fetchall()

    def do_retrato(retrato):
        if not any(p["id"] == produto_id for p in retrato["produtos"]):
            return None
        return retrato["avaliacoes"].get(str(produto_id), [])

    return _ler(do_banco, do_retrato)
