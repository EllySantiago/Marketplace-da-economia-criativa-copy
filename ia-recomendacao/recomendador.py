"""Estratégias de recomendação do Origem — funções puras, sem HTTP.

O service.py cuida do contrato HTTP (rotas, status, log) e busca os dados pelas
funções de dados.py; aqui fica só a regra: quem é elegível, como cada candidato
pontua e como a lista é completada. Nenhuma função daqui lê banco ou arquivo.
"""

from __future__ import annotations

PESO_ARTESAO = 3  # RF-01
PESO_TECNICA = 2
PESO_REGIAO = 1

PESO_HISTORICO_TECNICA = 2  # RF-06
PESO_HISTORICO_CATEGORIA = 1

MAX_POR_ARTESAO = 2  # RNF-06

CAMPOS_PRODUTO = (
    "id", "nome", "preco", "imagem", "categoria", "tecnica", "regiao", "artesao", "artesaoId",
)


def elegivel(produto: dict) -> bool:
    """RF-04: só entra produto ativo, com estoque e de artesão aprovado (o que a vitrine mostra)."""
    return produto["status"] == "ativo" and produto["estoque"] > 0 and produto.get("artesaoAprovado", True)


def montar_artefato(produtos: list[dict]) -> dict:
    """Indexa os produtos e calcula a popularidade (RF-07).

    Popularidade = 0,7 × vendas / maior venda + 0,3 × nota média / 5, em escala 0…1.
    É recalculada a cada chamada, a partir dos dados atuais: mudou uma venda ou
    uma nota no banco, muda o ranking.
    """
    por_id = {str(p["id"]): p for p in produtos}
    max_vendas = max((p["vendas"] for p in produtos), default=0) or 1
    pop = {
        pid: round(0.7 * p["vendas"] / max_vendas + 0.3 * p["notaMedia"] / 5, 4)
        for pid, p in por_id.items()
    }
    ranking = sorted(por_id, key=lambda pid: (-pop[pid], int(pid)))
    return {"produtos": por_id, "pop": pop, "ranking_popularidade": ranking}


def similaridade(referencia: dict, produto: dict) -> tuple[int, str]:
    """RF-01: soma dos pesos; o critério é o atributo de maior peso em comum."""
    score = 0
    criterios = []
    if produto["artesaoId"] == referencia["artesaoId"]:
        score += PESO_ARTESAO
        criterios.append("mesmo-artesao")
    if produto["tecnica"] == referencia["tecnica"]:
        score += PESO_TECNICA
        criterios.append("mesma-tecnica")
    if produto["regiao"] == referencia["regiao"]:
        score += PESO_REGIAO
        criterios.append("mesma-regiao")
    return score, (criterios[0] if criterios else "")


def afinidade_historico(comprados: list[dict], produto: dict) -> tuple[int, str]:
    """RF-06: pontua pelas técnicas e categorias dos itens já comprados."""
    score = 0
    criterios = []
    if produto["tecnica"] in {p["tecnica"] for p in comprados}:
        score += PESO_HISTORICO_TECNICA
        criterios.append("historico-tecnica")
    if produto["categoria"] in {p["categoria"] for p in comprados}:
        score += PESO_HISTORICO_CATEGORIA
        criterios.append("historico-categoria")
    return score, (criterios[0] if criterios else "")


def _item(produto: dict, criterio: str, score: float) -> dict:
    item = {campo: produto[campo] for campo in CAMPOS_PRODUTO}
    item["criterio"] = criterio
    item["score"] = score
    return item


def _montar(
    pontuados: list[tuple[dict, int, str]],
    artefato: dict,
    excluidos: set[int],
    limite: int,
) -> list[dict]:
    """Ordena os pontuados e completa com popularidade (RF-07), respeitando o RNF-06."""
    pop = artefato["pop"]
    lista: list[dict] = []
    por_artesao: dict[int, int] = {}

    def cabe(produto: dict) -> bool:
        return por_artesao.get(produto["artesaoId"], 0) < MAX_POR_ARTESAO

    def incluir(produto: dict, criterio: str, score: float) -> None:
        lista.append(_item(produto, criterio, score))
        por_artesao[produto["artesaoId"]] = por_artesao.get(produto["artesaoId"], 0) + 1
        excluidos.add(produto["id"])

    # Empate no score: o mais popular primeiro; depois o menor id (resultado determinístico).
    pontuados.sort(key=lambda t: (-t[1], -pop[str(t[0]["id"])], t[0]["id"]))
    for produto, score, criterio in pontuados:
        if len(lista) == limite:
            return lista
        if cabe(produto):
            incluir(produto, criterio, score)

    produtos = artefato["produtos"]
    for pid in artefato["ranking_popularidade"]:
        if len(lista) == limite:
            break
        produto = produtos[pid]
        if produto["id"] not in excluidos and elegivel(produto) and cabe(produto):
            incluir(produto, "popularidade", pop[pid])
    return lista


def por_produto(artefato: dict, produto_id: int, limite: int) -> list[dict]:
    """RF-01 + RF-04 + RF-07 + RNF-06 para a página de detalhe do produto."""
    produtos = artefato["produtos"]
    referencia = produtos[str(produto_id)]
    pontuados = []
    for produto in produtos.values():
        if produto["id"] == produto_id or not elegivel(produto):
            continue
        score, criterio = similaridade(referencia, produto)
        if score > 0:
            pontuados.append((produto, score, criterio))
    return _montar(pontuados, artefato, {produto_id}, limite)


def por_usuario(artefato: dict, ids_comprados: list[int], limite: int) -> list[dict]:
    """RF-06: histórico de compra; sem histórico, só popularidade (RF-07)."""
    produtos = artefato["produtos"]
    comprados = [produtos[str(pid)] for pid in ids_comprados if str(pid) in produtos]
    pontuados = []
    if comprados:
        for produto in produtos.values():
            if produto["id"] in ids_comprados or not elegivel(produto):
                continue
            score, criterio = afinidade_historico(comprados, produto)
            if score > 0:
                pontuados.append((produto, score, criterio))
    return _montar(pontuados, artefato, set(ids_comprados), limite)
