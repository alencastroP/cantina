'use client';

import Link from 'next/link';

import { Alert } from '../../components/ui/feedback';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { adminApi } from '../../features/admin/api';
import { useAdminApi } from '../../features/admin/use-admin-api';
import { StatCard } from '../../features/reports/charts';
import { formatCents } from '../../lib/format';

/**
 * Visão geral da plataforma (D5, módulo 11).
 *
 * Quatro números e dois alertas. A ordem responde à pergunta de quem opera o
 * negócio: quanto entra por mês, quem está pagando, quem parou de pagar, e o
 * que quebrou sem ninguém ver.
 */
export default function AdminPage() {
  const metrics = useAdminApi(() => adminApi.metrics(), []);
  const data = metrics.data;
  const loading = metrics.loading && !data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-ink">Visão geral</h1>
        <p className="mt-1 text-sm text-ink-muted">A base inteira, num lugar só.</p>
      </header>

      {metrics.error ? (
        <Alert tone="danger" title="Não foi possível carregar as métricas.">
          {metrics.error.message}
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Receita recorrente"
          value={formatCents(data?.mrrCents ?? 0)}
          hint="Soma dos planos com assinatura ativa"
          tone="accent"
          loading={loading}
        />
        <StatCard
          label="Empresas ativas"
          value={data?.tenants.active ?? 0}
          hint={`${data?.tenants.total ?? 0} no total`}
          tone="positive"
          loading={loading}
        />
        <StatCard
          label="Em teste"
          value={data?.tenants.trial ?? 0}
          hint={`${data?.newTenants30d ?? 0} novas em 30 dias`}
          loading={loading}
        />
        <StatCard
          label="Em atraso"
          value={data?.tenants.pastDue ?? 0}
          hint={`${data?.tenants.suspended ?? 0} suspensas`}
          tone={(data?.tenants.pastDue ?? 0) > 0 ? 'negative' : 'neutral'}
          loading={loading}
        />
      </div>

      {data && data.overdue.count > 0 ? (
        <Alert tone="warning" title="Faturas vencidas">
          {data.overdue.count} {data.overdue.count === 1 ? 'fatura vencida' : 'faturas vencidas'},
          somando {formatCents(data.overdue.amountCents)}.{' '}
          <Link href="/admin/empresas?status=past_due" className="underline">
            Ver as empresas em atraso
          </Link>
          .
        </Alert>
      ) : null}

      {/* Webhook que falhou é o único item aqui que exige alguém olhar hoje:
          significa que um pagamento pode ter sido confirmado sem que o
          sistema tenha registrado. */}
      {data && data.failedWebhooks > 0 ? (
        <Alert tone="danger" title="Webhooks sem processar">
          {data.failedWebhooks} {data.failedWebhooks === 1 ? 'evento falhou' : 'eventos falharam'}{' '}
          e continuam pendentes. Um pagamento pode ter sido confirmado no gateway sem virar
          liberação aqui — vale conferir a tabela <code>webhook_events</code>.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Distribuição da base"
          description="Toda empresa está em exatamente um destes estados."
        />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-5">
            {(
              [
                ['Em teste', data?.tenants.trial],
                ['Ativas', data?.tenants.active],
                ['Em atraso', data?.tenants.pastDue],
                ['Suspensas', data?.tenants.suspended],
                ['Canceladas', data?.tenants.canceled],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="font-display text-xl tabular-nums text-ink">{value ?? 0}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
