'use client';

import type { Plan } from '@cantina/contracts';
import { useState } from 'react';

import { PageHeader } from '../../../../components/layout/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../components/ui/feedback';
import { Field, Input, Select } from '../../../../components/ui/field';
import {
  BILLING_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  TENANT_STATUS_LABELS,
  TENANT_STATUS_TONES,
  billingApi,
  daysUntil,
  usageRatio,
  type BillingOverviewResponse,
} from '../../../../features/billing/api';
import { cn } from '../../../../lib/cn';
import { formatCents, formatDate } from '../../../../lib/format';
import { useApi, useMutation } from '../../../../lib/use-api';

/**
 * Assinatura.
 *
 * É a única tela que precisa funcionar quando a empresa está em atraso — por
 * isso ela não passa por `requireActiveTenant` na API. Uma tela de pagamento
 * bloqueada por falta de pagamento é a definição de armadilha.
 *
 * A ordem responde à pergunta real do lojista, nesta sequência: em que
 * situação eu estou, o que preciso pagar, e o que ganho se mudar de plano.
 */
export default function AssinaturaPage() {
  const billing = useApi<BillingOverviewResponse>('/subscription');
  const data = billing.data;

  const [planCode, setPlanCode] = useState('');
  const [document, setDocument] = useState('');
  const [billingType, setBillingType] = useState('PIX');
  const start = useMutation();

  const trialDays = daysUntil(data?.trialEndsAt ?? null);
  const openInvoice = data?.invoices.find(
    (invoice) => invoice.status === 'overdue' || invoice.status === 'pending',
  );

  async function subscribe(code: string) {
    const done = await start.run(() =>
      billingApi.start({ planCode: code, document, billingType: billingType as 'PIX' }),
    );
    if (done) billing.reload();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Assinatura"
        description="Seu plano, suas faturas e o que cada um libera."
      />

      {billing.error ? (
        <Alert tone="danger" title="Não foi possível carregar a assinatura.">
          {billing.error.message}
        </Alert>
      ) : null}

      {billing.loading && !data ? <Skeleton className="h-40" /> : null}

      {data ? (
        <>
          {data.simulated ? (
            <Alert tone="warning" title="Cobrança em modo local">
              Não há gateway de pagamento configurado neste ambiente. As assinaturas são
              ativadas sem cobrança real — útil para testar, nunca para produção.
            </Alert>
          ) : null}

          {/* --- Situação --- */}

          <Card>
            <CardHeader
              title="Situação da conta"
              action={
                <Badge tone={TENANT_STATUS_TONES[data.tenantStatus]}>
                  {TENANT_STATUS_LABELS[data.tenantStatus]}
                </Badge>
              }
            />
            <CardBody className="space-y-4">
              {data.tenantStatus === 'trial' && trialDays !== null ? (
                <Alert tone={trialDays <= 3 ? 'warning' : 'info'}>
                  {trialDays > 0
                    ? `Seu teste termina em ${trialDays} ${trialDays === 1 ? 'dia' : 'dias'}. Escolha um plano para continuar vendendo.`
                    : 'Seu teste terminou. Escolha um plano para voltar a cadastrar e registrar pedidos.'}
                </Alert>
              ) : null}

              {data.tenantStatus === 'past_due' ? (
                <Alert tone="warning" title="Pagamento em atraso">
                  O painel está em somente-leitura. Você continua vendo tudo e a loja segue
                  no ar — pague a fatura em aberto para liberar as alterações.
                </Alert>
              ) : null}

              {data.tenantStatus === 'suspended' ? (
                <Alert tone="danger" title="Loja fora do ar">
                  A vitrine foi suspensa por atraso prolongado. Assim que o pagamento for
                  confirmado ela volta automaticamente.
                </Alert>
              ) : null}

              {data.subscription ? (
                <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-ink-muted">Plano</dt>
                    <dd className="text-ink">
                      {data.subscription.plan.name} ·{' '}
                      {formatCents(data.subscription.plan.priceCents)}/mês
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-muted">Assinatura</dt>
                    <dd className="text-ink">
                      {SUBSCRIPTION_STATUS_LABELS[data.subscription.status]}
                    </dd>
                  </div>
                  {data.subscription.currentPeriodEnd ? (
                    <div>
                      <dt className="text-sm text-ink-muted">Válida até</dt>
                      <dd className="text-ink">
                        {formatDate(data.subscription.currentPeriodEnd)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-ink-muted">
                  Você ainda não tem um plano contratado.
                </p>
              )}

              {openInvoice?.paymentUrl ? (
                <a
                  href={openInvoice.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-ink-inverse shadow-soft transition-colors hover:bg-primary-hover"
                >
                  Pagar {formatCents(openInvoice.amountCents)}
                </a>
              ) : null}
            </CardBody>
          </Card>

          {/* --- Uso --- */}

          <Card>
            <CardHeader
              title="Uso do plano"
              description="Limites valem para o que você cria daqui em diante."
            />
            <CardBody className="space-y-4">
              <UsageBar
                label="Produtos"
                used={data.usage.products}
                limit={data.subscription?.plan.limits.maxProducts}
              />
              <UsageBar
                label="Usuários"
                used={data.usage.users}
                limit={data.subscription?.plan.limits.maxUsers}
              />
              <UsageBar
                label="Pedidos neste mês"
                used={data.usage.ordersThisMonth}
                limit={data.subscription?.plan.limits.maxOrdersPerMonth}
                // Este não bloqueia: recusar o pedido de um cliente porque o
                // lojista precisa de upgrade tiraria faturamento dele.
                hint="Acompanhamento — pedidos não são recusados por limite."
              />
            </CardBody>
          </Card>

          {/* --- Planos --- */}

          <Card>
            <CardHeader
              title={data.subscription ? 'Trocar de plano' : 'Escolher um plano'}
              description="A cobrança é mensal e pode ser cancelada quando quiser."
            />
            <CardBody className="space-y-4">
              {start.error ? <Alert tone="danger">{start.error}</Alert> : null}

              <div className="grid gap-3 sm:grid-cols-3">
                {data.availablePlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    current={data.subscription?.plan.id === plan.id}
                    selected={planCode === plan.code}
                    onSelect={() => setPlanCode(plan.code)}
                  />
                ))}
              </div>

              {planCode ? (
                <div className="space-y-4 rounded-card border border-border bg-sand-100/60 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="CPF ou CNPJ"
                      hint="Vai na cobrança e na nota."
                      error={start.fieldErrors['document']}
                      required
                    >
                      {(props) => (
                        <Input
                          {...props}
                          value={document}
                          onChange={(event) => setDocument(event.target.value)}
                          placeholder="00.000.000/0000-00"
                          inputMode="numeric"
                        />
                      )}
                    </Field>

                    <Field label="Forma de pagamento">
                      {(props) => (
                        <Select
                          {...props}
                          value={billingType}
                          onChange={(event) => setBillingType(event.target.value)}
                        >
                          {Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setPlanCode('')}>
                      Cancelar
                    </Button>
                    <Button
                      variant="primary"
                      loading={start.submitting}
                      disabled={document.replace(/\D/g, '').length < 11}
                      onClick={() => void subscribe(planCode)}
                    >
                      Assinar {data.availablePlans.find((p) => p.code === planCode)?.name}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>

          {/* --- Faturas --- */}

          {data.invoices.length > 0 ? (
            <Card>
              <CardHeader title="Faturas" description="As doze mais recentes." />
              <CardBody>
                <ul className="divide-y divide-border">
                  {data.invoices.map((invoice) => (
                    <li
                      key={invoice.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-ink">{formatCents(invoice.amountCents)}</p>
                        <p className="text-xs text-ink-muted">
                          {invoice.paidAt
                            ? `Paga em ${formatDate(invoice.paidAt)}`
                            : invoice.dueDate
                              ? `Vence em ${formatDate(invoice.dueDate)}`
                              : 'Sem vencimento'}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <Badge
                          tone={
                            invoice.status === 'paid'
                              ? 'success'
                              : invoice.status === 'overdue'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
                        </Badge>
                        {invoice.paymentUrl && invoice.status !== 'paid' ? (
                          <a
                            href={invoice.paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-clay-700 underline"
                          >
                            Abrir
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {data.subscription && data.subscription.status !== 'canceled' ? (
            <CancelCard onDone={billing.reload} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function UsageBar({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  limit: number | undefined;
  hint?: string;
}) {
  const ratio = usageRatio(used, limit);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-ink">{label}</p>
        <p className="text-sm tabular-nums text-ink-muted">
          {used}
          {limit ? ` / ${limit}` : ' · sem limite'}
        </p>
      </div>

      {ratio !== null ? (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sand-200">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              ratio >= 100 ? 'bg-danger-500' : ratio >= 80 ? 'bg-warning-500' : 'bg-olive-500',
            )}
            style={{ width: `${ratio}%` }}
          />
        </div>
      ) : null}

      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function PlanCard({
  plan,
  current,
  selected,
  onSelect,
}: {
  plan: Plan;
  current: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const limits = [
    plan.limits.maxProducts ? `${plan.limits.maxProducts} produtos` : 'Produtos ilimitados',
    plan.limits.maxUsers ? `${plan.limits.maxUsers} usuários` : 'Usuários ilimitados',
    plan.limits.maxOrdersPerMonth
      ? `${plan.limits.maxOrdersPerMonth} pedidos/mês`
      : 'Pedidos ilimitados',
  ];

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={current}
      aria-pressed={selected}
      className={cn(
        'rounded-card border p-4 text-left transition-colors',
        current
          ? 'cursor-default border-olive-300 bg-olive-100/60'
          : selected
            ? 'border-clay-300 bg-clay-100'
            : 'border-border bg-surface hover:border-border-strong',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-lg text-ink">{plan.name}</p>
        {current ? <Badge tone="accent">atual</Badge> : null}
      </div>

      <p className="mt-0.5 font-display text-xl text-clay-700">
        {formatCents(plan.priceCents)}
        <span className="text-sm text-ink-muted">/mês</span>
      </p>

      {plan.description ? (
        <p className="mt-1 text-xs text-ink-muted">{plan.description}</p>
      ) : null}

      <ul className="mt-3 space-y-1 text-xs text-ink-soft">
        {limits.map((limit) => (
          <li key={limit}>· {limit}</li>
        ))}
      </ul>
    </button>
  );
}

function CancelCard({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const mutation = useMutation();

  return (
    <Card>
      <CardBody className="space-y-3">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm text-ink-muted underline hover:text-ink"
          >
            Cancelar assinatura
          </button>
        ) : (
          <>
            {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

            <p className="text-sm text-ink">
              O período já pago continua valendo até o fim. Depois disso, a loja sai do ar.
            </p>

            <Field label="Por que está cancelando?" hint="Ajuda a melhorar o produto.">
              {(props) => (
                <Input
                  {...props}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Fechei a loja, ficou caro, faltou um recurso…"
                />
              )}
            </Field>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Voltar
              </Button>
              <Button
                variant="danger"
                loading={mutation.submitting}
                disabled={reason.trim().length < 3}
                onClick={async () => {
                  const done = await mutation.run(() => billingApi.cancel(reason));
                  if (done !== null) {
                    setOpen(false);
                    onDone();
                  }
                }}
              >
                Confirmar cancelamento
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
