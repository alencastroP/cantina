'use client';

import type { Category, ProductDetail, StockMode } from '@cantina/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useSession } from '../../../../../components/auth-provider';
import { PageHeader } from '../../../../../components/layout/page-header';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../../../../components/ui/field';
import { Switch } from '../../../../../components/ui/switch';
import { catalogApi } from '../../../../../features/catalog/api';
import { VariantEditor } from '../../../../../features/catalog/variant-editor';
import { ProductCostingCard } from '../../../../../features/recipes/product-costing';
import { canManageCosts } from '../../../../../lib/roles';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Edição de produto.
 *
 * Três blocos com donos diferentes: dados do cadastro, disponibilidade na
 * vitrine e variações. Separados porque quem faz cada coisa é diferente — o
 * dono muda o preço, quem está no balcão pausa o que acabou.
 */
export default function ProdutoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();

  const product = useApi<ProductDetail>(`/products/${params.id}`);
  const categories = useApi<Category[]>('/categories');

  // Cópia de ficha feita na criação do produto que não deu certo: o produto
  // existe, e a tela diz o que faltou em vez de fingir que foi tudo bem.
  const [recipeCopyFailed] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('ficha') === 'falhou',
  );

  if (product.loading && !product.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (product.error || !product.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Produto" back={{ href: '/painel/produtos', label: 'Produtos' }} />
        <Alert tone="danger" title="Produto não encontrado.">
          {product.error?.message ?? 'Ele pode ter sido removido.'}
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={product.data.name}
        description={`/${product.data.slug}`}
        back={{ href: '/painel/produtos', label: 'Produtos' }}
      />

      {recipeCopyFailed ? (
        <Alert tone="warning" title="O produto foi criado, mas a ficha técnica não foi copiada.">
          Use “Copiar de outro produto” no bloco de ficha técnica para tentar de novo.
        </Alert>
      ) : null}

      <AvailabilityCard product={product.data} onChange={product.reload} />

      <Card>
        <CardHeader title="Variações" description="Preço e receita penduram aqui." />
        <CardBody>
          <VariantEditor
            productId={product.data.id}
            variants={product.data.variants}
            onChange={product.reload}
          />
        </CardBody>
      </Card>

      {canManageCosts(user?.role) ? (
        // A chave muda com preço e variações: o custo não muda, mas a margem
        // sim — e ela precisa ser recalculada no servidor, não aqui.
        <ProductCostingCard
          key={product.data.variants
            .map((variant) => `${variant.id}:${variant.priceCents}:${variant.active}`)
            .join('|')}
          productId={product.data.id}
        />
      ) : null}

      <DetailsCard
        product={product.data}
        categories={categories.data ?? []}
        onChange={product.reload}
      />

      <DangerZone
        product={product.data}
        onRemoved={() => router.replace('/painel/produtos')}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function AvailabilityCard({
  product,
  onChange,
}: {
  product: ProductDetail;
  onChange: () => void;
}) {
  const mutation = useMutation();

  const pausedUntil = product.pausedUntil ? new Date(product.pausedUntil) : null;
  const paused = pausedUntil !== null && pausedUntil > new Date();

  async function update(body: Parameters<typeof catalogApi.setAvailability>[1]) {
    if (await mutation.run(() => catalogApi.setAvailability(product.id, body))) onChange();
  }

  return (
    <Card>
      <CardHeader
        title="Na vitrine"
        description="Como este produto aparece para o cliente agora."
      />
      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        <Switch
          checked={product.active}
          onCheckedChange={(active) => void update({ active })}
          disabled={mutation.submitting}
          label="Produto ativo"
          description="Desativado, some do cardápio e não pode ser vendido."
        />

        <div className="border-t border-border pt-4">
          {paused ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Pausado</p>
                <p className="text-sm text-ink-muted">
                  Volta automaticamente em{' '}
                  {pausedUntil.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  .
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={mutation.submitting}
                onClick={() => void update({ pausedUntil: null })}
              >
                Voltar a vender
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Acabou hoje?</p>
                <p className="text-sm text-ink-muted">
                  Pausa até o fim do dia, sem mexer no cadastro.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={mutation.submitting}
                onClick={() => {
                  const endOfDay = new Date();
                  endOfDay.setHours(23, 59, 59, 999);
                  void update({ pausedUntil: endOfDay.toISOString() });
                }}
              >
                Pausar até amanhã
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function DetailsCard({
  product,
  categories,
  onChange,
}: {
  product: ProductDetail;
  categories: Category[];
  onChange: () => void;
}) {
  const mutation = useMutation();
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(product.name);
  const [categoryId, setCategoryId] = useState(product.categoryId ?? '');
  const [description, setDescription] = useState(product.description ?? '');
  const [stockMode, setStockMode] = useState<StockMode>(product.stockMode);
  const [availableFor, setAvailableFor] = useState(product.availableFor);

  // Recarregar o produto (depois de mexer numa variação) não pode descartar o
  // que o usuário digitou neste bloco.
  useEffect(() => {
    setName(product.name);
    setCategoryId(product.categoryId ?? '');
    setDescription(product.description ?? '');
    setStockMode(product.stockMode);
    setAvailableFor(product.availableFor);
  }, [product.id]);

  const dirty =
    name !== product.name ||
    categoryId !== (product.categoryId ?? '') ||
    description !== (product.description ?? '') ||
    stockMode !== product.stockMode ||
    availableFor !== product.availableFor;

  async function save() {
    const result = await mutation.run(() =>
      catalogApi.updateProduct(product.id, {
        name,
        categoryId: categoryId || null,
        description: description || null,
        stockMode,
        availableFor,
      }),
    );

    if (result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onChange();
    }
  }

  return (
    <Card>
      <CardHeader title="Cadastro" />
      <CardBody className="space-y-5">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}
        {saved ? <Alert tone="success">Alterações salvas.</Alert> : null}

        <Field label="Nome" error={mutation.fieldErrors['name']} required>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(event) => setName(event.target.value)}
              invalid={Boolean(mutation.fieldErrors['name'])}
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
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Controle de estoque"
          hint={
            stockMode === 'on_demand'
              ? 'A disponibilidade vem dos insumos da ficha técnica.'
              : 'A disponibilidade vem da quantidade que você informa no estoque.'
          }
        >
          {(props) => (
            <Select
              {...props}
              value={stockMode}
              onChange={(event) => setStockMode(event.target.value as StockMode)}
            >
              <option value="on_demand">Feito sob demanda</option>
              <option value="tracked">Conta unidades</option>
            </Select>
          )}
        </Field>

        <Field label="Onde é vendido">
          {(props) => (
            <Select
              {...props}
              value={availableFor}
              onChange={(event) =>
                setAvailableFor(event.target.value as ProductDetail['availableFor'])
              }
            >
              <option value="both">Delivery e encomenda</option>
              <option value="delivery">Só delivery</option>
              <option value="preorder">Só encomenda</option>
            </Select>
          )}
        </Field>

        <Field label="Descrição">
          {(props) => (
            <Textarea
              {...props}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>

        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={mutation.submitting}
            onClick={() => void save()}
          >
            Salvar alterações
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function DangerZone({
  product,
  onRemoved,
}: {
  product: ProductDetail;
  onRemoved: () => void;
}) {
  const mutation = useMutation();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="border-danger-500/30">
      <CardBody className="space-y-3">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        {confirming ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Remover <strong>{product.name}</strong> do cardápio? Os pedidos antigos
              continuam com o nome e o preço que tinham na hora da venda.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={mutation.submitting}
                onClick={async () => {
                  if (await mutation.run(() => catalogApi.removeProduct(product.id))) {
                    onRemoved();
                  }
                }}
              >
                Remover produto
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Remover produto</p>
              <p className="text-sm text-ink-muted">
                Some do cardápio. O histórico de vendas é preservado.
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-danger-700" onClick={() => setConfirming(true)}>
              Remover
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
