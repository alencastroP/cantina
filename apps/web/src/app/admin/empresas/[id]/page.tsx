'use client';

import type { TenantStatus } from '@cantina/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../components/ui/feedback';
import { Field, Input, Select } from '../../../../components/ui/field';
import { adminApi } from '../../../../features/admin/api';
import { useAdminSession } from '../../../../features/admin/session';
import { useAdminApi } from '../../../../features/admin/use-admin-api';
import {
  SUBSCRIPTION_STATUS_LABELS,
  TENANT_STATUS_LABELS,
  TENANT_STATUS_TONES,
} from '../../../../features/billing/api';
import { ApiError } from '../../../../lib/api';
import { formatCents, formatDate } from '../../../../lib/format';

/**
 * Uma empresa vista pela plataforma.
 *
 * A ação que importa aqui é a mudança de status, e ela é a mais destrutiva do
 * sistema: suspender tira a vitrine do ar. Por isso exige motivo escrito,
 * fica separada do resto num cartão próprio, e só `owner` a enxerga.
 */

const STATUS_HELP: Record<TenantStatus, string> = {
  trial: 'Período de teste. Acesso completo, sem cobrança.',
  active: 'Assinatura em dia. Tudo liberado.',
  past_due: 'Painel em somente-leitura. A vitrine continua no ar.',
  suspended: 'Vitrine fora do ar. Só o painel de assinatura continua acessível.',
  canceled: 'Conta encerrada.',
};

export default function EmpresaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { session } = useAdminSession();
  const canWrite = session?.user.role === 'owner';

  const tenant = useAdminApi(() => adminApi.getTenant(id), [id]);
  const data = tenant.data;

  return (
    <div className="space-y-5">
      <Link
        href="/admin/empresas"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        ← Empresas
      </Link>

      {tenant.error ? (
        <Alert tone="danger" title="Não foi possível carregar a empresa.">
          {tenant.error.message}
        </Alert>
      ) : null}

      {tenant.loading && !data ? <Skeleton className="h-40" /> : null}

      {data ? (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl text-ink">{data.name}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                {data.slug} · criada em {formatDate(data.createdAt)}
              </p>
            </div>
            <Badge tone={TENANT_STATUS_TONES[data.status]}>
              {TENANT_STATUS_LABELS[data.status]}
            </Badge>
          </header>

          <Card>
            <CardHeader title="Cadastro" />
            <CardBody>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Row label="Razão social" value={data.legalName ?? '—'} />
                <Row label="CNPJ ou CPF" value={data.document ?? '—'} />
                <Row label="Fuso horário" value={data.timeZone} />
                <Row
                  label="Fim do teste"
                  value={data.trialEndsAt ? formatDate(data.trialEndsAt) : '—'}
                />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Assinatura" />
            <CardBody>
              {data.plan ? (
                <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  <Row
                    label="Plano"
                    value={`${data.plan.name} · ${formatCents(data.plan.priceCents)}/mês`}
                  />
                  <Row
                    label="Situação"
                    value={
                      data.subscriptionStatus
                        ? SUBSCRIPTION_STATUS_LABELS[data.subscriptionStatus]
                        : 'Sem assinatura contratada'
                    }
                  />
                  <Row
                    label="Válida até"
                    value={data.currentPeriodEnd ? formatDate(data.currentPeriodEnd) : '—'}
                  />
                  <Row
                    label="Faturas vencidas"
                    value={String(data.overdueInvoices)}
                    tone={data.overdueInvoices > 0 ? 'danger' : undefined}
                  />
                </dl>
              ) : (
                <p className="text-sm text-ink-muted">
                  Sem plano. O lojista escolhe um pela tela de assinatura do painel.
                </p>
              )}
            </CardBody>
          </Card>

          {canWrite ? (
            <StatusCard
              id={id}
              current={data.status}
              onChanged={tenant.reload}
            />
          ) : (
            <p className="text-sm text-ink-muted">
              Seu perfil é de suporte: você consulta a conta, mas não altera o status dela.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger';
}) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={tone === 'danger' ? 'text-danger-700' : 'text-ink'}>{value}</dd>
    </div>
  );
}

function StatusCard({
  id,
  current,
  onChanged,
}: {
  id: string;
  current: TenantStatus;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<TenantStatus>(current);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const changed = status !== current;
  const dangerous = status === 'suspended' || status === 'canceled';

  async function submit() {
    setSubmitting(true);
    setError(null);

    try {
      await adminApi.changeStatus(id, { status, reason });
      setReason('');
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível mudar o status.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Mudar o status"
        description="Fica registrado na auditoria da empresa, com autor e motivo."
      />
      <CardBody className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Novo status" hint={STATUS_HELP[status]}>
            {(props) => (
              <Select
                {...props}
                value={status}
                onChange={(event) => setStatus(event.target.value as TenantStatus)}
              >
                {(Object.keys(TENANT_STATUS_LABELS) as TenantStatus[]).map((value) => (
                  <option key={value} value={value}>
                    {TENANT_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Motivo" hint="Obrigatório. Mínimo de 3 caracteres." required>
            {(props) => (
              <Input
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Inadimplência de 40 dias, pedido do cliente…"
              />
            )}
          </Field>
        </div>

        {dangerous && changed ? (
          <Alert tone="danger" title="Isto tira a loja do ar">
            A vitrine deixa de responder para os clientes dela. Confirme que é isso mesmo.
          </Alert>
        ) : null}

        <div className="flex justify-end">
          <Button
            variant={dangerous ? 'danger' : 'primary'}
            loading={submitting}
            disabled={!changed || reason.trim().length < 3}
            onClick={() => void submit()}
          >
            Aplicar
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
