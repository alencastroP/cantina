'use client';

import type {
  Page as ApiPage,
  CustomerAddress,
  CustomerDetail,
  CustomerOrder,
} from '@cantina/contracts';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useSession } from '../../../../../components/auth-provider';
import { PageHeader } from '../../../../../components/layout/page-header';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../../components/ui/feedback';
import { Field, Input, Textarea } from '../../../../../components/ui/field';
import { customersApi, ORDER_STATUS_LABELS } from '../../../../../features/customers/api';
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatPhone,
} from '../../../../../lib/format';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Ficha do cliente.
 *
 * O histórico vem da view unificada: delivery e encomendas na mesma lista, na
 * ordem em que aconteceram. É a pergunta que o balcão faz — "o que essa
 * pessoa costuma pedir?" —, e ela não distingue os dois tipos.
 */
export default function ClientePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();

  const customer = useApi<CustomerDetail>(`/customers/${params.id}`);
  const orders = useApi<ApiPage<CustomerOrder>>(`/customers/${params.id}/orders?limit=20`);

  if (customer.loading && !customer.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (customer.error || !customer.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Cliente" back={{ href: '/painel/clientes', label: 'Clientes' }} />
        <Alert tone="danger" title="Cliente não encontrado.">
          {customer.error?.message ?? 'Ele pode ter sido removido.'}
        </Alert>
      </div>
    );
  }

  const data = customer.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={data.name}
        description={data.anonymizedAt ? undefined : formatPhone(data.phone)}
        back={{ href: '/painel/clientes', label: 'Clientes' }}
        {...(data.anonymizedAt
          ? { action: <Badge>Anonimizado</Badge> }
          : {})}
      />

      {data.anonymizedAt ? (
        <Alert tone="info" title="Dados pessoais removidos a pedido (LGPD)">
          Os pedidos foram preservados com o nome que tinham na hora da venda, para o
          histórico financeiro continuar fechando.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Resumo" />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-ink-muted">Pedidos</dt>
              <dd className="mt-0.5 text-lg font-medium text-ink" data-numeric>
                {data.ordersCount}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Total gasto</dt>
              <dd className="mt-0.5 text-lg font-medium text-ink" data-numeric>
                {formatCents(data.totalSpentCents)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Último pedido</dt>
              <dd className="mt-0.5 text-lg text-ink">
                {data.lastOrderAt ? formatDate(data.lastOrderAt) : '—'}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Histórico" description="Delivery e encomendas, juntos." />
        <CardBody>
          {orders.loading && !orders.data ? (
            <Skeleton className="h-24" />
          ) : orders.data && orders.data.items.length > 0 ? (
            <ul className="space-y-2.5">
              {orders.data.items.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0"
                >
                  <Link
                    href={
                      order.kind === 'delivery'
                        ? `/painel/pedidos/${order.id}`
                        : `/painel/encomendas/${order.id}`
                    }
                    className="min-w-0 flex-1"
                  >
                    <p className="text-sm text-ink">
                      <span data-numeric>#{order.code}</span>
                      {' · '}
                      {order.kind === 'delivery' ? 'Delivery' : 'Encomenda'}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      {' · '}
                      {formatDateTime(order.placedAt)}
                    </p>
                  </Link>
                  <span className="shrink-0 font-medium text-ink" data-numeric>
                    {formatCents(order.totalCents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">Nenhum pedido ainda.</p>
          )}
        </CardBody>
      </Card>

      <AddressesCard customerId={data.id} addresses={data.addresses} onChange={customer.reload} />

      {!data.anonymizedAt ? (
        <DetailsCard customer={data} onChange={customer.reload} />
      ) : null}

      {user?.role === 'owner' && !data.anonymizedAt ? (
        <AnonymizeCard customer={data} onDone={customer.reload} />
      ) : null}

      {!data.anonymizedAt ? (
        <RemoveCard
          customerId={data.id}
          onRemoved={() => router.replace('/painel/clientes')}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function AddressesCard({
  customerId,
  addresses,
  onChange,
}: {
  customerId: string;
  addresses: CustomerAddress[];
  onChange: () => void;
}) {
  const mutation = useMutation();
  const [adding, setAdding] = useState(false);
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [reference, setReference] = useState('');

  return (
    <Card>
      <CardHeader
        title="Endereços"
        action={
          !adding ? (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              Adicionar
            </Button>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        {addresses.length > 0 ? (
          <ul className="divide-y divide-border">
            {addresses.map((address) => (
              <li key={address.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {[address.street, address.number].filter(Boolean).join(', ')}
                    {address.complement ? ` — ${address.complement}` : ''}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {[address.neighborhood, address.city].filter(Boolean).join(' · ')}
                    {address.reference ? ` · ${address.reference}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {address.isDefault ? (
                    <Badge tone="accent">Principal</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (
                          await mutation.run(() =>
                            customersApi.updateAddress(customerId, address.id, {
                              isDefault: true,
                            }),
                          )
                        ) {
                          onChange();
                        }
                      }}
                    >
                      Tornar principal
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger-700"
                    onClick={async () => {
                      if (
                        await mutation.run(() =>
                          customersApi.removeAddress(customerId, address.id),
                        )
                      ) {
                        onChange();
                      }
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : !adding ? (
          <p className="text-sm text-ink-muted">
            Nenhum endereço salvo. Pedidos de entrega guardam o endereço informado na hora.
          </p>
        ) : null}

        {adding ? (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <Field label="Rua" error={mutation.fieldErrors['street']} required>
                {(props) => (
                  <Input
                    {...props}
                    autoFocus
                    value={street}
                    onChange={(event) => setStreet(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Número">
                {(props) => (
                  <Input
                    {...props}
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bairro">
                {(props) => (
                  <Input
                    {...props}
                    value={neighborhood}
                    onChange={(event) => setNeighborhood(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Referência">
                {(props) => (
                  <Input
                    {...props}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  mutation.reset();
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={street.trim().length < 3}
                loading={mutation.submitting}
                onClick={async () => {
                  if (
                    await mutation.run(() =>
                      customersApi.createAddress(customerId, {
                        street: street.trim(),
                        ...(number ? { number } : {}),
                        ...(neighborhood ? { neighborhood } : {}),
                        ...(reference ? { reference } : {}),
                        isDefault: addresses.length === 0,
                      }),
                    )
                  ) {
                    setAdding(false);
                    setStreet('');
                    setNumber('');
                    setNeighborhood('');
                    setReference('');
                    onChange();
                  }
                }}
              >
                Salvar endereço
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function DetailsCard({
  customer,
  onChange,
}: {
  customer: CustomerDetail;
  onChange: () => void;
}) {
  const mutation = useMutation();
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [email, setEmail] = useState(customer.email ?? '');
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(customer.name);
    setPhone(customer.phone);
    setEmail(customer.email ?? '');
    setNotes(customer.notes ?? '');
  }, [customer.id]);

  const dirty =
    name !== customer.name ||
    phone !== customer.phone ||
    email !== (customer.email ?? '') ||
    notes !== (customer.notes ?? '');

  return (
    <Card>
      <CardHeader title="Cadastro" />
      <CardBody className="space-y-5">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}
        {saved ? <Alert tone="success">Alterações salvas.</Alert> : null}

        <Field label="Nome" error={mutation.fieldErrors['name']}>
          {(props) => (
            <Input
              {...props}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <Field label="Telefone" error={mutation.fieldErrors['phone']}>
          {(props) => (
            <Input
              {...props}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </Field>

        <Field label="E-mail" error={mutation.fieldErrors['email']}>
          {(props) => (
            <Input
              {...props}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field label="Observações">
          {(props) => (
            <Textarea
              {...props}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          )}
        </Field>

        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={mutation.submitting}
            onClick={async () => {
              if (
                await mutation.run(() =>
                  customersApi.update(customer.id, {
                    name,
                    phone,
                    email: email || null,
                    notes: notes || null,
                  }),
                )
              ) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
                onChange();
              }
            }}
          >
            Salvar
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Anonimização (LGPD, D24).
 *
 * Só o dono vê esta ação. Não é regra de negócio escondida — é permissão: a
 * API recusa para os demais papéis, e mostrar um botão que sempre falha seria
 * pior que não mostrar.
 */
function AnonymizeCard({
  customer,
  onDone,
}: {
  customer: CustomerDetail;
  onDone: () => void;
}) {
  const mutation = useMutation();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <Card className="border-danger-500/30">
      <CardBody className="space-y-3">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        {confirming ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Apagar os dados pessoais de <strong>{customer.name}</strong>? Nome, telefone,
              e-mail, observações e endereços somem para sempre. Os pedidos ficam, com o nome
              que tinham na hora da venda.
            </p>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo (opcional): pedido do titular…"
              aria-label="Motivo"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={mutation.submitting}
                onClick={async () => {
                  if (
                    await mutation.run(() =>
                      customersApi.anonymize(customer.id, reason || undefined),
                    )
                  ) {
                    setConfirming(false);
                    onDone();
                  }
                }}
              >
                Anonimizar definitivamente
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Anonimizar (LGPD)</p>
              <p className="text-sm text-ink-muted">
                Para quando o cliente pede a exclusão dos dados dele. Irreversível.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-700"
              onClick={() => setConfirming(true)}
            >
              Anonimizar
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RemoveCard({
  customerId,
  onRemoved,
}: {
  customerId: string;
  onRemoved: () => void;
}) {
  const mutation = useMutation();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <CardBody>
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink">Remover este cliente da lista?</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Não
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={mutation.submitting}
              onClick={async () => {
                if (await mutation.run(() => customersApi.remove(customerId))) onRemoved();
              }}
            >
              Remover
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Remover da lista</p>
              <p className="text-sm text-ink-muted">
                Some da busca. Os dados e o histórico continuam guardados — para apagar de
                verdade, use a anonimização.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-700"
              onClick={() => setConfirming(true)}
            >
              Remover
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
