'use client';

import type { Recipe, SimulateResponse, VariantAvailability, VariantCost } from '@cantina/contracts';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Badge } from '../../../../../components/ui/badge';
import { Button, LinkButton } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../../components/ui/feedback';
import { CurrencyInput } from '../../../../../components/ui/currency-input';
import { Field } from '../../../../../components/ui/field';
import { Form } from '../../../../../components/ui/form';
import { QuantityInput } from '../../../../../components/ui/quantity-input';
import { recipesApi } from '../../../../../features/recipes/api';
import { RecipeEditor } from '../../../../../features/recipes/recipe-editor';
import { formatCents, formatPercent, formatQty } from '../../../../../lib/format';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Ficha técnica de uma variação.
 *
 * Três blocos, na ordem em que a pergunta aparece: quanto custa, quanto sobra
 * em cada canal, e do que é feito.
 */
export default function FichaPage() {
  const params = useParams<{ id: string }>();

  const cost = useApi<VariantCost>(`/variants/${params.id}/cost`);
  const recipe = useApi<Recipe>(`/variants/${params.id}/recipe`);
  const availability = useApi<VariantAvailability>(`/variants/${params.id}/availability`);

  if (cost.loading && !cost.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (cost.error || !cost.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Ficha técnica" back={{ href: '/painel/fichas', label: 'Fichas' }} />
        <Alert tone="danger" title="Produto não encontrado.">
          {cost.error?.message ?? 'Ele pode ter sido removido.'}
        </Alert>
      </div>
    );
  }

  const data = cost.data;
  // 404 na receita é o estado normal de quem ainda não montou a ficha, não erro.
  const hasRecipe = recipe.data !== null;

  function reloadAll() {
    cost.reload();
    recipe.reload();
    availability.reload();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={data.productName}
        description={data.variantName === 'Padrão' ? undefined : data.variantName}
        back={{ href: '/painel/fichas', label: 'Fichas técnicas' }}
      />

      {data.hasUnknownCost ? (
        <Alert tone="warning" title="O custo está subestimado.">
          Há insumo nesta receita que nunca foi comprado, e ele entra como zero. A margem
          abaixo aparece melhor do que é — registre a compra para o número ficar real.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Custo e margem"
          description="No canal padrão da sua empresa."
          {...(availability.data?.availableUnits !== undefined
            ? {
                action: (
                  <Badge tone={availability.data.availableUnits === 0 ? 'danger' : 'accent'}>
                    {availability.data.availableUnits === null
                      ? 'Sem limite'
                      : `${availability.data.availableUnits} disponíveis`}
                  </Badge>
                ),
              }
            : {})}
        />
        <CardBody className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-ink-muted">Preço</dt>
              <dd className="mt-0.5 text-lg font-medium text-ink" data-numeric>
                {formatCents(data.priceCents)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Custo</dt>
              <dd className="mt-0.5 text-lg text-ink" data-numeric>
                {formatCents(data.unitCostCents)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Margem</dt>
              <dd
                className="mt-0.5 text-lg font-medium text-success-700"
                data-numeric
              >
                {formatCents(data.marginCents)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">% sobre a venda</dt>
              <dd className="mt-0.5 text-lg text-ink" data-numeric>
                {formatPercent(data.marginPercent)}
              </dd>
            </div>
          </dl>

          {availability.data?.limitingSupplyName ? (
            <p className="border-t border-border pt-4 text-sm text-ink-muted">
              O insumo que limita a produção agora é{' '}
              <strong className="text-ink-soft">{availability.data.limitingSupplyName}</strong>.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {data.lines.length > 0 ? (
        <Card>
          <CardHeader
            title="De onde vem o custo"
            description={`Receita rende ${formatQty(data.yieldQty)} unidade(s) por ${formatCents(data.batchCostCents)}.`}
          />
          <CardBody>
            <ul className="space-y-3">
              {data.lines.map((line) => (
                <li key={line.supplyId}>
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {line.supplyName}
                      {line.costUnknown ? (
                        <span className="ml-2 text-warning-700">sem custo</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm text-ink-muted" data-numeric>
                      {formatQty(line.effectiveQty, line.unit)}
                    </span>
                    <span className="w-20 shrink-0 text-right text-sm font-medium text-ink" data-numeric>
                      {formatCents(line.costCents)}
                    </span>
                  </div>
                  {/* A barra mostra onde o dinheiro está: é a informação que
                      faz o lojista saber qual insumo negociar. */}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand-200">
                    <div
                      className="h-full rounded-full bg-clay-400"
                      style={{ width: `${Math.max(2, line.sharePercent)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Simulator variantId={params.id} priceCents={data.priceCents} />

      <Card>
        <CardHeader
          title="Receita"
          description="Os insumos e as quantidades que formam este produto."
        />
        <CardBody>
          {recipe.loading && !recipe.data && !recipe.error ? (
            <Skeleton className="h-32" />
          ) : (
            <RecipeEditor
              variantId={params.id}
              recipe={hasRecipe ? recipe.data : null}
              onSaved={reloadAll}
            />
          )}
        </CardBody>
      </Card>

      {hasRecipe ? <ProductionCard variantId={params.id} onDone={reloadAll} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Simulator({ variantId, priceCents }: { variantId: string; priceCents: number }) {
  const mutation = useMutation();
  const [price, setPrice] = useState(priceCents);
  const [target, setTarget] = useState(50);
  const [result, setResult] = useState<SimulateResponse | null>(null);

  async function run() {
    const response = await mutation.run(() =>
      recipesApi.simulate({ variantId, priceCents: price, targetMarginPercent: target }),
    );
    if (response) setResult(response);
  }

  return (
    <Card>
      <CardHeader
        title="Simulador de canais"
        description="Quanto sobra vendendo o mesmo produto em cada lugar."
      />
      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        <Form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          fieldErrors={mutation.fieldErrors}
          error={mutation.error}
          onSubmit={run}
        >
          <Field label="Preço de venda" error={mutation.fieldErrors['priceCents']}>
            {(props) => <CurrencyInput {...props} value={price} onValueChange={setPrice} />}
          </Field>
          <Field label="Margem desejada" error={mutation.fieldErrors['targetMarginPercent']}>
            {(props) => (
              <QuantityInput {...props} value={target} onValueChange={setTarget} unit="%" />
            )}
          </Field>
          <Button type="submit" variant="secondary" loading={mutation.submitting}>
            Simular
          </Button>
        </Form>

        {result ? (
          result.channels.length === 0 ? (
            <Alert tone="info">
              Nenhum canal cadastrado. Cadastre iFood, balcão ou vitrine própria para comparar.
            </Alert>
          ) : (
            <ul className="divide-y divide-border rounded-card border border-border">
              {result.channels.map((channel) => (
                <li key={channel.channelId} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">{channel.channelName}</p>
                    <p
                      className={
                        channel.marginCents > 0
                          ? 'font-medium text-success-700'
                          : 'font-medium text-danger-700'
                      }
                      data-numeric
                    >
                      {formatCents(channel.marginCents)} ({formatPercent(channel.marginPercent)})
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted" data-numeric>
                    Recebe {formatCents(channel.netRevenueCents)} · taxas{' '}
                    {formatCents(channel.channelFeesCents)} · custo{' '}
                    {formatCents(channel.unitCostCents)}
                  </p>
                  {channel.suggestedPriceCents ? (
                    <p className="mt-1 text-sm text-clay-700" data-numeric>
                      Para {target}% de margem, venderia a{' '}
                      {formatCents(channel.suggestedPriceCents)}.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}

        <LinkButton href="/painel/fichas/canais" variant="ghost" size="sm">
          Gerenciar canais
        </LinkButton>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function ProductionCard({ variantId, onDone }: { variantId: string; onDone: () => void }) {
  const mutation = useMutation();
  const [qty, setQty] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title="Registrar produção"
        description="Consome os insumos da receita e dá entrada no estoque do produto."
      />
      <CardBody className="space-y-4">
        {/* A API recusa produção de produto sob demanda e explica o porquê —
            a mensagem dela é melhor que qualquer aviso preventivo aqui. */}
        {mutation.error ? <Alert tone="warning">{mutation.error}</Alert> : null}
        {done ? <Alert tone="success">{done}</Alert> : null}

        <Form
          className="flex flex-wrap items-end gap-3"
          fieldErrors={mutation.fieldErrors}
          error={mutation.error}
          onSubmit={async () => {
            if (qty <= 0) return;
            const result = await mutation.run(() =>
              recipesApi.produce({ productVariantId: variantId, qty }),
            );
            if (result) {
              setDone(
                `${formatQty(result.qty)} unidade(s) produzidas. Estoque do produto: ${formatQty(result.qtyOnHandAfter)}.`,
              );
              setQty(0);
              onDone();
            }
          }}
        >
          <Field
            label="Quantidade produzida"
            error={mutation.fieldErrors['qty']}
            className="min-w-40 flex-1"
          >
            {(props) => (
              <QuantityInput {...props} value={qty} onValueChange={setQty} unit="unidades" />
            )}
          </Field>
          <Button
            type="submit"
            variant="secondary"
            disabled={qty <= 0}
            loading={mutation.submitting}
          >
            Registrar produção
          </Button>
        </Form>
      </CardBody>
    </Card>
  );
}
