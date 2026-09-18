'use client';

import type { Page as ApiPage, Supplier } from '@cantina/contracts';
import { useState } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody } from '../../../../../components/ui/card';
import { Alert, EmptyState, Skeleton } from '../../../../../components/ui/feedback';
import { Input } from '../../../../../components/ui/field';
import { inventoryApi } from '../../../../../features/inventory/api';
import { formatPhone } from '../../../../../lib/format';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Fornecedores.
 *
 * Cadastro deliberadamente raso: nome e telefone bastam para o histórico de
 * compras fazer sentido. Endereço, CNPJ e prazo de entrega entram quando
 * alguém precisar — não antes.
 *
 * A remoção é lógica: as compras antigas continuam apontando para ele, e o
 * custo médio depende desse histórico.
 */
export default function FornecedoresPage() {
  const suppliers = useApi<ApiPage<Supplier>>('/suppliers?limit=100');
  const mutation = useMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  async function run(action: () => Promise<unknown>) {
    if (await mutation.run(action)) {
      setEditingId(null);
      suppliers.reload();
      return true;
    }
    return false;
  }

  const items = suppliers.data?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Fornecedores"
        description="De quem você compra. Aparece no histórico de cada insumo."
        back={{ href: '/painel/estoque', label: 'Estoque' }}
      />

      {mutation.error ? (
        <Alert tone="danger" className="mb-4">
          {mutation.error}
        </Alert>
      ) : null}

      <Card className="mb-5">
        <CardBody>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!name.trim()) return;
              if (
                await run(() =>
                  inventoryApi.createSupplier({
                    name: name.trim(),
                    ...(phone.trim() ? { phone: phone.trim() } : {}),
                    active: true,
                  }),
                )
              ) {
                setName('');
                setPhone('');
              }
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome do fornecedor"
              aria-label="Nome do fornecedor"
              invalid={Boolean(mutation.fieldErrors['name'])}
            />
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Telefone (opcional)"
              aria-label="Telefone"
              type="tel"
              inputMode="tel"
            />
            <Button type="submit" variant="primary" loading={mutation.submitting}>
              Adicionar
            </Button>
          </form>
        </CardBody>
      </Card>

      {suppliers.loading && !suppliers.data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : null}

      {suppliers.data && items.length === 0 ? (
        <EmptyState
          title="Nenhum fornecedor cadastrado"
          description="Dá para registrar compras sem fornecedor — ele só ajuda no histórico."
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {items.map((supplier) => (
            <li key={supplier.id} className="flex items-center gap-3 px-4 py-3">
              {editingId === supplier.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await run(() =>
                      inventoryApi.updateSupplier(supplier.id, { name: editingName.trim() }),
                    );
                  }}
                >
                  <Input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    aria-label="Nome do fornecedor"
                    autoFocus
                  />
                  <Button type="submit" variant="primary" size="sm" loading={mutation.submitting}>
                    Salvar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    Cancelar
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{supplier.name}</p>
                    {supplier.phone ? (
                      <a
                        href={`tel:${supplier.phone}`}
                        className="text-sm text-ink-muted underline-offset-4 hover:underline"
                      >
                        {formatPhone(supplier.phone)}
                      </a>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(supplier.id);
                        setEditingName(supplier.name);
                      }}
                    >
                      Renomear
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger-700"
                      onClick={() => void run(() => inventoryApi.removeSupplier(supplier.id))}
                    >
                      Remover
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
