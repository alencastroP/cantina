'use client';

import type { Page as ApiPage, PurchaseUnit, Supplier, Supply } from '@cantina/contracts';
import { defaultConversionFactor } from '@cantina/domain';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { PageHeader } from '../../../../../../components/layout/page-header';
import { Button } from '../../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../../components/ui/card';
import { CurrencyInput } from '../../../../../../components/ui/currency-input';
import { Field, Input, Select, Textarea } from '../../../../../../components/ui/field';
import { Form, FormActions, FormErrors } from '../../../../../../components/ui/form';
import { QuantityInput } from '../../../../../../components/ui/quantity-input';
import {
  PACKAGED_UNITS,
  PURCHASE_UNIT_LABELS,
  inventoryApi,
} from '../../../../../../features/inventory/api';
import { formatCents, formatQty } from '../../../../../../lib/format';
import { useApi, useMutation } from '../../../../../../lib/use-api';

/**
 * Registro de compra.
 *
 * É a tela que faz o custo do cardápio existir: ela dá entrada no estoque e
 * recalcula o custo médio ponderado do insumo, na mesma transação (D11).
 *
 * A prévia do custo por unidade aparece enquanto se digita, e é o momento em
 * que o lojista costuma descobrir quanto custa de verdade um grama de farinha.
 */
export default function NovaCompraPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mutation = useMutation();

  const supplies = useApi<ApiPage<Supply>>('/supplies?limit=200&active=true');
  const suppliers = useApi<ApiPage<Supplier>>('/suppliers?limit=100');

  const [supplyId, setSupplyId] = useState(searchParams.get('supplyId') ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState(0);
  const [purchaseUnit, setPurchaseUnit] = useState<PurchaseUnit>('kg');
  const [conversionFactor, setConversionFactor] = useState(0);
  const [totalCents, setTotalCents] = useState(0);
  const [invoiceRef, setInvoiceRef] = useState('');
  const [note, setNote] = useState('');

  const supply = supplies.data?.items.find((item) => item.id === supplyId) ?? null;

  // A mesma função que o servidor usa para decidir se a conversão é conhecida.
  const fixedFactor = supply
    ? defaultConversionFactor(purchaseUnit, supply.usageUnit)
    : null;
  const needsFactor = PACKAGED_UNITS.has(purchaseUnit) || fixedFactor === null;
  const factor = fixedFactor ?? conversionFactor;

  const preview = useMemo(() => {
    if (!supply || purchaseQty <= 0 || factor <= 0 || totalCents <= 0) return null;

    const usageQty = purchaseQty * factor;
    return { usageQty, unitCost: totalCents / usageQty };
  }, [supply, purchaseQty, factor, totalCents]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const created = await mutation.run(() =>
      inventoryApi.createPurchase({
        supplyId,
        ...(supplierId ? { supplierId } : {}),
        purchaseQty,
        purchaseUnit,
        ...(needsFactor ? { conversionFactor } : {}),
        totalCents,
        ...(invoiceRef ? { invoiceRef } : {}),
        ...(note ? { note } : {}),
      }),
    );

    if (created) router.replace(`/painel/estoque/insumos/${supplyId}`);
  }

  const canSubmit = supplyId && purchaseQty > 0 && totalCents > 0 && factor > 0;

  // O que falta, dito por extenso ao lado do botão desabilitado.
  const missing = !supplyId
    ? 'Escolha o insumo.'
    : purchaseQty <= 0
      ? 'Informe a quantidade comprada.'
      : factor <= 0
        ? 'Informe quanto vem em cada embalagem.'
        : totalCents <= 0
          ? 'Informe o valor pago.'
          : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Registrar compra"
        description="Dá entrada no estoque e atualiza o custo do insumo."
        back={{ href: '/painel/estoque', label: 'Estoque' }}
      />

      <Form
        onSubmit={handleSubmit}
        fieldErrors={mutation.fieldErrors}
        error={mutation.error}
        className="space-y-6"
      >
        <FormErrors
          error={mutation.error}
          fieldErrors={mutation.fieldErrors}
          labels={{
            supplyId: 'Insumo',
            purchaseQty: 'Quantidade comprada',
            purchaseUnit: 'Unidade de compra',
            conversionFactor: 'Conteúdo da embalagem',
            totalCents: 'Valor total pago',
          }}
        />

        <Card>
          <CardBody className="space-y-5">
            <Field label="Insumo" error={mutation.fieldErrors['supplyId']} required>
              {(props) => (
                <Select
                  {...props}
                  required
                  value={supplyId}
                  onChange={(event) => setSupplyId(event.target.value)}
                >
                  <option value="">Escolha o insumo…</option>
                  {supplies.data?.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.usageUnit})
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Fornecedor">
              {(props) => (
                <Select
                  {...props}
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                >
                  <option value="">Não informar</option>
                  {suppliers.data?.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantidade comprada" error={mutation.fieldErrors['purchaseQty']} required>
                {(props) => (
                  <QuantityInput
                    {...props}
                    value={purchaseQty}
                    onValueChange={setPurchaseQty}
                    placeholder="5"
                  />
                )}
              </Field>

              <Field label="Unidade de compra" required>
                {(props) => (
                  <Select
                    {...props}
                    value={purchaseUnit}
                    onChange={(event) => setPurchaseUnit(event.target.value as PurchaseUnit)}
                  >
                    {Object.entries(PURCHASE_UNIT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            {supply && needsFactor ? (
              <Field
                label={`Quantas ${supply.usageUnit} vêm em 1 ${PURCHASE_UNIT_LABELS[purchaseUnit]?.split(' ')[0]}`}
                hint="Sem isso não dá para saber quanto custa cada unidade de uso."
                error={mutation.fieldErrors['conversionFactor']}
                required
              >
                {(props) => (
                  <QuantityInput
                    {...props}
                    value={conversionFactor}
                    onValueChange={setConversionFactor}
                    unit={supply.usageUnit}
                    placeholder="500"
                  />
                )}
              </Field>
            ) : null}

            <Field label="Valor total pago" error={mutation.fieldErrors['totalCents']} required>
              {(props) => (
                <CurrencyInput
                  {...props}
                  value={totalCents}
                  onValueChange={setTotalCents}
                  invalid={Boolean(mutation.fieldErrors['totalCents'])}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        {preview && supply ? (
          <Card className="border-olive-300 bg-olive-50/60">
            <CardHeader title="O que esta compra faz" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-ink-muted">Entra no estoque</dt>
                  <dd className="mt-0.5 text-lg font-medium text-ink" data-numeric>
                    {formatQty(preview.usageQty, supply.usageUnit)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">Custo desta compra</dt>
                  <dd className="mt-0.5 text-lg font-medium text-ink" data-numeric>
                    {formatCents(preview.unitCost)}
                    <span className="text-sm text-ink-muted"> por {supply.usageUnit}</span>
                  </dd>
                </div>
              </dl>

              {supply.avgUnitCost !== undefined && supply.avgUnitCost > 0 ? (
                <p className="mt-4 text-sm text-ink-soft">
                  O custo médio atual é {formatCents(supply.avgUnitCost)} por{' '}
                  {supply.usageUnit}. Depois desta compra ele fica entre os dois valores,
                  ponderado pela quantidade que você já tinha.
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Referência" />
          <CardBody className="space-y-4">
            <Field label="Nota fiscal ou pedido">
              {(props) => (
                <Input
                  {...props}
                  value={invoiceRef}
                  onChange={(event) => setInvoiceRef(event.target.value)}
                  placeholder="NF 12345"
                />
              )}
            </Field>
            <Field label="Observação">
              {(props) => (
                <Textarea
                  {...props}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <FormActions sticky hint={missing}>
          <Button variant="ghost" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            loading={mutation.submitting}
          >
            Registrar compra
          </Button>
        </FormActions>
      </Form>
    </div>
  );
}
