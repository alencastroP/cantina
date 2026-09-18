'use client';

import type {
  CreateAccountRequest,
  CreateRecurrenceRequest,
  FinanceAccount,
  FinanceCategory,
  FinanceDirection,
  FinanceRecurrence,
} from '@cantina/contracts';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { CurrencyInput } from '../../../../../components/ui/currency-input';
import { Alert } from '../../../../../components/ui/feedback';
import { Field, Input, Select } from '../../../../../components/ui/field';
import {
  ACCOUNT_KIND_LABELS,
  DIRECTION_LABELS,
  FREQUENCY_LABELS,
  financeApi,
} from '../../../../../features/finance/api';
import { todayInStore } from '../../../../../features/reports/api';
import { formatCents, formatDate } from '../../../../../lib/format';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Contas, categorias e recorrências.
 *
 * Três cadastros pequenos numa página só. Separá-los em três telas daria a
 * cada um a importância de um módulo — e nenhum deles é visitado mais de uma
 * vez por mês.
 *
 * A recorrência é a que muda o dia a dia: o aluguel de todo dia 5 vira um
 * lançamento concreto, editável e baixável como qualquer outro. É o que
 * mantém a projeção de caixa auditável em vez de mágica.
 */
export default function AjustesFinanceiroPage() {
  const accounts = useApi<FinanceAccount[]>('/finance/accounts');
  const categories = useApi<FinanceCategory[]>('/finance/categories');
  const recurrences = useApi<FinanceRecurrence[]>('/finance/recurrences');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Contas, categorias e recorrências"
        description="O cadastro que sustenta o fluxo de caixa."
        back={{ href: '/painel/financeiro', label: 'Financeiro' }}
      />

      <RecurrencesCard
        recurrences={recurrences.data ?? []}
        categories={categories.data ?? []}
        loading={recurrences.loading && !recurrences.data}
        onChanged={recurrences.reload}
      />

      <AccountsCard
        accounts={accounts.data ?? []}
        loading={accounts.loading && !accounts.data}
        onChanged={accounts.reload}
      />

      <CategoriesCard
        categories={categories.data ?? []}
        loading={categories.loading && !categories.data}
        onChanged={categories.reload}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Recorrências                                                                */
/* -------------------------------------------------------------------------- */

function RecurrencesCard({
  recurrences,
  categories,
  loading,
  onChanged,
}: {
  recurrences: FinanceRecurrence[];
  categories: FinanceCategory[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation();

  const [direction, setDirection] = useState<FinanceDirection>('out');
  const [description, setDescription] = useState('');
  const [amountCents, setAmountCents] = useState(0);
  const [frequency, setFrequency] =
    useState<CreateRecurrenceRequest['frequency']>('monthly');
  const [nextDueDate, setNextDueDate] = useState(() => todayInStore());
  const [categoryId, setCategoryId] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const created = await mutation.run(() =>
      financeApi.createRecurrence({
        direction,
        description,
        amountCents,
        frequency,
        nextDueDate,
        ...(categoryId ? { categoryId } : {}),
      }),
    );

    if (created) {
      setOpen(false);
      setDescription('');
      setAmountCents(0);
      onChanged();
    }
  }

  const remove = useMutation();

  return (
    <Card>
      <CardHeader
        title="Recorrências"
        description="Aluguel, energia, contador: o que se repete sozinho."
        action={
          <Button size="sm" variant={open ? 'ghost' : 'secondary'} onClick={() => setOpen(!open)}>
            {open ? 'Cancelar' : 'Nova'}
          </Button>
        }
      />

      {open ? (
        <form onSubmit={handleSubmit} noValidate>
          <CardBody className="space-y-4 border-b border-border bg-sand-100/60">
            {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                {(props) => (
                  <Select
                    {...props}
                    value={direction}
                    onChange={(event) => {
                      setDirection(event.target.value as FinanceDirection);
                      setCategoryId('');
                    }}
                  >
                    <option value="out">Saída</option>
                    <option value="in">Entrada</option>
                  </Select>
                )}
              </Field>

              <Field label="Frequência">
                {(props) => (
                  <Select
                    {...props}
                    value={frequency}
                    onChange={(event) =>
                      setFrequency(event.target.value as CreateRecurrenceRequest['frequency'])
                    }
                  >
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            <Field label="Descrição" error={mutation.fieldErrors['description']} required>
              {(props) => (
                <Input
                  {...props}
                  required
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Aluguel do ponto"
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Valor" error={mutation.fieldErrors['amountCents']} required>
                {(props) => (
                  <CurrencyInput {...props} value={amountCents} onValueChange={setAmountCents} />
                )}
              </Field>

              <Field label="Próximo vencimento" required>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    required
                    value={nextDueDate}
                    onChange={(event) => setNextDueDate(event.target.value)}
                  />
                )}
              </Field>

              <Field label="Categoria">
                {(props) => (
                  <Select
                    {...props}
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="">Sem categoria</option>
                    {categories
                      .filter((category) => category.direction === direction && category.active)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={mutation.submitting}
                disabled={amountCents === 0}
              >
                Criar recorrência
              </Button>
            </div>
          </CardBody>
        </form>
      ) : null}

      <CardBody>
        {remove.error ? (
          <Alert tone="danger" className="mb-3">
            {remove.error}
          </Alert>
        ) : null}

        {loading ? <p className="text-sm text-ink-muted">Carregando…</p> : null}

        {!loading && recurrences.length === 0 ? (
          <p className="py-2 text-sm text-ink-muted">
            Nenhuma recorrência. Cadastre o aluguel e ele passa a aparecer sozinho na
            projeção de caixa todo mês.
          </p>
        ) : null}

        <ul className="divide-y divide-border">
          {recurrences.map((recurrence) => (
            <li key={recurrence.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">{recurrence.description}</p>
                <p className="text-xs text-ink-muted">
                  {FREQUENCY_LABELS[recurrence.frequency] ?? recurrence.frequency} · próximo em{' '}
                  {formatDate(recurrence.nextDueDate)}
                  {recurrence.categoryName ? ` · ${recurrence.categoryName}` : ''}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="tabular-nums text-ink">{formatCents(recurrence.amountCents)}</p>
                <Badge tone={recurrence.direction === 'in' ? 'success' : 'neutral'}>
                  {DIRECTION_LABELS[recurrence.direction]}
                </Badge>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const done = await remove.run(() =>
                    financeApi.removeRecurrence(recurrence.id),
                  );
                  if (done !== null) onChanged();
                }}
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Contas                                                                      */
/* -------------------------------------------------------------------------- */

function AccountsCard({
  accounts,
  loading,
  onChanged,
}: {
  accounts: FinanceAccount[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CreateAccountRequest['kind']>('cash');
  const [openingBalanceCents, setOpeningBalanceCents] = useState(0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const created = await mutation.run(() =>
      financeApi.createAccount({
        name,
        kind,
        openingBalanceCents,
        isDefault: accounts.length === 0,
      }),
    );

    if (created) {
      setOpen(false);
      setName('');
      setOpeningBalanceCents(0);
      onChanged();
    }
  }

  return (
    <Card>
      <CardHeader
        title="Contas"
        description="Onde o dinheiro fica: caixa da loja, banco, carteira digital."
        action={
          <Button size="sm" variant={open ? 'ghost' : 'secondary'} onClick={() => setOpen(!open)}>
            {open ? 'Cancelar' : 'Nova'}
          </Button>
        }
      />

      {open ? (
        <form onSubmit={handleSubmit} noValidate>
          <CardBody className="space-y-4 border-b border-border bg-sand-100/60">
            {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nome" error={mutation.fieldErrors['name']} required>
                {(props) => (
                  <Input
                    {...props}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Caixa da loja"
                  />
                )}
              </Field>

              <Field label="Tipo">
                {(props) => (
                  <Select
                    {...props}
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as CreateAccountRequest['kind'])
                    }
                  >
                    {Object.entries(ACCOUNT_KIND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="Saldo inicial"
                hint="O que já existe na conta hoje."
              >
                {(props) => (
                  <CurrencyInput
                    {...props}
                    value={openingBalanceCents}
                    onValueChange={setOpeningBalanceCents}
                  />
                )}
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm" loading={mutation.submitting}>
                Criar conta
              </Button>
            </div>
          </CardBody>
        </form>
      ) : null}

      <CardBody>
        {loading ? <p className="text-sm text-ink-muted">Carregando…</p> : null}

        {!loading && accounts.length === 0 ? (
          <p className="py-2 text-sm text-ink-muted">
            Nenhuma conta cadastrada. Sem ela, os lançamentos ficam sem saldo de origem.
          </p>
        ) : null}

        <ul className="divide-y divide-border">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-ink">
                  {account.name}
                  {account.isDefault ? (
                    <Badge tone="accent" className="ml-2">
                      padrão
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-ink-muted">
                  {ACCOUNT_KIND_LABELS[account.kind] ?? account.kind} · abertura de{' '}
                  {formatCents(account.openingBalanceCents)}
                </p>
              </div>

              {/* Saldo só conta o que foi PAGO: um boleto agendado não tirou
                  dinheiro do caixa. */}
              <p className="shrink-0 tabular-nums text-ink">{formatCents(account.balanceCents)}</p>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Categorias                                                                  */
/* -------------------------------------------------------------------------- */

function CategoriesCard({
  categories,
  loading,
  onChanged,
}: {
  categories: FinanceCategory[];
  loading: boolean;
  onChanged: () => void;
}) {
  const mutation = useMutation();
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<FinanceDirection>('out');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const created = await mutation.run(() => financeApi.createCategory({ name, direction }));
    if (created) {
      setName('');
      onChanged();
    }
  }

  const grouped = (value: FinanceDirection) =>
    categories.filter((category) => category.direction === value);

  return (
    <Card>
      <CardHeader
        title="Categorias"
        description="Agrupam o relatório: insumos, pessoal, aluguel, taxas."
      />

      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3" noValidate>
          <div className="min-w-40 flex-1">
            <Field label="Nova categoria" error={mutation.fieldErrors['name']}>
              {(props) => (
                <Input
                  {...props}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Embalagens"
                />
              )}
            </Field>
          </div>

          <div className="w-36">
            <Field label="Tipo">
              {(props) => (
                <Select
                  {...props}
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as FinanceDirection)}
                >
                  <option value="out">Saída</option>
                  <option value="in">Entrada</option>
                </Select>
              )}
            </Field>
          </div>

          <Button
            type="submit"
            variant="secondary"
            loading={mutation.submitting}
            disabled={name.trim().length < 2}
          >
            Adicionar
          </Button>
        </form>

        {loading ? <p className="text-sm text-ink-muted">Carregando…</p> : null}

        <div className="grid gap-5 sm:grid-cols-2">
          {(['out', 'in'] as const).map((value) => (
            <div key={value}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
                {DIRECTION_LABELS[value]}
              </p>
              {grouped(value).length === 0 ? (
                <p className="text-sm text-ink-muted">Nenhuma ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {grouped(value).map((category) => (
                    <Badge key={category.id} tone={value === 'in' ? 'success' : 'neutral'}>
                      {category.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
