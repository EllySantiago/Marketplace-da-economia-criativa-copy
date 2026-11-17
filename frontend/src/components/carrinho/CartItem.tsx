import Link from "next/link";
import type { ItemCarrinho } from "@/types/carrinho";
import Badge from "@/components/ui/Badge";
import { formatCurrency } from "@/utils/formatCurrency";
import { ROTAS } from "@/constants/rotas";

interface CartItemProps {
  item: ItemCarrinho;
  onRemover: (produtoId: number) => void;
  onAlterarQuantidade: (produtoId: number, quantidade: number) => void;
}

export default function CartItem({ item, onRemover, onAlterarQuantidade }: CartItemProps) {
  const { produto, quantidade } = item;
  return (
    <article className="flex gap-5 border border-beige-dark bg-white p-5">
      <Link href={ROTAS.produto(produto.id)} className="shrink-0">
        <img src={produto.imagem} alt={produto.nome} className="h-28 w-28 object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Badge>{produto.tecnica}</Badge>
        <Link href={ROTAS.produto(produto.id)} className="font-display mt-2 block text-xl text-charcoal">
          {produto.nome}
        </Link>
        <p className="mt-1 text-sm text-[#888]">{produto.artesao}</p>
        <p className="mt-3 font-semibold text-terracotta">{formatCurrency(produto.preco)}</p>
      </div>
      <div className="flex flex-col items-end justify-between">
        <button type="button" onClick={() => onRemover(produto.id)} className="text-sm text-[#888] hover:text-terracotta">
          Remover
        </button>
        <div className="flex items-center border border-beige-dark">
          <button type="button" aria-label="Diminuir quantidade" onClick={() => onAlterarQuantidade(produto.id, quantidade - 1)} className="h-8 w-8 bg-beige">
            -
          </button>
          <span className="w-8 text-center text-sm">{quantidade}</span>
          <button
            type="button"
            aria-label="Aumentar quantidade"
            onClick={() => onAlterarQuantidade(produto.id, Math.min(produto.estoque, quantidade + 1))}
            className="h-8 w-8 bg-beige"
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}
