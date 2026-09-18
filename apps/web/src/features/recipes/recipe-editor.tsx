'use client';

import type { Page as ApiPage, Recipe, Supply } from '@cantina/contracts';
import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Alert } from '../../components/ui/feedback';
import { Field, Select } from '../../components/ui/field';
import { QuantityInput } from '../../components/ui/quantity-input';
import { formatQty } from '../../lib/format';
import { useApi, useMutation } from '../../lib/use-api';
import { recipesApi } from './api';

interface EditorLine {
  supplyId: string;
  qty: number;
  wastePercent: number;
}

/**
 * Editor de ficha técnica.
 *
 * O rendimento é o campo que mais confunde e o que mais muda o resultado: as
 * quantidades são para a RECEITA INTEIRA, e o custo unitário é a divisão pelo
 * rendimento. A tela repete isso onde a dúvida aparece, e não num texto de
 * ajuda que ninguém lê.
 *
 * A perda entra como percentual porque é assim que a cozinha pensa: "sempre
 * sobra um pouco na tigela". Ela é consumo real, não margem de erro.
 */
export function RecipeEditor({
  variantId,
  recipe,
  onSaved,
}: {
  variantId: string;
  recipe: Recipe | null;
  onSaved: () => void;
}) {
  const supplies = useApi<ApiPage<Supply>>('/supplies?limit=200&active=true');
  const mutation = useMutation();

  const [yieldQty, setYieldQty] = useState(recipe?.yieldQty ?? 1);
  const [lines, setLines] = useState<EditorLine[]>(
    recipe?.items.map((item) => ({
      supplyId: item.supplyId,
      qty: item.qty,
      wastePercent: item.wastePercent,
    })) ?? [],
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setYieldQty(recipe?.yieldQty ?? 1);
    setLines(
      recipe?.items.map((item) => ({
        supplyId: item.supplyId,
        qty: item.qty,
        wastePercent: item.wastePercent,
      })) ?? [],
    );
  }, [recipe]);

  const available = supplies.data?.items ?? [];
  const used = new Set(lines.map((line) => line.supplyId));
  const unused = available.filter((supply) => !used.has(supply.id));

  function update(index: number, patch: Partial<EditorLine>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  async function save() {
    const result = await mutation.run(() =>
      recipesApi.putRecipe(variantId, {
        yieldQty,
        items: lines.map((line) => ({
          supplyId: line.supplyId,
          qty: line.qty,
          wastePercent: line.wastePercent,
        })),
      }),
    );

    if (result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    }
  }

  const invalid = lines.length === 0 || yieldQty <= 0 || lines.some((line) => line.qty <= 0);

  return (
    <div className="space-y-5">
      {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}
      {saved ? <Alert tone="success">Ficha técnica salva.</Alert> : null}

      <Field
        label="Rendimento da receita"
        hint="Quantas unidades saem de uma execução. As quantidades abaixo são para a receita inteira."
        error={mutation.fieldErrors['yieldQty']}
        className="max-w-xs"
      >
        {(props) => (
          <QuantityInput {...props} value={yieldQty} onValueChange={setYieldQty} unit="unidades" />
        )}
      </Field>

      {lines.length > 0 ? (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {lines.map((line, index) => {
            const supply = available.find((item) => item.id === line.supplyId);
            const effective = line.qty * (1 + line.wastePercent / 100);

            return (
              <li key={line.supplyId} className="space-y-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate font-medium text-ink">
                    {supply?.name ?? 'Insumo removido'}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger-700"
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  >
                    Remover
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Quantidade na receita"
                    error={mutation.fieldErrors[`items.${index}.qty`]}
                  >
                    {(props) => (
                      <QuantityInput
                        {...props}
                        value={line.qty}
                        onValueChange={(qty) => update(index, { qty })}
                        unit={supply?.usageUnit}
                      />
                    )}
                  </Field>
                  <Field
                    label="Perda"
                    hint="O que fica na tigela ou na forma."
                    error={mutation.fieldErrors[`items.${index}.wastePercent`]}
                  >
                    {(props) => (
                      <QuantityInput
                        {...props}
                        value={line.wastePercent}
                        onValueChange={(wastePercent) => update(index, { wastePercent })}
                        unit="%"
                      />
                    )}
                  </Field>
                </div>

                {line.wastePercent > 0 && supply ? (
                  <p className="text-sm text-ink-muted">
                    Consumo real: {formatQty(effective, supply.usageUnit)} — a perda entra no
                    custo porque é insumo que sai do estoque.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
          Nenhum insumo na receita. Adicione abaixo.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value=""
          onChange={(event) => {
            if (!event.target.value) return;
            setLines((current) => [
              ...current,
              { supplyId: event.target.value, qty: 0, wastePercent: 0 },
            ]);
          }}
          aria-label="Adicionar insumo"
          className="max-w-xs"
        >
          <option value="">Adicionar insumo…</option>
          {unused.map((supply) => (
            <option key={supply.id} value={supply.id}>
              {supply.name} ({supply.usageUnit})
            </option>
          ))}
        </Select>

        <Button
          variant="primary"
          className="ml-auto"
          disabled={invalid}
          loading={mutation.submitting}
          onClick={() => void save()}
        >
          Salvar ficha
        </Button>
      </div>

      {available.length === 0 && !supplies.loading ? (
        <Alert tone="warning">
          Nenhum insumo cadastrado ainda. Cadastre os ingredientes em Estoque antes de montar
          a receita.
        </Alert>
      ) : null}
    </div>
  );
}
