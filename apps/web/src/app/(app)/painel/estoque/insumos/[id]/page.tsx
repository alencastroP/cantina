'use client';

import type { Page as ApiPage, StockMovement, Supply, SupplyPurchase } from '@cantina/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PageHeader } from '../../../../../../components/layout/page-header';
import { Badge } from '../../../../../../components/ui/badge';
import { Button, LinkButton } from '../../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../../../components/ui/feedback';
import { Field, Input, Select } from '../../../../../../components/ui/field';
import { QuantityInput } from '../../../../../../components/ui/quantity-input';
import {
  INBOUND_MOVEMENTS,
  MOVEMENT_TYPE_LABELS,
  PURCHASE_UNIT_LABELS,
  inventoryApi,
} from '../../../../../../features/inventory/api';
import { StockActions } from '../../../../../../features/inventory/stock-actions';
import { cn } from '../../../../../../lib/cn';
import { formatCents, formatDate, formatQty } from '../../../../../../lib/format';
import { useApi, useMutation } from '../../../../../../lib/use-api';

/**
 * Detalhe do insumo.
 *
 * O custo médio aparece com quatro casas porque ele é fracionário por
 * natureza: 1 g de farinha custa 0,2 centavo, e arredondar para o centavo
 * aqui esconderia a diferença entre um insumo barato e um muito barato — que
 * é justamente o que muda a margem quando multiplicado por mil.
 */
export default function InsumoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const supply = useApi<Supply>(`/supplies/${params.id}`);
  const purchases = useApi<ApiPage<SupplyPurchase>>(
    `/supply-purchases?supplyId=${params.id}&limit=10`,
  );
  const movements = useApi<ApiPage<StockMovement>>(
    `/stock/movements?kind=supply&refId=${params.id}&limit=15`,
  );

  if (supply.loading && !supply.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (supply.error || !supply.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Insumo" back={{ href: '/painel/estoque', label: 'Estoque' }} />
        <Alert tone="danger" title="Insumo não encontrado.">
          {supply.error?.message ?? 'Ele pode ter sido removido.'}
        </Alert>
      </div>
    );
  }

  const data = supply.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={data.name}
        description={`Medido em ${data.usageUnit}`}
        back={{ href: '/painel/estoque', label: 'Estoque' }}
        action={
          <LinkButton
            href={`/painel/estoque/compras/nova?supplyId=${data.id}`}
            variant="primary"
            size="sm"
          >
            Registrar compra
          </LinkButton>
        }
      />

      <Card>
        <CardHeader
          title="Saldo e custo"
          {...(data.isLow ? { action: <Badge tone="warning">Estoque baixo</Badge> } : {})}
        />
        <CardBody>
          <dl
            className={
              data.avgUnitCost === undefined
                ? 'grid gap-x-6 gap-y-4 sm:grid-cols-2'
                : 'grid gap-x-6 gap-y-4 sm:grid-cols-3'
            }
          >
            <div>
              <dt className="text-sm text-ink-muted">Disponível</dt>
              <dd className="mt-0.5 text-lg font-medium text-ink" data-numeric>
                {formatQty(data.qtyAvailable, data.usageUnit)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Reservado</dt>
              <dd className="mt-0.5 text-lg text-ink-soft" data-numeric>
                {formatQty(data.qtyReserved, data.usageUnit)}
              </dd>
            </div>
            {/* Custo médio só chega para gestão e financeiro: a API corta o
                campo da resposta dos demais papéis. */}
            {data.avgUnitCost !== undefined ? (
              <div>
                <dt className="text-sm text-ink-muted">Custo médio</dt>
                <dd className="mt-0.5 text-lg text-ink" data-numeric>
                  {data.avgUnitCost > 0 ? (
                    <>
                      {formatCents(data.avgUnitCost)}
                      <span className="text-sm text-ink-muted"> / {data.usageUnit}</span>
                    </>
                  ) : (
                    <span className="text-base text-warning-700">sem compra</span>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>

          {data.avgUnitCost !== undefined && data.avgUnitCost <= 0 ? (
            <Alert tone="warning" className="mt-4">
              Sem compra registrada, este insumo entra com custo zero nas fichas técnicas — e
              a margem dos produtos que o usam aparece melhor do que é.
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Corrigir estoque" />
        <StockActions
          item={{
            kind: 'supply',
            refId: data.id,
            refName: data.name,
            unit: data.usageUnit,
            qtyOnHand: data.qtyOnHand,
            qtyReserved: data.qtyReserved,
            qtyAvailable: data.qtyAvailable,
            minStockQty: data.minStockQty,
            isLow: data.isLow,
            updatedAt: new Date().toISOString(),
          }}
          onDone={() => {
            supply.reload();
            movements.reload();
          }}
        />
      </Card>

      <Card>
        <CardHeader title="Últimas compras" description="É delas que sai o custo médio." />
        <CardBody>
          {purchases.data && purchases.data.items.length > 0 ? (
            <ul className="space-y-3">
              {purchases.data.items.map((purchase) => (
                <li
                  key={purchase.id}
                  className="flex items-center gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      {formatQty(purchase.purchaseQty)}{' '}
                      {PURCHASE_UNIT_LABELS[purchase.purchaseUnit] ?? purchase.purchaseUnit}
                      {purchase.supplierName ? ` · ${purchase.supplierName}` : ''}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {formatDate(purchase.purchasedAt)}
                      {purchase.unitCost !== undefined
                        ? ` · ${formatCents(purchase.unitCost)} por ${data.usageUnit}`
                        : ''}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium text-ink" data-numeric>
                    {formatCents(purchase.totalCents)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              Nenhuma compra registrada. É ela que define o custo deste insumo.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Movimentos" />
        <CardBody>
          {movements.data && movements.data.items.length > 0 ? (
            <ul className="space-y-2.5">
              {movements.data.items.map((movement) => {
                const inbound = INBOUND_MOVEMENTS.has(movement.type);
                return (
                  <li key={movement.id} className="flex items-baseline gap-3 text-sm">
                    <span
                      className={cn(
                        'w-20 shrink-0 text-right font-medium',
                        inbound ? 'text-success-700' : 'text-ink',
                      )}
                      data-numeric
                    >
                      {inbound ? '+' : ''}
                      {formatQty(movement.qtyDelta)}
                    </span>
                    <span className="min-w-0 flex-1 text-ink-soft">
                      {MOVEMENT_TYPE_LABELS[movement.type] ?? movement.type}
                      {movement.reason ? ` — ${movement.reason}` : ''}
                    </span>
                    <span className="shrink-0 text-ink-muted" data-numeric>
                      {formatDate(movement.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">Nenhum movimento ainda.</p>
          )}
        </CardBody>
      </Card>

      <SupplySettings supply={data} onChange={supply.reload} onRemoved={() => router.replace('/painel/estoque')} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SupplySettings({
  supply,
  onChange,
  onRemoved,
}: {
  supply: Supply;
  onChange: () => void;
  onRemoved: () => void;
}) {
  const mutation = useMutation();
  const [name, setName] = useState(supply.name);
  const [type, setType] = useState(supply.type);
  const [minStockQty, setMinStockQty] = useState(supply.minStockQty);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setName(supply.name);
    setType(supply.type);
    setMinStockQty(supply.minStockQty);
  }, [supply.id]);

  const dirty =
    name !== supply.name || type !== supply.type || minStockQty !== supply.minStockQty;

  return (
    <Card>
      <CardHeader title="Cadastro" />
      <CardBody className="space-y-5">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}
        {saved ? <Alert tone="success">Alterações salvas.</Alert> : null}

        <Field label="Nome" error={mutation.fieldErrors['name']}>
          {(props) => (
            <Input {...props} value={name} onChange={(event) => setName(event.target.value)} />
          )}
        </Field>

        <Field label="Tipo">
          {(props) => (
            <Select
              {...props}
              value={type}
              onChange={(event) => setType(event.target.value as Supply['type'])}
            >
              <option value="ingredient">Ingrediente</option>
              <option value="packaging">Embalagem</option>
            </Select>
          )}
        </Field>

        <Field label="Estoque mínimo">
          {(props) => (
            <QuantityInput
              {...props}
              value={minStockQty}
              onValueChange={setMinStockQty}
              unit={supply.usageUnit}
            />
          )}
        </Field>

        <div className="flex items-center justify-between gap-3">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink">Remover este insumo?</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Não
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={mutation.submitting}
                onClick={async () => {
                  if (await mutation.run(() => inventoryApi.removeSupply(supply.id))) {
                    onRemoved();
                  } else {
                    setConfirming(false);
                  }
                }}
              >
                Remover
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-700"
              onClick={() => setConfirming(true)}
            >
              Remover insumo
            </Button>
          )}

          <Button
            variant="primary"
            disabled={!dirty}
            loading={mutation.submitting}
            onClick={async () => {
              if (
                await mutation.run(() =>
                  inventoryApi.updateSupply(supply.id, { name, type, minStockQty }),
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
