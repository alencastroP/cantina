'use client';

import type { ProductCosting } from '@cantina/contracts';
import { useState } from 'react';

import { Badge } from '../../components/ui/badge';
import { Button, LinkButton } from '../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { Alert, Skeleton } from '../../components/ui/feedback';
import { cn } from '../../lib/cn';
import { formatCents, formatPercent, formatQty } from '../../lib/format';
import { useApi } from '../../lib/use-api';
import { RecipeImportDialog, type RecipeImportTarget } from './recipe-import-dialog';

type VariantCosting = ProductCosting['variants'][number];

/**
 * Ficha técnica e custo, dentro do produto.
 *
 * O lojista pensa no produto, não na variação: "quanto me custa o bolo de
 * cenoura?". Este bloco puxa a receita de cada variação já com o custo e a
 * margem calculados no servidor, e dá os dois caminhos para quem ainda não
 * tem ficha — montar do zero ou copiar a de um produto parecido.
 *
 * Só aparece para gestão. A API recusa a rota para os outros papéis e ainda
 * corta custo de qualquer resposta que chegue a eles; esconder aqui é só não
 * mostrar um cartão que sempre falharia.
 */
export function ProductCostingCard({ productId }: { productId: string }) {
  const costing = useApi<ProductCosting>(`/products/${productId}/costing`);
  const [importing, setImporting] = useState<RecipeImportTarget | null>(null);

  const data = costing.data;
  const single = data?.variants.length === 1;

  return (
    <Card>
      <CardHeader
        title="Ficha técnica e custo"
        description={
          data
            ? data.channelName
              ? `Margem no canal padrão: ${data.channelName}.`
              : 'Sem canal padrão cadastrado: a margem sai sem taxa nenhuma.'
            : 'A receita de cada variação, com o custo de hoje.'
        }
        action={<Badge tone="neutral">Só gestão</Badge>}
      />
      <CardBody className="space-y-3">
        {costing.error ? (
          <Alert tone="danger" title="Não foi possível calcular o custo.">
            {costing.error.message}
          </Alert>
        ) : null}

        {costing.loading && !data ? <Skeleton className="h-36" /> : null}

        {data?.variants.map((variant) => (
          <VariantCostingBlock
            key={variant.variantId}
            variant={variant}
            title={single && variant.variantName === 'Padrão' ? 'Receita' : variant.variantName}
            onImport={() =>
              setImporting({
                variantId: variant.variantId,
                label:
                  variant.variantName === 'Padrão'
                    ? variant.productName
                    : `${variant.productName} (${variant.variantName})`,
                hasRecipe: variant.hasRecipe,
              })
            }
          />
        ))}
      </CardBody>

      <RecipeImportDialog
        target={importing}
        onClose={() => setImporting(null)}
        onImported={() => {
          setImporting(null);
          costing.reload();
        }}
      />
    </Card>
  );
}

function VariantCostingBlock({
  variant,
  title,
  onImport,
}: {
  variant: VariantCosting;
  title: string;
  onImport: () => void;
}) {
  return (
    <section className="rounded-card border border-border bg-sand-50/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-sans text-sm font-medium text-ink">{title}</h3>
        {!variant.active ? <Badge>Inativa</Badge> : null}
        {!variant.hasRecipe ? (
          <Badge tone="warning">Sem ficha</Badge>
        ) : variant.hasUnknownCost ? (
          <Badge tone="warning">Custo subestimado</Badge>
        ) : null}
      </div>

      {variant.hasRecipe ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Stat label="Preço" value={formatCents(variant.priceCents)} />
            <Stat label="Custo por unidade" value={formatCents(variant.unitCostCents)} />
            <Stat
              label="Sobra por unidade"
              value={formatCents(variant.marginCents)}
              tone={variant.marginCents > 0 ? 'good' : 'bad'}
            />
            <Stat label="% da venda" value={formatPercent(variant.marginPercent)} />
          </dl>

          <details className="group mt-3 border-t border-border pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-clay-700 [&::-webkit-details-marker]:hidden">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="transition-transform group-open:rotate-90"
              >
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ver receita · {variant.lines.length} insumo(s) · rende{' '}
              {formatQty(variant.yieldQty)} un. por {formatCents(variant.batchCostCents)}
            </summary>

            <ul className="mt-3 space-y-2.5">
              {variant.lines.map((line) => (
                <li key={line.supplyId}>
                  <div className="flex items-baseline gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {line.supplyName}
                      {line.costUnknown ? (
                        <span className="ml-2 text-warning-700">sem compra</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-ink-muted" data-numeric>
                      {formatQty(line.effectiveQty, line.unit)}
                    </span>
                    <span className="w-20 shrink-0 text-right font-medium text-ink" data-numeric>
                      {formatCents(line.costCents)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand-200">
                    <div
                      className="h-full rounded-full bg-clay-400"
                      style={{ width: `${Math.max(2, line.sharePercent)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          Sem receita, o custo entra como zero e a margem aparece cheia — melhor do que é.
          Monte a ficha, ou copie a de um produto parecido e ajuste as quantidades.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href={`/painel/fichas/${variant.variantId}`} variant="secondary" size="sm">
          {variant.hasRecipe ? 'Abrir ficha' : 'Montar ficha'}
        </LinkButton>
        <Button variant="ghost" size="sm" onClick={onImport}>
          Copiar de outro produto
        </Button>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd
        data-numeric
        className={cn(
          'mt-0.5 font-medium',
          tone === 'good' ? 'text-success-700' : tone === 'bad' ? 'text-danger-700' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
