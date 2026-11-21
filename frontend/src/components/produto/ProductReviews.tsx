"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useAvaliacoes, useCriarAvaliacao, useSentimento } from "@/hooks/useAvaliacoes";
import type { RotuloSentimento } from "@/services/api/analises.service";
import { useAuth } from "@/hooks/useAuth";
import { Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import LoadingState from "@/components/feedback/LoadingState";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import { formatDate } from "@/utils/formatDate";

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="text-terracotta" aria-label={`${nota} de 5 estrelas`}>
      {"★".repeat(nota)}
      <span className="text-beige-dark">{"★".repeat(5 - nota)}</span>
    </span>
  );
}

const ESTILO_SENTIMENTO: Record<RotuloSentimento, { rotulo: string; classe: string }> = {
  positivo: { rotulo: "Positiva", classe: "bg-[#D8F3DC] text-[#2D6A4F]" },
  neutro: { rotulo: "Neutra", classe: "bg-beige text-[#555]" },
  negativo: { rotulo: "Negativa", classe: "bg-[#fee2e2] text-[#dc2626]" },
};

function SeloSentimento({ rotulo }: { rotulo: RotuloSentimento }) {
  const estilo = ESTILO_SENTIMENTO[rotulo];
  return <span className={`rounded-sm px-2 py-0.5 text-[.7rem] font-bold uppercase tracking-[.06em] ${estilo.classe}`}>{estilo.rotulo}</span>;
}

export default function ProductReviews({ produtoId }: { produtoId: number }) {
  const { avaliacoes, carregando, erro, recarregar } = useAvaliacoes(produtoId);
  const { criar, enviando, erro: erroEnvio } = useCriarAvaliacao();
  const { usuario } = useAuth();
  const [nota, setNota] = useState(5);
  const [comentario, setComentario] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [versao, setVersao] = useState(0);
  // Análise de sentimento do módulo de IA, pela API. Sem IA, não aparece nada.
  const sentimento = useSentimento(produtoId, versao);
  const sentimentoPorAvaliacao = useMemo(() => new Map(sentimento?.avaliacoes.map((item) => [item.id, item.sentimento]) ?? []), [sentimento]);

  const media = useMemo(() => (avaliacoes.length ? avaliacoes.reduce((soma, item) => soma + item.nota, 0) / avaliacoes.length : 0), [avaliacoes]);

  async function handleSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!usuario) return;
    const nova = await criar({ produtoId, nota, comentario });
    if (nova) {
      setComentario("");
      setNota(5);
      setEnviado(true);
      recarregar();
      setVersao((atual) => atual + 1);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-16">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="section-label mb-2">Avaliações de compradores</p>
          <h2 className="font-display text-2xl">
            {avaliacoes.length > 0 ? (
              <>
                <Estrelas nota={Math.round(media)} /> <span className="text-lg text-[#888]">{media.toFixed(1)} de 5 · {avaliacoes.length} avaliação{avaliacoes.length > 1 ? "ões" : ""}</span>
              </>
            ) : (
              "Ainda sem avaliações"
            )}
          </h2>
          {sentimento?.resumo && sentimento.resumo.total > 0 && sentimento.resumo.rotuloGeral && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#555]" data-testid="sentimento-resumo">
              <span className="font-semibold">Sentimento dos comentários:</span>
              <SeloSentimento rotulo={sentimento.resumo.rotuloGeral} />
              <span className="text-[#888]">
                {sentimento.resumo.porRotulo.positivo} positiva(s) · {sentimento.resumo.porRotulo.neutro} neutra(s) · {sentimento.resumo.porRotulo.negativo} negativa(s), pela análise automática do Origem
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          {carregando && <LoadingState variante="lista" itens={3} />}
          {!carregando && erro && <ErrorState mensagem={erro} onTentarNovamente={recarregar} />}
          {!carregando && !erro && avaliacoes.length === 0 && <EmptyState titulo="Nenhuma avaliação ainda" mensagem="Seja a primeira pessoa a avaliar esta peça." />}
          {!carregando && avaliacoes.length > 0 && (
            <ul className="space-y-5">
              {avaliacoes.map((avaliacao) => (
                <li key={avaliacao.id} className="border-b border-beige-dark pb-5">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                      {avaliacao.usuarioNome}
                      {sentimentoPorAvaliacao.get(avaliacao.id) && <SeloSentimento rotulo={sentimentoPorAvaliacao.get(avaliacao.id)!} />}
                    </p>
                    <span className="text-xs text-[#888]">{formatDate(avaliacao.criadoEm)}</span>
                  </div>
                  <Estrelas nota={avaliacao.nota} />
                  <p className="mt-2 text-sm leading-6 text-[#555]">{avaliacao.comentario}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="h-fit border border-beige-dark bg-white p-6">
          <h3 className="font-display text-lg">Deixe sua avaliação</h3>
          {!usuario ? (
            <p className="mt-3 text-sm text-[#888]">Entre na sua conta para avaliar esta peça.</p>
          ) : usuario.perfil !== "comprador" ? (
            <p className="mt-3 text-sm text-[#888]">Só compradores avaliam peças.</p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-[#888]">Sua nota</p>
                <div className="flex gap-1 text-xl">
                  {[1, 2, 3, 4, 5].map((valor) => (
                    <button key={valor} type="button" onClick={() => setNota(valor)} aria-label={`${valor} estrela${valor > 1 ? "s" : ""}`} className={valor <= nota ? "text-terracotta" : "text-beige-dark"}>
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <Textarea label="Comentário" required rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Conte como foi sua experiência com a peça" />
              {erroEnvio && <ErrorState titulo="Não foi possível enviar" mensagem={erroEnvio} />}
              {enviado && <p className="text-sm font-semibold text-[#2D6A4F]">Avaliação enviada, obrigado!</p>}
              <Button type="submit" disabled={enviando} className="w-full justify-center">
                {enviando ? "Enviando..." : "Enviar avaliação"}
              </Button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
