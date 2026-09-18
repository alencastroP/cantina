'use client';

import type { FinanceAccount, FinanceCategory, FinanceDirection } from '@cantina/contracts';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody } from '../../../../../components/ui/card';
import { CurrencyInput } from '../../../../../components/ui/currency-input';
import { Field, Input, Select, Textarea } from '../../../../../components/ui/field';
import { Form, FormActions, FormErrors } from '../../../../../components/ui/form';
import { Switch } from '../../../../../components/ui/switch';
import { ACCOUNT_KIND_LABELS, financeApi } from '../../../../../features/finance/api';
import { todayInStore } from '../../../../../features/reports/api';
import { cn } from '../../../../../lib/cn';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Lançamento manual.
 *
 * Só o que a API não gera sozinha entra aqui: aluguel, energia, retirada do
 * dono. Pedido concluído e compra de insumo já viram lançamento automático —
 * relançá-los à mão é como o mesmo dinheiro passa a ser contado duas vezes.
 *
 * "Já foi pago" existe porque o caso mais comum do balcão é o gasto que já
 * saiu do caixa. Sem ele, todo lançamento nasceria em aberto e exigiria uma
 * segunda ação para dizer o que já era verdade na hora de digitar.
 */
export default function NovoLancamentoPage() {
  const router = useRouter();
  const mutation = useMutation();

  const [direction, setDirection] = useState<FinanceDirection>('out');
  const [description, setDescription] = useState('');
  const [amountCents, setAmountCents] = useState(0);
  const [dueDate, setDueDate] = useState(() => todayInStore());
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [paidNow, setPaidNow] = useState(true);

  const categories = useApi<FinanceCategory[]>('/finance/categories');
  const accounts = useApi<FinanceAccount[]>('/finance/accounts');

  // Categoria de entrada não serve para uma saída: mostrar as duas listas
  // juntas convida ao erro que ninguém percebe até o relatório sair torto.
  const available = (categories.data ?? []).filter(
    (category) => category.direction === direction && category.active,
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const created = await mutation.run(() =>
      financeApi.createEntry({
        direction,
        description,
        amountCents,
        dueDate,
        paidNow,
        ...(categoryId ? { categoryId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(notes ? { notes } : {}),
      }),
    );

    if (created) router.replace('/painel/financeiro');
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Novo lançamento"
        description="Para o que não vem de um pedido ou de uma compra."
        back={{ href: '/painel/financeiro', label: 'Financeiro' }}
      />

      <Form onSubmit={handleSubmit} fieldErrors={mutation.fieldErrors} error={mutation.error}>
        <Card>
          <CardBody className="space-y-5">
            <FormErrors
              error={mutation.error}
              fieldErrors={mutation.fieldErrors}
              labels={{
                description: 'Descrição',
                amountCents: 'Valor',
                dueDate: 'Vencimento',
                categoryId: 'Categoria',
                accountId: 'Conta',
                notes: 'Observações',
              }}
            />

            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de lançamento">
              {(
                [
                  ['out', 'Saída', 'Conta a pagar, despesa'],
                  ['in', 'Entrada', 'Recebimento, aporte'],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setDirection(value);
                    setCategoryId('');
                  }}
                  aria-pressed={direction === value}
                  className={cn(
                    'rounded-card border px-4 py-3 text-left transition-colors',
                    direction === value
                      ? 'border-clay-300 bg-clay-100'
                      : 'border-border bg-surface hover:border-border-strong',
                  )}
                >
                  <span
                    className={cn(
                      'block font-medium',
                      direction === value ? 'text-clay-700' : 'text-ink',
                    )}
                  >
                    {label}
                  </span>
                  <span className="block text-xs text-ink-muted">{hint}</span>
                </button>
              ))}
            </div>

            <Field label="Descrição" error={mutation.fieldErrors['description']} required>
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  required
                  autoComplete="off"
                  maxLength={200}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={direction === 'out' ? 'Aluguel de março' : 'Aporte do sócio'}
                  invalid={Boolean(mutation.fieldErrors['description'])}
                />
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Valor" error={mutation.fieldErrors['amountCents']} required>
                {(props) => (
                  <CurrencyInput
                    {...props}
                    value={amountCents}
                    onValueChange={setAmountCents}
                    invalid={Boolean(mutation.fieldErrors['amountCents'])}
                  />
                )}
              </Field>

              <Field
                label="Vencimento"
                error={mutation.fieldErrors['dueDate']}
                hint={paidNow ? 'Também é a data do pagamento.' : undefined}
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    required
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    invalid={Boolean(mutation.fieldErrors['dueDate'])}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Categoria" hint="Opcional. Agrupa o relatório de despesas.">
                {(props) => (
                  <Select
                    {...props}
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="">Sem categoria</option>
                    {available.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Conta" hint="Onde o dinheiro entra ou sai.">
                {(props) => (
                  <Select
                    {...props}
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                  >
                    <option value="">Conta padrão</option>
                    {(accounts.data ?? [])
                      .filter((account) => account.active)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} · {ACCOUNT_KIND_LABELS[account.kind] ?? account.kind}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            </div>

            <Switch
              checked={paidNow}
              onCheckedChange={setPaidNow}
              label="Já foi pago"
              description="Desmarque para deixar em aberto e dar baixa depois."
            />

            <Field label="Observações">
              {(props) => (
                <Textarea
                  {...props}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Número da nota, forma de pagamento, o que ajudar depois."
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <FormActions
          sticky
          className="mt-5"
          hint={amountCents === 0 ? 'Informe o valor para lançar.' : undefined}
        >
          <Button variant="ghost" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={mutation.submitting}
            disabled={amountCents === 0}
          >
            Lançar
          </Button>
        </FormActions>
      </Form>
    </div>
  );
}
