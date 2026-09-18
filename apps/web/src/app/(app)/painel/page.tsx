'use client';

import type { Board, PreorderBoard, ReportSummary, Supply } from '@cantina/contracts';
import Link from 'next/link';

import { useSession } from '../../../components/auth-provider';
import { Badge } from '../../../components/ui/badge';
import { LinkButton } from '../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../components/ui/card';
import { Alert } from '../../../components/ui/feedback';
import { reportPath, todayInStore } from '../../../features/reports/api';
import { StatCard } from '../../../features/reports/charts';
import { formatCents, formatQty } from '../../../lib/format';
import { useApi } from '../../../lib/use-api';

/**
 * Início do painel — o resumo do dia.
 *
 * A tela responde o que se quer saber ao abrir o sistema de manhã: **o que
 * está esperando por mim agora**. Por isso a fila vem antes do faturamento:
 * dinheiro é consequência, pedido parado é problema.
 *
 * Os números do dia só aparecem para quem pode vê-los. O atendente do balcão
 * não tem acesso a faturamento na API (§6.9) e a tela concorda com ela — pedir
 * e receber 403 ensinaria a ignorar mensagem de erro.
 */

const FINANCE_ROLES = new Set(['owner', 'manager', 'finance']);

/** Colunas que significam "ainda não terminou". */
const OPEN_DELIVERY = new Set([
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
]);
const OPEN_PREORDER = new Set(['pending', 'confirmed', 'in_production', 'ready']);

export default function PainelPage() {
  const { user, tenant } = useSession();
  const canSeeMoney = FINANCE_ROLES.has(user?.role ?? '');
  const today = todayInStore();

  // O board já é a consulta mais quente do painel e traz os totais por coluna;
  // pedir de novo por outro caminho seria uma segunda consulta para um número
  // que já está na mão.
  const board = useApi<Board>('/delivery-orders/board', { refreshMs: 30_000 });
  const preorders = useApi<PreorderBoard>('/preorders/board');
  const lowStock = useApi<Supply[]>('/supplies/low-stock');
  const summary = useApi<ReportSummary>(
    canSeeMoney ? reportPath.summary({ from: today, to: today }) : null,
  );

  const openOrders = (board.data?.columns ?? [])
    .filter((column) => OPEN_DELIVERY.has(column.status))
    .reduce((total, column) => total + column.count, 0);

  const waitingOrders =
    board.data?.columns.find((column) => column.status === 'pending')?.count ?? 0;

  const openPreorders = (preorders.data?.columns ?? [])
    .filter((column) => OPEN_PREORDER.has(column.status))
    .reduce((total, column) => total + column.count, 0);

  const readyPreorders =
    preorders.data?.columns.find((column) => column.status === 'ready')?.count ?? 0;

  const low = lowStock.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-3xl text-ink">Olá, {user?.name.split(' ')[0]}</h1>
        <p className="mt-1 text-ink-muted">Este é o painel da {tenant?.name}.</p>
      </header>

      {tenant?.status === 'past_due' ? (
        <Alert tone="warning" title="Assinatura em atraso">
          O painel está em somente-leitura até a regularização. Você continua vendo tudo, mas
          não consegue registrar pedidos nem alterar cadastros.
        </Alert>
      ) : null}

      {/* --- O que está esperando --- */}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pedidos em aberto"
          value={openOrders}
          hint={waitingOrders > 0 ? `${waitingOrders} aguardando confirmação` : 'Nada parado'}
          tone={waitingOrders > 0 ? 'accent' : 'neutral'}
          loading={board.loading && !board.data}
        />
        <StatCard
          label="Encomendas ativas"
          value={openPreorders}
          hint={readyPreorders > 0 ? `${readyPreorders} prontas para retirada` : 'Nenhuma pronta'}
          loading={preorders.loading && !preorders.data}
        />
        {canSeeMoney ? (
          <>
            <StatCard
              label="Faturamento de hoje"
              value={formatCents(summary.data?.revenueCents ?? 0)}
              hint={`${summary.data?.ordersCount ?? 0} pedidos concluídos`}
              tone="accent"
              loading={summary.loading && !summary.data}
            />
            <StatCard
              label="Margem de hoje"
              value={formatCents(summary.data?.grossMarginCents ?? 0)}
              hint="Faturamento menos o custo dos produtos"
              tone={(summary.data?.grossMarginCents ?? 0) < 0 ? 'negative' : 'positive'}
              loading={summary.loading && !summary.data}
            />
          </>
        ) : (
          <StatCard
            label="Insumos em falta"
            value={low.length}
            hint={low.length > 0 ? 'Abaixo do mínimo' : 'Tudo dentro do mínimo'}
            tone={low.length > 0 ? 'negative' : 'neutral'}
            loading={lowStock.loading && !lowStock.data}
          />
        )}
      </div>

      {/* --- Estoque baixo --- */}

      {low.length > 0 ? (
        <Card>
          <CardHeader
            title="Insumos abaixo do mínimo"
            description="Repor antes de faltar no meio de uma produção."
            action={
              <LinkButton href="/painel/estoque" size="sm">
                Ver estoque
              </LinkButton>
            }
          />
          <CardBody>
            <ul className="divide-y divide-border">
              {low.slice(0, 5).map((supply) => (
                <li
                  key={supply.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/painel/estoque/insumos/${supply.id}`}
                    className="min-w-0 truncate text-ink hover:text-clay-700"
                  >
                    {supply.name}
                  </Link>
                  <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                    {formatQty(supply.qtyAvailable, supply.usageUnit)}
                    <span className="text-ink-muted/70">
                      {' '}
                      / mín. {formatQty(supply.minStockQty)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {low.length > 5 ? (
              <p className="mt-3 text-sm text-ink-muted">
                E mais {low.length - 5} {low.length - 5 === 1 ? 'insumo' : 'insumos'}.
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* --- Atalhos --- */}

      <Card>
        <CardHeader title="Ir direto para" />
        <CardBody className="grid gap-2 sm:grid-cols-2">
          {[
            ['/painel/pedidos', 'Kanban de pedidos', 'Do balcão à entrega'],
            ['/painel/encomendas', 'Encomendas', 'Agenda e produção'],
            ['/painel/estoque', 'Estoque', 'Saldos, compras e perdas'],
            ['/painel/produtos', 'Produtos', 'Cardápio e vitrine'],
            ...(canSeeMoney
              ? ([
                  ['/painel/financeiro', 'Financeiro', 'Contas e fluxo de caixa'],
                  ['/painel/relatorios', 'Relatórios', 'Faturamento, margem e custos'],
                ] as const)
              : []),
          ].map(([href, title, description]) => (
            <Link
              key={href}
              href={href}
              className="rounded-control border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-sand-100"
            >
              <p className="font-medium text-ink">{title}</p>
              <p className="text-sm text-ink-muted">{description}</p>
            </Link>
          ))}
        </CardBody>
      </Card>

      {tenant ? (
        <p className="text-center text-xs text-ink-muted">
          Sua vitrine:{' '}
          <Link href={`/loja/${tenant.slug}`} className="underline hover:text-ink">
            {tenant.slug}
          </Link>{' '}
          <Badge tone={tenant.status === 'active' ? 'success' : 'warning'} className="ml-1">
            {tenant.status === 'active' ? 'assinatura ativa' : tenant.status}
          </Badge>
        </p>
      ) : null}
    </div>
  );
}
