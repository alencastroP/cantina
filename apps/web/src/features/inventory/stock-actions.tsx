'use client';

import type { StockBalance } from '@cantina/contracts';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/field';
import { Form, FormActions, FormErrors } from '../../components/ui/form';
import { QuantityInput } from '../../components/ui/quantity-input';
import { cn } from '../../lib/cn';
import { formatQty } from '../../lib/format';
import { useMutation } from '../../lib/use-api';
import { inventoryApi } from './api';

/**
 * Ajuste e perda, no próprio item da lista.
 *
 * São duas ações diferentes de propósito, e a tela precisa deixar isso claro:
 *
 *   Ajuste  "recontei e o saldo estava errado" — informa o saldo CORRETO, e a
 *           tela calcula a diferença. Pedir a diferença seria pedir uma conta
 *           de cabeça no meio da contagem.
 *   Perda   "quebrei três ovos" — informa quanto se perdeu.
 *
 * O relatório de custos distingue as duas, então a tela não pode misturá-las
 * num campo só. É um formulário de verdade: Enter confirma, e o botão
 * desabilitado diz o que falta em vez de só ficar cinza.
 */
export function StockActions({
  item,
  onDone,
}: {
  item: StockBalance;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'adjust' | 'loss'>('adjust');
  const [counted, setCounted] = useState(item.qtyOnHand);
  const [lossQty, setLossQty] = useState(0);
  const [reason, setReason] = useState('');
  const mutation = useMutation();

  const delta = counted - item.qtyOnHand;
  const invalid = mode === 'adjust' ? delta === 0 : lossQty <= 0;
  const reasonMissing = reason.trim().length < 3;

  async function submit() {
    if (invalid || reasonMissing) return;

    const action =
      mode === 'adjust'
        ? () =>
            inventoryApi.adjust({
              kind: item.kind,
              refId: item.refId,
              qtyDelta: delta,
              reason,
            })
        : () =>
            inventoryApi.registerLoss({
              kind: item.kind,
              refId: item.refId,
              qty: lossQty,
              reason,
            });

    if (await mutation.run(action)) {
      setReason('');
      setLossQty(0);
      onDone();
    }
  }

  const hint = invalid
    ? mode === 'adjust'
      ? 'O saldo contado é igual ao atual.'
      : 'Informe quanto se perdeu.'
    : reasonMissing
      ? 'Escreva o motivo.'
      : undefined;

  return (
    <Form
      onSubmit={submit}
      fieldErrors={mutation.fieldErrors}
      error={mutation.error}
      className="space-y-3 border-t border-border bg-sand-100/60 px-4 py-4"
    >
      <div
        role="group"
        aria-label="O que aconteceu"
        className="inline-flex rounded-full bg-sand-200 p-0.5"
      >
        {(
          [
            ['adjust', 'Corrigir saldo'],
            ['loss', 'Registrar perda'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              mutation.reset();
            }}
            className={cn(
              'rounded-full px-3 py-1 text-sm transition-colors',
              mode === value
                ? 'bg-surface font-medium text-ink shadow-soft'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <FormErrors error={mutation.error} />

      <div className="grid gap-3 sm:grid-cols-2">
        {mode === 'adjust' ? (
          <Field
            label="Saldo contado"
            error={mutation.fieldErrors['qtyDelta']}
            hint={
              <>
                Atual: {formatQty(item.qtyOnHand, item.unit)}
                {delta !== 0 ? (
                  <>
                    {' · '}
                    <span className={delta > 0 ? 'text-success-700' : 'text-danger-700'}>
                      {delta > 0 ? '+' : ''}
                      {formatQty(delta)}
                    </span>
                  </>
                ) : null}
              </>
            }
          >
            {(props) => (
              <QuantityInput
                {...props}
                value={counted}
                onValueChange={setCounted}
                unit={item.unit}
                autoFocus
              />
            )}
          </Field>
        ) : (
          <Field
            label="Quanto se perdeu"
            error={mutation.fieldErrors['qty']}
            hint={`Disponível: ${formatQty(item.qtyOnHand, item.unit)}`}
          >
            {(props) => (
              <QuantityInput
                {...props}
                value={lossQty}
                onValueChange={setLossQty}
                unit={item.unit}
                autoFocus
              />
            )}
          </Field>
        )}

        <Field
          label="Motivo"
          hint="Fica no extrato — é o único registro do porquê."
          error={mutation.fieldErrors['reason']}
        >
          {(props) => (
            <Input
              {...props}
              autoComplete="off"
              maxLength={200}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={mode === 'adjust' ? 'Contagem do mês' : 'Caiu no chão'}
            />
          )}
        </Field>
      </div>

      <FormActions hint={hint}>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={invalid || reasonMissing}
          loading={mutation.submitting}
        >
          {mode === 'adjust' ? 'Corrigir saldo' : 'Registrar perda'}
        </Button>
      </FormActions>
    </Form>
  );
}
