'use client';

import type { Category } from '@cantina/contracts';
import { useState } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody } from '../../../../../components/ui/card';
import { Alert, EmptyState, Skeleton } from '../../../../../components/ui/feedback';
import { Input } from '../../../../../components/ui/field';
import { catalogApi } from '../../../../../features/catalog/api';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Categorias do cardápio.
 *
 * A ordem é a que o cliente vê na vitrine, então os botões de subir e descer
 * são a função principal da tela — não um detalhe escondido. Setas em vez de
 * arrastar: funcionam com o dedo, com o teclado e com leitor de tela, sem
 * biblioteca.
 */
export default function CategoriasPage() {
  const categories = useApi<Category[]>('/categories');
  const mutation = useMutation();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [removed, setRemoved] = useState<string | null>(null);

  const items = categories.data ?? [];

  async function run(action: () => Promise<unknown>) {
    if (await mutation.run(action)) {
      setEditingId(null);
      categories.reload();
      return true;
    }
    return false;
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const ids = items.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];

    await run(() => catalogApi.reorderCategories(ids));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Categorias"
        description="A ordem daqui é a ordem do cardápio na vitrine."
        back={{ href: '/painel/produtos', label: 'Produtos' }}
      />

      {mutation.error ? (
        <Alert tone="danger" className="mb-4">
          {mutation.error}
        </Alert>
      ) : null}

      {removed ? (
        <Alert tone="info" className="mb-4">
          {removed}
        </Alert>
      ) : null}

      <Card className="mb-5">
        <CardBody>
          <form
            className="flex gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!newName.trim()) return;
              if (await run(() => catalogApi.createCategory({ name: newName.trim() }))) {
                setNewName('');
              }
            }}
          >
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nova categoria (Salgados, Bebidas…)"
              aria-label="Nome da nova categoria"
              invalid={Boolean(mutation.fieldErrors['name'])}
            />
            <Button type="submit" variant="primary" loading={mutation.submitting}>
              Adicionar
            </Button>
          </form>
          {mutation.fieldErrors['name'] ? (
            <p className="mt-2 text-sm text-danger-700">{mutation.fieldErrors['name']}</p>
          ) : null}
        </CardBody>
      </Card>

      {categories.loading && !categories.data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : null}

      {categories.data && items.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria ainda"
          description="Produtos sem categoria aparecem no fim do cardápio."
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {items.map((category, index) => (
            <li key={category.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label={`Mover ${category.name} para cima`}
                  disabled={index === 0 || mutation.submitting}
                  onClick={() => void move(index, -1)}
                  className="px-1.5 text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
                >
                  <Chevron up />
                </button>
                <button
                  type="button"
                  aria-label={`Mover ${category.name} para baixo`}
                  disabled={index === items.length - 1 || mutation.submitting}
                  onClick={() => void move(index, 1)}
                  className="px-1.5 text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
                >
                  <Chevron />
                </button>
              </div>

              {editingId === category.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await run(() =>
                      catalogApi.updateCategory(category.id, { name: editingName.trim() }),
                    );
                  }}
                >
                  <Input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    aria-label="Nome da categoria"
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
                    <p className="truncate font-medium text-ink">{category.name}</p>
                    <p className="text-sm text-ink-muted">
                      {category.productCount === 0
                        ? 'Nenhum produto'
                        : category.productCount === 1
                          ? '1 produto'
                          : `${category.productCount} produtos`}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(category.id);
                        setEditingName(category.name);
                      }}
                    >
                      Renomear
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger-700"
                      onClick={async () => {
                        const result = await mutation.run(() =>
                          catalogApi.removeCategory(category.id),
                        );
                        if (result) {
                          // A API solta os produtos em vez de escondê-los junto —
                          // dizer quantos foram evita o susto de "sumiu tudo".
                          setRemoved(
                            result.detachedProducts > 0
                              ? `"${category.name}" removida. ${result.detachedProducts} produto(s) ficaram sem categoria e continuam no cardápio.`
                              : `"${category.name}" removida.`,
                          );
                          categories.reload();
                        }
                      }}
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

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={up ? '' : 'rotate-180'}
    >
      <path
        d="M6 15l6-6 6 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
