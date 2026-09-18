'use client';

import type { Page as ApiPage, SalesChannel } from '@cantina/contracts';
import { useState } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { CurrencyInput } from '../../../../../components/ui/currency-input';
import { Alert, EmptyState, Skeleton } from '../../../../../components/ui/feedback';
import { Field, Input, Select } from '../../../../../components/ui/field';
import { Form } from '../../../../../components/ui/form';
import { QuantityInput } from '../../../../../components/ui/quantity-input';
import { Switch } from '../../../../../components/ui/switch';
import { CHANNEL_KIND_LABELS, recipesApi } from '../../../../../features/recipes/api';
import { formatCents, formatPercent } from '../../../../../lib/format';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Canais de venda (D13).
 *
 * Cadastrados por empresa porque a comissão do iFood de uma padaria não é a
 * mesma de outra. É o que transforma "vendo a R$ 7" em "sobra R$ 5,07 no
 * balcão e R$ 3,90 no iFood".
 */
export default function CanaisPage() {
  const channels = useApi<ApiPage<SalesChannel>>('/sales-channels');
  const mutation = useMutation();
  const [creating, setCreating] = useState(false);

  const items = channels.data?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Canais de venda"
        description="As taxas de cada lugar onde você vende."
        back={{ href: '/painel/fichas', label: 'Fichas técnicas' }}
        action={
          !creating ? (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              Novo canal
            </Button>
          ) : undefined
        }
      />

      {mutation.error ? (
        <Alert tone="danger" className="mb-4">
          {mutation.error}
        </Alert>
      ) : null}

      {creating ? (
        <Card className="mb-5">
          <CardHeader title="Novo canal" />
          <CardBody>
            <ChannelForm
              submitting={mutation.submitting}
              fieldErrors={mutation.fieldErrors}
              onCancel={() => {
                setCreating(false);
                mutation.reset();
              }}
              onSubmit={async (values) => {
                if (
                  await mutation.run(() =>
                    recipesApi.createChannel({
                      name: values.name,
                      kind: values.kind,
                      commissionPercent: values.commissionPercent,
                      paymentFeePercent: values.paymentFeePercent,
                      fixedFeeCents: values.fixedFeeCents,
                      absorbsDeliveryFee: values.absorbsDeliveryFee,
                      isDefault: false,
                      active: true,
                    }),
                  )
                ) {
                  setCreating(false);
                  channels.reload();
                }
              }}
            />
          </CardBody>
        </Card>
      ) : null}

      {channels.loading && !channels.data ? (
        <div className="space-y-2">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : null}

      {channels.data && items.length === 0 && !creating ? (
        <EmptyState
          title="Nenhum canal cadastrado"
          description="Sem canal, a margem é calculada sem taxa nenhuma — o que só vale para venda no balcão."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              Cadastrar canal
            </Button>
          }
        />
      ) : null}

      <ul className="space-y-3">
        {items.map((channel) => (
          <li key={channel.id}>
            <ChannelRow channel={channel} onChanged={channels.reload} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ChannelRow({
  channel,
  onChanged,
}: {
  channel: SalesChannel;
  onChanged: () => void;
}) {
  const mutation = useMutation();
  const [editing, setEditing] = useState(false);

  const totalFee = channel.commissionPercent + channel.paymentFeePercent;

  if (editing) {
    return (
      <Card>
        <CardHeader title={`Editar ${channel.name}`} />
        <CardBody>
          <ChannelForm
            initial={channel}
            submitting={mutation.submitting}
            fieldErrors={mutation.fieldErrors}
            onCancel={() => {
              setEditing(false);
              mutation.reset();
            }}
            onSubmit={async (values) => {
              if (
                await mutation.run(() =>
                  recipesApi.updateChannel(channel.id, {
                    name: values.name,
                    kind: values.kind,
                    commissionPercent: values.commissionPercent,
                    paymentFeePercent: values.paymentFeePercent,
                    fixedFeeCents: values.fixedFeeCents,
                    absorbsDeliveryFee: values.absorbsDeliveryFee,
                  }),
                )
              ) {
                setEditing(false);
                onChanged();
              }
            }}
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-ink">{channel.name}</p>
              {channel.isDefault ? <Badge tone="accent">Padrão</Badge> : null}
              {!channel.active ? <Badge>Inativo</Badge> : null}
            </div>
            <p className="mt-0.5 text-sm text-ink-muted">
              {CHANNEL_KIND_LABELS[channel.kind] ?? channel.kind}
              {channel.absorbsDeliveryFee ? ' · você banca o frete' : ''}
            </p>
          </div>

          <div className="text-right">
            <p className="font-medium text-ink" data-numeric>
              {totalFee > 0 ? formatPercent(totalFee) : 'sem taxa'}
            </p>
            {channel.fixedFeeCents > 0 ? (
              <p className="text-sm text-ink-muted" data-numeric>
                + {formatCents(channel.fixedFeeCents)} por pedido
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
          {!channel.isDefault ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                loading={mutation.submitting}
                onClick={async () => {
                  if (
                    await mutation.run(() =>
                      recipesApi.updateChannel(channel.id, { isDefault: true }),
                    )
                  ) {
                    onChanged();
                  }
                }}
              >
                Tornar padrão
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger-700"
                loading={mutation.submitting}
                onClick={async () => {
                  if (await mutation.run(() => recipesApi.removeChannel(channel.id))) {
                    onChanged();
                  }
                }}
              >
                Remover
              </Button>
            </>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

interface ChannelValues {
  name: string;
  kind: SalesChannel['kind'];
  commissionPercent: number;
  paymentFeePercent: number;
  fixedFeeCents: number;
  absorbsDeliveryFee: boolean;
}

function ChannelForm({
  initial,
  submitting,
  fieldErrors,
  onCancel,
  onSubmit,
}: {
  initial?: SalesChannel;
  submitting: boolean;
  fieldErrors: Record<string, string>;
  onCancel: () => void;
  onSubmit: (values: ChannelValues) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<SalesChannel['kind']>(initial?.kind ?? 'marketplace');
  const [commission, setCommission] = useState(initial?.commissionPercent ?? 0);
  const [paymentFee, setPaymentFee] = useState(initial?.paymentFeePercent ?? 0);
  const [fixedFee, setFixedFee] = useState(initial?.fixedFeeCents ?? 0);
  const [absorbs, setAbsorbs] = useState(initial?.absorbsDeliveryFee ?? false);

  const tooHigh = commission + paymentFee >= 100;
  const canSave = name.trim().length >= 2 && !tooHigh;

  return (
    <Form
      className="space-y-5"
      fieldErrors={fieldErrors}
      onSubmit={() => {
        if (!canSave) return;
        onSubmit({
          name: name.trim(),
          kind,
          commissionPercent: commission,
          paymentFeePercent: paymentFee,
          fixedFeeCents: fixedFee,
          absorbsDeliveryFee: absorbs,
        });
      }}
    >
      <Field label="Nome" error={fieldErrors['name']} required>
        {(props) => (
          <Input
            {...props}
            autoFocus
            autoComplete="off"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="iFood"
            invalid={Boolean(fieldErrors['name'])}
          />
        )}
      </Field>

      <Field label="Tipo">
        {(props) => (
          <Select
            {...props}
            value={kind}
            onChange={(event) => setKind(event.target.value as SalesChannel['kind'])}
          >
            {Object.entries(CHANNEL_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Comissão do canal" error={fieldErrors['commissionPercent']}>
          {(props) => (
            <QuantityInput
              {...props}
              value={commission}
              onValueChange={setCommission}
              unit="%"
              invalid={tooHigh}
            />
          )}
        </Field>
        <Field label="Taxa de pagamento" hint="Maquininha ou gateway.">
          {(props) => (
            <QuantityInput
              {...props}
              value={paymentFee}
              onValueChange={setPaymentFee}
              unit="%"
              invalid={tooHigh}
            />
          )}
        </Field>
      </div>

      {tooHigh ? (
        <Alert tone="danger">
          As taxas somam {formatPercent(commission + paymentFee)}. Acima de 100% não sobra
          nada para calcular.
        </Alert>
      ) : null}

      <Field label="Taxa fixa por pedido">
        {(props) => (
          <CurrencyInput {...props} value={fixedFee} onValueChange={setFixedFee} />
        )}
      </Field>

      <Switch
        checked={absorbs}
        onCheckedChange={setAbsorbs}
        label="Você banca o frete neste canal"
        description="Quando marcado, o frete sai da sua margem em vez de ser cobrado do cliente."
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!canSave} loading={submitting}>
          Salvar canal
        </Button>
      </div>
    </Form>
  );
}
