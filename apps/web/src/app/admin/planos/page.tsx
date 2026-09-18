'use client';

import type { Plan } from '@cantina/contracts';
import { useState, type FormEvent } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../components/ui/card';
import { CurrencyInput } from '../../../components/ui/currency-input';
import { Alert, Skeleton } from '../../../components/ui/feedback';
import { Field, Input } from '../../../components/ui/field';
import { Switch } from '../../../components/ui/switch';
import { adminApi } from '../../../features/admin/api';
import { useAdminSession } from '../../../features/admin/session';
import { useAdminApi } from '../../../features/admin/use-admin-api';
import { ApiError } from '../../../lib/api';
import { formatCents } from '../../../lib/format';

/**
 * Planos.
 *
 * Limite em branco significa SEM limite, nunca zero. É a distinção mais fácil
 * de errar desta tela, e errá-la trancaria o cliente para fora da própria
 * conta — por isso o campo diz isso por extenso em vez de deixar implícito.
 *
 * O código do plano não é editável: ele é a chave que assinaturas já criadas
 * referenciam, e renomeá-lo em produção quebraria a conciliação com o gateway.
 */
export default function PlanosPage() {
  const { session } = useAdminSession();
  const canWrite = session?.user.role === 'owner';

  const plans = useAdminApi(() => adminApi.listPlans(), []);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Planos</h1>
          <p className="mt-1 text-sm text-ink-muted">O que cada assinatura libera.</p>
        </div>

        {canWrite ? (
          <Button
            variant={creating ? 'ghost' : 'primary'}
            size="sm"
            onClick={() => setCreating(!creating)}
          >
            {creating ? 'Cancelar' : 'Novo plano'}
          </Button>
        ) : null}
      </header>

      {plans.error ? (
        <Alert tone="danger" title="Não foi possível carregar os planos.">
          {plans.error.message}
        </Alert>
      ) : null}

      {creating ? (
        <PlanForm
          onDone={() => {
            setCreating(false);
            plans.reload();
          }}
        />
      ) : null}

      {plans.loading && !plans.data ? <Skeleton className="h-40" /> : null}

      <div className="space-y-3">
        {(plans.data ?? []).map((plan) => (
          <PlanRow key={plan.id} plan={plan} canWrite={canWrite} onChanged={plans.reload} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function limitLabel(value: number | undefined, noun: string): string {
  return value ? `${value} ${noun}` : `${noun} sem limite`;
}

function PlanRow({
  plan,
  canWrite,
  onChanged,
}: {
  plan: Plan;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <PlanForm
        plan={plan}
        onDone={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-ink">
            {plan.name}
            <code className="rounded bg-sand-200 px-1.5 py-0.5 text-xs text-ink-soft">
              {plan.code}
            </code>
            {!plan.active ? <Badge tone="neutral">inativo</Badge> : null}
          </p>
          <p className="text-xs text-ink-muted">
            {limitLabel(plan.limits.maxProducts, 'produtos')} ·{' '}
            {limitLabel(plan.limits.maxUsers, 'usuários')} ·{' '}
            {limitLabel(plan.limits.maxOrdersPerMonth, 'pedidos/mês')}
          </p>
        </div>

        <p className="font-display text-lg tabular-nums text-clay-700">
          {formatCents(plan.priceCents)}
          <span className="text-sm text-ink-muted">/mês</span>
        </p>

        {canWrite ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        ) : null}
      </CardBody>
    </Card>
  );
}

function PlanForm({ plan, onDone }: { plan?: Plan; onDone: () => void }) {
  const editing = plan !== undefined;

  const [code, setCode] = useState(plan?.code ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [priceCents, setPriceCents] = useState(plan?.priceCents ?? 0);
  const [maxProducts, setMaxProducts] = useState(plan?.limits.maxProducts ?? '');
  const [maxUsers, setMaxUsers] = useState(plan?.limits.maxUsers ?? '');
  const [maxOrders, setMaxOrders] = useState(plan?.limits.maxOrdersPerMonth ?? '');
  const [active, setActive] = useState(plan?.active ?? true);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Campo vazio vira `undefined`, não 0: ausente é "sem limite".
  const toLimit = (value: number | string): number | undefined => {
    const parsed = Number(value);
    return value === '' || Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const limits = {
      ...(toLimit(maxProducts) ? { maxProducts: toLimit(maxProducts)! } : {}),
      ...(toLimit(maxUsers) ? { maxUsers: toLimit(maxUsers)! } : {}),
      ...(toLimit(maxOrders) ? { maxOrdersPerMonth: toLimit(maxOrders)! } : {}),
    };

    try {
      if (editing) {
        await adminApi.updatePlan(plan.id, {
          name,
          description: description || null,
          priceCents,
          limits,
          active,
        });
      } else {
        await adminApi.createPlan({
          code,
          name,
          description: description || null,
          priceCents,
          limits,
          active,
        });
      }
      onDone();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.code === 'validation_error' ? null : caught.message);
        setFieldErrors(caught.fieldErrors);
      } else {
        setError('Não foi possível salvar o plano.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={editing ? `Editar ${plan.name}` : 'Novo plano'}
        description={
          editing
            ? 'O código não muda: assinaturas já criadas o referenciam.'
            : 'O código identifica o plano na cobrança e não pode ser alterado depois.'
        }
      />
      <form onSubmit={handleSubmit} noValidate>
        <CardBody className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome" error={fieldErrors['name']} required>
              {(props) => (
                <Input
                  {...props}
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Essencial"
                />
              )}
            </Field>

            <Field label="Código" error={fieldErrors['code']} required>
              {(props) => (
                <Input
                  {...props}
                  required
                  disabled={editing}
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                  }
                  placeholder="essencial"
                />
              )}
            </Field>

            <Field label="Preço mensal" error={fieldErrors['priceCents']} required>
              {(props) => (
                <CurrencyInput {...props} value={priceCents} onValueChange={setPriceCents} />
              )}
            </Field>
          </div>

          <Field label="Descrição" error={fieldErrors['description']}>
            {(props) => (
              <Input
                {...props}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Vitrine, pedidos, estoque e financeiro."
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ['Máximo de produtos', maxProducts, setMaxProducts],
                ['Máximo de usuários', maxUsers, setMaxUsers],
                ['Pedidos por mês', maxOrders, setMaxOrders],
              ] as const
            ).map(([label, value, setter]) => (
              <Field key={label} label={label} hint="Vazio = sem limite.">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    value={value}
                    onChange={(event) =>
                      (setter as (next: number | string) => void)(event.target.value)
                    }
                    placeholder="sem limite"
                  />
                )}
              </Field>
            ))}
          </div>

          <Switch
            checked={active}
            onCheckedChange={setActive}
            label="Disponível para contratação"
            description="Desmarcar não afeta quem já assina — só tira o plano da vitrine de planos."
          />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={!name || (!editing && !code)}
            >
              {editing ? 'Salvar' : 'Criar plano'}
            </Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}
