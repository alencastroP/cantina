-- ---------------------------------------------------------------------------
-- Views de leitura (§4.11 do PLAN.md)
--
-- D6 deixou delivery e encomenda como agregados separados na ESCRITA.
-- `v_orders_unified` é a contrapartida: um único caminho de cálculo na
-- LEITURA, para não existirem duas fórmulas de faturamento no sistema.
--
-- A view herda o RLS das tabelas de base (security_invoker), então ela é
-- tão isolada por tenant quanto `delivery_orders` e `preorders`.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS v_orders_unified;

CREATE VIEW v_orders_unified
WITH (security_invoker = true) AS
  SELECT
    o.id,
    o.tenant_id,
    'delivery'::text                AS kind,
    o.code,
    o.customer_id,
    o.customer_name_snapshot,
    o.status::text                  AS status,
    o.origin::text                  AS origin,
    o.fulfillment::text             AS fulfillment,
    o.sales_channel_id,
    o.payment_method::text          AS payment_method,
    o.payment_status::text          AS payment_status,
    o.subtotal_cents,
    o.discount_cents,
    o.delivery_fee_cents,
    o.total_cents,
    o.cost_cents,
    o.placed_at,
    o.completed_at,
    o.canceled_at,
    NULL::date                      AS due_date
  FROM delivery_orders o

  UNION ALL

  SELECT
    p.id,
    p.tenant_id,
    'preorder'::text                AS kind,
    p.code,
    p.customer_id,
    p.customer_name_snapshot,
    p.status::text                  AS status,
    p.origin::text                  AS origin,
    p.fulfillment::text             AS fulfillment,
    p.sales_channel_id,
    p.payment_method::text          AS payment_method,
    p.payment_status::text          AS payment_status,
    p.subtotal_cents,
    p.discount_cents,
    p.delivery_fee_cents,
    p.total_cents,
    p.cost_cents,
    p.placed_at,
    p.completed_at,
    p.canceled_at,
    p.due_date
  FROM preorders p;

GRANT SELECT ON v_orders_unified TO cantina_app, cantina_platform;

-- ---------------------------------------------------------------------------
-- Saldo de estoque com disponível já calculado.
-- `qty_available = físico − reservado` é a única definição de "disponível"
-- no sistema; deixá-la em SQL evita que cada consulta invente a sua.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS v_stock_balances;

CREATE VIEW v_stock_balances
WITH (security_invoker = true) AS
  SELECT
    s.id,
    s.tenant_id,
    s.kind,
    s.ref_id,
    s.qty_on_hand,
    s.qty_reserved,
    (s.qty_on_hand - s.qty_reserved) AS qty_available,
    s.updated_at
  FROM stock_items s;

GRANT SELECT ON v_stock_balances TO cantina_app, cantina_platform;
