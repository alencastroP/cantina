'use client';

import type { AvailabilityException, AvailabilityRule, TenantSettings } from '@cantina/contracts';
import { useEffect, useState } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../../components/ui/feedback';
import { Field, Input, Select } from '../../../../../components/ui/field';
import { Form } from '../../../../../components/ui/form';
import { QuantityInput } from '../../../../../components/ui/quantity-input';
import { Switch } from '../../../../../components/ui/switch';
import { preordersApi, WEEKDAY_LABELS } from '../../../../../features/preorders/api';
import { api } from '../../../../../lib/api';
import { formatDate } from '../../../../../lib/format';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Agenda de encomendas (D10).
 *
 * Três coisas decidem se um dia aceita encomenda, e a tela separa as três
 * porque elas mudam em ritmos diferentes:
 *
 *   regra semanal   quase nunca muda — é a capacidade da cozinha
 *   exceções        feriado, férias, mutirão — pontuais
 *   antecedência    quanto tempo você precisa para produzir
 */
export default function AgendaPage() {
  const rules = useApi<AvailabilityRule[]>('/availability/rules');
  const settings = useApi<TenantSettings>('/settings');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Agenda de encomendas"
        description="Quando e quantas encomendas você aceita."
        back={{ href: '/painel/encomendas', label: 'Encomendas' }}
      />

      {rules.loading && !rules.data ? (
        <Skeleton className="h-72" />
      ) : rules.data ? (
        <RulesCard rules={rules.data} onSaved={rules.reload} />
      ) : null}

      {settings.data ? (
        <LeadTimeCard settings={settings.data} onSaved={settings.reload} />
      ) : null}

      <ExceptionsCard />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RulesCard({
  rules: initial,
  onSaved,
}: {
  rules: AvailabilityRule[];
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const [rules, setRules] = useState(initial);
  const [saved, setSaved] = useState(false);

  useEffect(() => setRules(initial), [initial]);

  const dirty = JSON.stringify(rules) !== JSON.stringify(initial);
  const anyOpen = rules.some((rule) => rule.isOpen && rule.capacity > 0);

  function update(weekday: number, patch: Partial<AvailabilityRule>) {
    setRules((current) =>
      current.map((rule) => (rule.weekday === weekday ? { ...rule, ...patch } : rule)),
    );
  }

  return (
    <Card>
      <CardHeader
        title="Semana"
        description="Quantas encomendas cabem em cada dia."
      />
      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}
        {saved ? <Alert tone="success">Agenda salva.</Alert> : null}

        {!anyOpen ? (
          <Alert tone="warning">
            Nenhum dia aceita encomenda. A vitrine não vai oferecer a opção ao cliente.
          </Alert>
        ) : null}

        <ul className="divide-y divide-border">
          {rules.map((rule) => (
            <li key={rule.weekday} className="flex items-center gap-4 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <Switch
                  checked={rule.isOpen}
                  onCheckedChange={(isOpen) =>
                    // Abrir um dia sem capacidade não abre nada — 1 é o mínimo
                    // que faz o interruptor significar o que ele diz.
                    update(rule.weekday, {
                      isOpen,
                      ...(isOpen && rule.capacity === 0 ? { capacity: 1 } : {}),
                    })
                  }
                  label={WEEKDAY_LABELS[rule.weekday] ?? ''}
                />
              </div>

              <div className="w-32 shrink-0">
                <QuantityInput
                  value={rule.capacity}
                  onValueChange={(capacity) => update(rule.weekday, { capacity })}
                  unit="enc."
                  disabled={!rule.isOpen}
                  aria-label={`Capacidade de ${WEEKDAY_LABELS[rule.weekday]}`}
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={mutation.submitting}
            onClick={async () => {
              if (await mutation.run(() => preordersApi.putRules(rules))) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
                onSaved();
              }
            }}
          >
            Salvar semana
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function LeadTimeCard({
  settings,
  onSaved,
}: {
  settings: TenantSettings;
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const [leadTime, setLeadTime] = useState(settings.preorderLeadTimeHours);
  const [horizon, setHorizon] = useState(settings.preorderHorizonDays);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLeadTime(settings.preorderLeadTimeHours);
    setHorizon(settings.preorderHorizonDays);
  }, [settings]);

  const dirty =
    leadTime !== settings.preorderLeadTimeHours || horizon !== settings.preorderHorizonDays;

  return (
    <Card>
      <CardHeader title="Prazos" />
      <CardBody className="space-y-5">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}
        {saved ? <Alert tone="success">Prazos salvos.</Alert> : null}

        <Field
          label="Antecedência mínima"
          hint={`Um pedido feito agora só pode ser marcado para daqui a ${leadTime} hora(s).`}
        >
          {(props) => (
            <QuantityInput
              {...props}
              value={leadTime}
              onValueChange={setLeadTime}
              unit="horas"
            />
          )}
        </Field>

        <Field
          label="Até quando aceita agendamento"
          hint="Quantos dias à frente a vitrine deixa o cliente escolher."
        >
          {(props) => (
            <QuantityInput {...props} value={horizon} onValueChange={setHorizon} unit="dias" />
          )}
        </Field>

        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={mutation.submitting}
            onClick={async () => {
              const result = await mutation.run(() =>
                api.put<TenantSettings>('/settings', {
                  preorderLeadTimeHours: leadTime,
                  preorderHorizonDays: horizon,
                }),
              );
              if (result) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
                onSaved();
              }
            }}
          >
            Salvar prazos
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function ExceptionsCard() {
  const today = new Date().toISOString().slice(0, 10);
  const inAYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

  const exceptions = useApi<AvailabilityException[]>(
    `/availability/exceptions?from=${today}&to=${inAYear}`,
  );
  const mutation = useMutation();

  const [date, setDate] = useState('');
  const [mode, setMode] = useState<'closed' | 'open'>('closed');
  const [capacity, setCapacity] = useState(0);
  const [reason, setReason] = useState('');

  return (
    <Card>
      <CardHeader
        title="Exceções"
        description="Feriado, férias, ou um dia extra fora da regra."
      />
      <CardBody className="space-y-5">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        <Form
          className="space-y-4 rounded-card border border-border bg-sand-100/60 p-4"
          fieldErrors={mutation.fieldErrors}
          error={mutation.error}
          onSubmit={async () => {
            const created = await mutation.run(() =>
              preordersApi.upsertException({
                date,
                isOpen: mode === 'open',
                ...(mode === 'open' && capacity > 0 ? { capacity } : {}),
                ...(reason ? { reason } : {}),
              }),
            );
            if (created) {
              setDate('');
              setReason('');
              setCapacity(0);
              exceptions.reload();
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data" error={mutation.fieldErrors['date']} required>
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  required
                  min={today}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              )}
            </Field>

            <Field label="O que acontece nesse dia">
              {(props) => (
                <Select
                  {...props}
                  value={mode}
                  onChange={(event) => setMode(event.target.value as 'closed' | 'open')}
                >
                  <option value="closed">Não aceito encomendas</option>
                  <option value="open">Aceito, fora da regra normal</option>
                </Select>
              )}
            </Field>
          </div>

          {mode === 'open' ? (
            <Field
              label="Capacidade nesse dia"
              hint="Deixe zero para usar a capacidade da regra semanal."
            >
              {(props) => (
                <QuantityInput
                  {...props}
                  value={capacity}
                  onValueChange={setCapacity}
                  unit="enc."
                />
              )}
            </Field>
          ) : null}

          <Field label="Motivo">
            {(props) => (
              <Input
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={mode === 'closed' ? 'Feriado' : 'Mutirão de Natal'}
              />
            )}
          </Field>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              disabled={!date}
              loading={mutation.submitting}
            >
              Adicionar exceção
            </Button>
          </div>
        </Form>

        {exceptions.loading && !exceptions.data ? (
          <Skeleton className="h-20" />
        ) : exceptions.data && exceptions.data.length > 0 ? (
          <ul className="divide-y divide-border">
            {exceptions.data.map((exception) => (
              <li key={exception.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {formatDate(exception.date)} —{' '}
                    {exception.isOpen
                      ? `aberto${exception.capacity ? ` (${exception.capacity} enc.)` : ''}`
                      : 'fechado'}
                  </p>
                  {exception.reason ? (
                    <p className="text-sm text-ink-muted">{exception.reason}</p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger-700"
                  onClick={async () => {
                    if (await mutation.run(() => preordersApi.removeException(exception.id))) {
                      exceptions.reload();
                    }
                  }}
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">
            Nenhuma exceção. A regra semanal vale para todos os dias.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
