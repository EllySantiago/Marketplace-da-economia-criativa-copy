/** Card de indicador dos painéis (artesão e admin): rótulo pequeno em cima, valor grande embaixo. */
export default function MetricCard({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="metric-card">
      <p className="text-xs uppercase tracking-[.08em] text-[#888]">{label}</p>
      <p className="font-display mt-2 text-2xl text-charcoal">{valor}</p>
    </div>
  );
}
