-- ============================================================================
-- Dados de carga do FCCPD U2: volume para o benchmark do lote de recomendações.
--
-- Roda SÓ no banco de benchmark (fccpd-u2/docker-compose.yml), DEPOIS do
-- schema e do seed normais. Nunca no banco de desenvolvimento: os produtos
-- apareceriam na vitrine. Tudo é marcado: e-mails @carga.origem.invalid e
-- nomes de produto começando com "[carga]".
--
-- Reprodutível: setseed fixa a sequência do random(), então quem rodar de
-- novo gera exatamente os mesmos dados.
-- ============================================================================
\set produtos    4000
\set compradores 5000
\set artesaos    50

SELECT setseed(0.24);

-- Artesãos de carga (ids 100001...), todos aprovados.
INSERT INTO usuario (id, nome, email, senha_hash, perfil)
SELECT 100000 + g, 'Artesão de carga ' || g, 'artesao' || g || '@carga.origem.invalid', 'sem-login', 'artesao'
  FROM generate_series(1, :artesaos) g;
INSERT INTO artesao (usuario_id, nome_atelie, regiao_id, aprovado)
SELECT 100000 + g, 'Ateliê de carga ' || g, 1 + g % 4, TRUE
  FROM generate_series(1, :artesaos) g;

-- Compradores de carga (ids 200001...).
INSERT INTO usuario (id, nome, email, senha_hash, perfil)
SELECT 200000 + g, 'Comprador de carga ' || g, 'comprador' || g || '@carga.origem.invalid', 'sem-login', 'comprador'
  FROM generate_series(1, :compradores) g;
SELECT setval('usuario_id_seq', (SELECT MAX(id) FROM usuario));

-- Produtos: categoria, técnica, região e artesão sorteados; ~10% inativos e
-- ~9% sem estoque, para a regra de elegibilidade (RF-04) ter o que filtrar.
INSERT INTO produto (artesao_id, categoria_id, tecnica_id, regiao_id, nome, descricao, preco, estoque, status)
SELECT 100001 + floor(random() * :artesaos)::int,
       1 + floor(random() * 4)::int,
       1 + floor(random() * 12)::int,
       1 + floor(random() * 4)::int,
       '[carga] Peça ' || g,
       'Produto sintético para o benchmark do FCCPD.',
       round((20 + random() * 600)::numeric, 2),
       floor(random() * 11)::int,
       (CASE WHEN random() < 0.9 THEN 'ativo' ELSE 'inativo' END)::status_produto
  FROM generate_series(1, :produtos) g;

-- Pedidos: cada comprador faz de 0 a 5 (média 2,5), com status variados, ~1/6 cancelados.
-- O "+ c.id * 0" amarra o sorteio a cada comprador (senão o Postgres sorteia uma vez só).
INSERT INTO pedido (comprador_id, status, endereco_entrega, valor_total, criado_em)
SELECT c.id,
       (ARRAY['confirmado','em_producao','enviado','entregue','entregue','cancelado'])[1 + floor(random() * 6)::int]::status_pedido,
       'Endereço de carga',
       0,
       timestamp '2026-01-01' + random() * interval '300 days'
  FROM usuario c,
       LATERAL generate_series(1, floor(random() * 6 + c.id * 0)::int) n
 WHERE c.email LIKE '%@carga.origem.invalid' AND c.perfil = 'comprador';

-- Itens: de 1 a 3 por pedido, de produtos de carga sorteados.
WITH faixa AS (SELECT MIN(id) AS primeiro, COUNT(*) AS total FROM produto WHERE nome LIKE '[carga]%')
INSERT INTO item_pedido (pedido_id, produto_id, artesao_id, quantidade, preco_unitario, subtotal)
SELECT pe.id, pr.id, pr.artesao_id, q.quantidade, pr.preco, pr.preco * q.quantidade
  FROM pedido pe
  CROSS JOIN faixa
  CROSS JOIN LATERAL generate_series(1, floor(random() * 3 + 1 + pe.id * 0)::int) i
  CROSS JOIN LATERAL (SELECT 1 + floor(random() * 2 + i * 0)::int AS quantidade,
                             faixa.primeiro + floor(random() * faixa.total + i * 0)::int AS produto_id) q
  JOIN produto pr ON pr.id = q.produto_id
 WHERE pe.endereco_entrega = 'Endereço de carga';

UPDATE pedido pe
   SET valor_total = s.total
  FROM (SELECT pedido_id, SUM(subtotal) AS total FROM item_pedido GROUP BY pedido_id) s
 WHERE s.pedido_id = pe.id AND pe.endereco_entrega = 'Endereço de carga';

ANALYZE;
