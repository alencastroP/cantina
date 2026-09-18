'use client';

import type { Variant } from '@cantina/contracts';
import { useState } from 'react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { CurrencyInput } from '../../components/ui/currency-input';
import { Alert } from '../../components/ui/feedback';
import { Field, Input } from '../../components/ui/field';
import { Form } from '../../components/ui/form';
import { formatCents } from '../../lib/format';
import { useMutation } from '../../lib/use-api';
import { catalogApi } from './api';

/**
 * Editor de variações.
 *
 * Todo produto tem ao menos uma (P13), e a API recusa remover a última. Em vez
 * de esconder o botão, deixamos a API recusar e mostramos a mensagem dela —
 * ela explica o porquê e sugere o que fazer, e duplicar essa regra aqui seria
 * a segunda cópia de uma verdade que só o servidor pode garantir.
 */
export function VariantEditor({
  productId,
  variants,
  onChange,
}: {
  productId: string;
  variants: Variant[];
  onChange: () => void;
}) {
  const mutation = useMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function run(action: () => Promise<unknown>) {
    const result = await mutation.run(action);
    if (result !== null) {
      setEditingId(null);
      setAdding(false);
      onChange();
    }
  }

  return (
    <div className="space-y-3">
      {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {variants.map((variant) =>
          editingId === variant.id ? (
            <li key={variant.id} className="p-4">
              <VariantForm
                initial={variant}
                submitting={mutation.submitting}
                fieldErrors={mutation.fieldErrors}
                onCancel={() => {
                  setEditingId(null);
                  mutation.reset();
                }}
                onSubmit={(values) =>
                  run(() => catalogApi.updateVariant(variant.id, values))
                }
              />
            </li>
          ) : (
            <li key={variant.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-ink">{variant.name}</p>
                  {variant.isDefault ? <Badge tone="accent">Padrão</Badge> : null}
                  {!variant.active ? <Badge>Inativa</Badge> : null}
                </div>
                {variant.sku ? (
                  <p className="mt-0.5 text-sm text-ink-muted">SKU {variant.sku}</p>
                ) : null}
              </div>

              <p className="shrink-0 font-medium text-ink" data-numeric>
                {formatCents(variant.priceCents)}
              </p>

              <div className="flex shrink-0 gap-1">
                {!variant.isDefault ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void run(() => catalogApi.updateVariant(variant.id, { isDefault: true }))
                    }
                    title="Tornar esta a variação padrão"
                  >
                    Tornar padrão
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setEditingId(variant.id)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger-700"
                  onClick={() => void run(() => catalogApi.removeVariant(variant.id))}
                >
                  Remover
                </Button>
              </div>
            </li>
          ),
        )}

        {adding ? (
          <li className="p-4">
            <VariantForm
              submitting={mutation.submitting}
              fieldErrors={mutation.fieldErrors}
              onCancel={() => {
                setAdding(false);
                mutation.reset();
              }}
              onSubmit={(values) =>
                run(() =>
                  catalogApi.createVariant(productId, {
                    name: values.name ?? 'Nova variação',
                    priceCents: values.priceCents ?? 0,
                    ...(values.sku ? { sku: values.sku } : {}),
                  }),
                )
              }
            />
          </li>
        ) : null}
      </ul>

      {!adding ? (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          Adicionar variação
        </Button>
      ) : null}
    </div>
  );
}

interface VariantValues {
  name?: string;
  priceCents?: number;
  sku?: string | null;
}

function VariantForm({
  initial,
  submitting,
  fieldErrors,
  onCancel,
  onSubmit,
}: {
  initial?: Variant;
  submitting: boolean;
  fieldErrors: Record<string, string>;
  onCancel: () => void;
  onSubmit: (values: VariantValues) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [priceCents, setPriceCents] = useState(initial?.priceCents ?? 0);
  const [sku, setSku] = useState(initial?.sku ?? '');

  // Rótulo visível em vez de placeholder: o texto de exemplo some ao começar
  // a digitar, e com ele a única pista do que o campo pedia.
  return (
    <Form
      className="space-y-3"
      fieldErrors={fieldErrors}
      onSubmit={() =>
        onSubmit({
          name: name.trim() || 'Padrão',
          priceCents,
          sku: sku.trim() || null,
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label="Nome da variação" error={fieldErrors['name']}>
          {(props) => (
            <Input
              {...props}
              autoFocus
              autoComplete="off"
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="P, M, G, Fatia…"
            />
          )}
        </Field>
        <Field label="Preço" error={fieldErrors['priceCents']}>
          {(props) => (
            <CurrencyInput {...props} value={priceCents} onValueChange={setPriceCents} />
          )}
        </Field>
      </div>

      <Field
        label="SKU"
        hint="Opcional. O código que você usa no caixa ou na etiqueta."
        error={fieldErrors['sku']}
      >
        {(props) => (
          <Input
            {...props}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={40}
            value={sku}
            onChange={(event) => setSku(event.target.value)}
          />
        )}
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={submitting}>
          Salvar
        </Button>
      </div>
    </Form>
  );
}
