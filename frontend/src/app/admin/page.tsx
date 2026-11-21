"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useArtesoes, useArtesoesPendentes } from "@/hooks/useArtesoes";
import { usePedidos } from "@/hooks/usePedidos";
import { useClassificacoes, useIndicadoresAdmin } from "@/hooks/useAdmin";
import Sidebar from "@/components/layout/Sidebar";
import OrderStatus from "@/components/pedido/OrderStatus";
import LoadingState from "@/components/feedback/LoadingState";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import { formatCurrency } from "@/utils/formatCurrency";
import { formatDateShort } from "@/utils/formatDate";
import { ROTAS } from "@/constants/rotas";

type Secao = "overview" | "artesoes" | "pedidos" | "classificacao";

const itensMenu = [
  { id: "overview", label: "Dashboard", icone: "▦" },
  { id: "artesoes", label: "Artesãos", icone: "👥" },
  { id: "pedidos", label: "Pedidos", icone: "📊" },
  { id: "classificacao", label: "Classificação (IA)", icone: "🏷" },
] as const;

function MetricCard({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="metric-card">
      <p className="text-xs uppercase tracking-[.08em] text-[#888]">{label}</p>
      <p className="font-display mt-2 text-2xl text-charcoal">{valor}</p>
    </div>
  );
}

export default function AdminPage() {
  const { usuario, estaAutenticado } = useAuth();
  const [secao, setSecao] = useState<Secao>("overview");

  const { artesoes, carregando: carregandoArtesoes, erro: erroArtesoes } = useArtesoes();
  const { pendentes, carregando: carregandoPendentes, aprovar, rejeitar } = useArtesoesPendentes();
  const { pedidos, carregando: carregandoPedidos, erro: erroPedidos } = usePedidos({ tipo: "todos" });
  const ehAdmin = usuario?.perfil === "administrador";
  // Totais da plataforma vêm da view vw_indicadores_admin (GET /admin/indicadores).
  const { indicadores, recarregar: recarregarIndicadores } = useIndicadoresAdmin(ehAdmin);
  const classificacao = useClassificacoes(ehAdmin && secao === "classificacao");

  const ticketMedio = useMemo(() => {
    const validos = pedidos.filter((pedido) => pedido.status !== "cancelado").length;
    return indicadores && validos ? indicadores.totalVendas / validos : 0;
  }, [pedidos, indicadores]);

  async function aprovarERecarregar(id: number) {
    await aprovar(id);
    recarregarIndicadores();
  }

  async function rejeitarERecarregar(id: number) {
    await rejeitar(id);
    recarregarIndicadores();
  }

  if (!estaAutenticado || !usuario || usuario.perfil !== "administrador") {
    return (
      <main className="mx-auto max-w-[600px] px-6 py-20">
        <EmptyState titulo="Área exclusiva da administração" mensagem="Entre com uma conta de administrador para acessar o painel." acaoHref={ROTAS.login} acaoLabel="Entrar" />
        {secao === "classificacao" && (
          <section>
            <h1 className="font-display mb-2 text-3xl">Classificação automática</h1>
            <p className="mb-6 max-w-[720px] text-sm text-[#888]">
              O módulo de IA lê o nome e a descrição de cada peça e sugere uma categoria. As que não batem com a categoria cadastrada, ou com confiança baixa, aparecem primeiro para revisão.
            </p>
            {classificacao.carregando && <LoadingState variante="lista" itens={4} />}
            {!classificacao.carregando && classificacao.erro && <ErrorState mensagem={classificacao.erro} onTentarNovamente={classificacao.recarregar} />}
            {!classificacao.carregando && !classificacao.erro && classificacao.indisponivel && (
              <ErrorState titulo="Classificação indisponível" mensagem="O módulo de IA não respondeu. Tente de novo em alguns instantes." onTentarNovamente={classificacao.recarregar} />
            )}
            {!classificacao.carregando && !classificacao.erro && !classificacao.indisponivel && classificacao.itens.length === 0 && <EmptyState titulo="Nenhum produto na vitrine" />}
            {!classificacao.carregando && classificacao.itens.length > 0 && (
              <div className="overflow-x-auto bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="table-row">
                      <th>Produto</th>
                      <th>Categoria cadastrada</th>
                      <th>Sugerida pela IA</th>
                      <th>Confiança</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classificacao.itens.map((item) => (
                      <tr key={item.produtoId} className="table-row">
                        <td>
                          <Link href={ROTAS.produto(item.produtoId)} className="hover:text-terracotta">
                            {item.nome}
                            <span className="block text-xs text-[#888]">{item.artesao}</span>
                          </Link>
                        </td>
                        <td>{item.categoriaAtual}</td>
                        <td>
                          {item.classe}
                          {item.palavras.length > 0 && <span className="block text-xs text-[#888]">{item.palavras.slice(0, 3).join(", ")}</span>}
                        </td>
                        <td>{Math.round(item.confianca * 100)}%</td>
                        <td>
                          {item.status === "revisao" ? (
                            <span className="rounded-sm bg-[#FEF3C7] px-2 py-1 text-xs font-bold text-[#92400E]">Revisar</span>
                          ) : (
                            <span className="rounded-sm bg-[#D8F3DC] px-2 py-1 text-xs font-bold text-green">Confere</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-beige">
      <Sidebar
        titulo="Painel Administrativo"
        subtitulo={usuario.nome}
        itens={itensMenu.map((item) => ({ ...item, ativo: secao === item.id, onClick: () => setSecao(item.id) }))}
        corFundo="#2C2C2C"
      />
      <main className="flex-1 p-6 md:p-10">
        <nav className="show-mobile mb-8 flex flex-wrap gap-2">
          {itensMenu.map((item) => (
            <button key={item.id} type="button" onClick={() => setSecao(item.id)} className={`filter-pill ${secao === item.id ? "active" : ""}`}>
              {item.label}
            </button>
          ))}
        </nav>

        {secao === "overview" && (
          <section>
            <h1 className="font-display mb-6 text-3xl">Dashboard</h1>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <MetricCard label="Artesãos na Vitrine" valor={String(artesoes.length)} />
              <MetricCard label="Usuários Cadastrados" valor={indicadores ? String(indicadores.totalUsuarios) : "—"} />
              <MetricCard label="Produtos Publicados" valor={indicadores ? String(indicadores.produtosAtivos) : "—"} />
              <MetricCard label="Total de Pedidos" valor={indicadores ? String(indicadores.totalPedidos) : "—"} />
              <MetricCard label="Receita da Plataforma" valor={indicadores ? formatCurrency(indicadores.totalVendas) : "—"} />
              <MetricCard label="Aprovações Pendentes" valor={String(pendentes.length)} />
              <MetricCard label="Ticket Médio" valor={formatCurrency(ticketMedio)} />
            </div>

            <div className="mt-10 bg-white">
              <div className="flex items-center justify-between border-b border-beige-dark px-6 py-5">
                <h2 className="font-display text-lg">Aprovações pendentes</h2>
                {pendentes.length > 0 && (
                  <span className="rounded-full bg-[#fee2e2] px-3 py-1 text-xs font-bold text-[#dc2626]">{pendentes.length} pendente{pendentes.length > 1 ? "s" : ""}</span>
                )}
              </div>
              {carregandoPendentes && <LoadingState variante="lista" itens={2} />}
              {!carregandoPendentes && pendentes.length === 0 && (
                <p className="px-6 py-8 text-sm text-[#888]">Nenhum cadastro de artesão aguardando revisão.</p>
              )}
              {!carregandoPendentes &&
                pendentes.map((pendente) => (
                  <div key={pendente.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-[#F0EAE2] px-6 py-4 last:border-none">
                    <div className="flex items-center gap-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-beige text-xl">🧑‍🎨</span>
                      <div>
                        <p className="text-[.9375rem] font-semibold text-charcoal">{pendente.nome}</p>
                        <p className="text-[.8125rem] text-[#888]">Cadastro recebido — aguardando dados completos do ateliê</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => aprovarERecarregar(pendente.id)} className="rounded-sm bg-green px-3.5 py-1.5 text-xs font-bold text-white">
                        Aprovar
                      </button>
                      <button type="button" onClick={() => rejeitarERecarregar(pendente.id)} className="rounded-sm border border-[#fee2e2] bg-[#FFF5F5] px-3.5 py-1.5 text-xs font-bold text-[#dc2626]">
                        Rejeitar
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {secao === "artesoes" && (
          <section>
            <h1 className="font-display mb-6 text-3xl">Artesãos cadastrados</h1>
            {carregandoArtesoes && <LoadingState variante="lista" itens={4} />}
            {!carregandoArtesoes && erroArtesoes && <ErrorState mensagem={erroArtesoes} />}
            {!carregandoArtesoes && !erroArtesoes && artesoes.length === 0 && <EmptyState titulo="Nenhum artesão cadastrado" />}
            {!carregandoArtesoes && artesoes.length > 0 && (
              <div className="overflow-x-auto bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="table-row">
                      <th>Artesão</th>
                      <th>Região</th>
                      <th>Técnicas</th>
                      <th>Peças</th>
                      <th>Avaliação</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artesoes.map((artesao) => (
                      <tr key={artesao.id} className="table-row">
                        <td>
                          <Link href={ROTAS.artesao(artesao.id)} className="flex items-center gap-3 hover:text-terracotta">
                            <img src={artesao.fotoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                            <span>
                              {artesao.nome}
                              <span className="block text-xs text-[#888]">{artesao.cidade}</span>
                            </span>
                          </Link>
                        </td>
                        <td>{artesao.regiao}</td>
                        <td>{artesao.tecnicas[0]}</td>
                        <td>{artesao.totalProdutos}</td>
                        <td>★ {artesao.avaliacaoMedia}</td>
                        <td>
                          <span className="rounded-sm bg-[#D8F3DC] px-2 py-1 text-xs font-bold text-green">Ativo</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {secao === "pedidos" && (
          <section>
            <h1 className="font-display mb-6 text-3xl">Pedidos da plataforma</h1>
            {carregandoPedidos && <LoadingState variante="lista" itens={4} />}
            {!carregandoPedidos && erroPedidos && <ErrorState mensagem={erroPedidos} />}
            {!carregandoPedidos && !erroPedidos && pedidos.length === 0 && <EmptyState titulo="Nenhum pedido registrado ainda" />}
            {!carregandoPedidos && pedidos.length > 0 && (
              <div className="overflow-x-auto bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="table-row">
                      <th>Pedido</th>
                      <th>Cliente</th>
                      <th>Data</th>
                      <th>Status</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.map((pedido) => (
                      <tr key={pedido.codigo} className="table-row">
                        <td>{pedido.codigo}</td>
                        <td>{pedido.clienteEmail}</td>
                        <td>{formatDateShort(pedido.data)}</td>
                        <td>
                          <OrderStatus status={pedido.status} />
                        </td>
                        <td>{formatCurrency(pedido.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
