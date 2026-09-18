'use client';

import type { Recipe } from '@cantina/contracts';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Skeleton } from '../../components/ui/feedback';
import { Field, Select } from '../../components/ui/field';
import { Form, FormActions, FormErrors } from '../../components/ui/form';
import { formatCents, formatQty } from '../../lib/format';
import { useApi, useMutation } from '../../lib/use-api';
import { copyRecipe } from './api';
import { useRecipeSources } from './cost-summary';

export interface RecipeImportTarget {
  variantId: string;
  label: string;
  hasRecipe: boolean;
}

/**
 * "Puxar" a ficha técnica de outro produto.
 *
 * A prévia mostra a receita que vai ser copiada e quanto ela custa HOJE — o
 * número sai do servidor, pelo mesmo cálculo da ficha. Substituir uma ficha
 * existente é avisado antes, não descoberto depois.
 */
export function RecipeImportDialog({
  target,
  onClose,
  onImported,
}: {
  target: RecipeImportTarget | null;
  onClose: () => void;
  onImported: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title="Copiar ficha técnica"
      description={target ? `Para ${target.label}.` : undefined}
    >
      {target ? (
        <ImportForm target={target} onCancel={onClose} onImported={onImported} />
      ) : null}
    </Dialog>
  );
}

function ImportForm({
  target,
  onCancel,
  onImported,
}: {
  target: RecipeImportTarget;
  onCancel: () => void;
  onImported: () => void;
}) {
  const { sources, loading, error } = useRecipeSources(true, target.variantId);
  const [sourceId, setSourceId] = useState('');
  const recipe = useApi<Recipe>(sourceId ? `/variants/${sourceId}/recipe` : null);
  const mutation = useMutation();

  const source = sources.find((item) => item.variantId === sourceId);

  return (
    <Form
      className="space-y-4"
      fieldErrors={mutation.fieldErrors}
      error={mutation.error}
      onSubmit={async () => {
        if (!sourceId) return;
        if (await mutation.run(() => copyRecipe(sourceId, target.variantId))) onImported();
      }}
    >
      <FormErrors error={mutation.error} fieldErrors={mutation.fieldErrors} />
      {error ? <Alert tone="danger">{error.message}</Alert> : null}

      <Field label="Copiar de" hint="Só aparecem os produtos que já têm ficha técnica.">
        {(props) => (
          <Select
            {...props}
            autoFocus
            disabled={loading}
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            <option value="">
              {loading
                ? 'Carregando…'
                : sources.length > 0
                  ? 'Escolha um produto…'
                  : 'Nenhum produto com ficha ainda'}
            </option>
            {sources.map((item) => (
              <option key={item.variantId} value={item.variantId}>
                {item.label} — {formatCents(item.unitCostCents)} por unidade
              </option>
            ))}
          </Select>
        )}
      </Field>

      {sourceId ? (
        recipe.loading && !recipe.data ? (
          <Skeleton className="h-28" />
        ) : recipe.data ? (
          <div className="rounded-card border border-border bg-sand-50 p-4">
            <p className="text-sm text-ink-soft">
              Rende <strong data-numeric>{formatQty(recipe.data.yieldQty)}</strong> unidade(s)
              {source ? (
                <>
                  {' '}· custo hoje{' '}
                  <strong data-numeric>{formatCents(source.unitCostCents)}</strong> por unidade
                </>
              ) : null}
              .
            </p>
            <ul className="mt-3 divide-y divide-border text-sm">
              {recipe.data.items.map((item) => (
                <li key={item.supplyId} className="flex items-baseline gap-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-ink">{item.supplyName}</span>
                  <span className="shrink-0 text-ink-muted" data-numeric>
                    {formatQty(item.qty, item.unit)}
                    {item.wastePercent > 0 ? ` + ${formatQty(item.wastePercent)}%` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {source?.hasUnknownCost ? (
              <p className="mt-3 text-sm text-warning-700">
                Há insumo sem compra registrada nesta receita — o custo está subestimado.
              </p>
            ) : null}
          </div>
        ) : null
      ) : null}

      {target.hasRecipe ? (
        <Alert tone="warning">
          A ficha atual de {target.label} será substituída. As quantidades podem ser
          ajustadas depois, na própria ficha.
        </Alert>
      ) : null}

      <FormActions className="border-t border-border pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!sourceId || !recipe.data}
          loading={mutation.submitting}
        >
          Copiar ficha
        </Button>
      </FormActions>
    </Form>
  );
}
