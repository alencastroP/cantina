'use client';

import type { Category, StockMode } from '@cantina/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useSession } from '../../../../../components/auth-provider';
import { PageHeader } from '../../../../../components/layout/page-header';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { CurrencyInput } from '../../../../../components/ui/currency-input';
import { Field, Input, Select, Textarea } from '../../../../../components/ui/field';
import { Form, FormActions, FormErrors } from '../../../../../components/ui/form';
import { catalogApi } from '../../../../../features/catalog/api';
import { copyRecipe } from '../../../../../features/recipes/api';
import { useRecipeSources } from '../../../../../features/recipes/cost-summary';
import { formatCents } from '../../../../../lib/format';
import { canManageCosts } from '../../../../../lib/roles';
import { useApi, useMutation } from '../../../../../lib/use-api';

/** Nome legível de cada chave de erro da API, para o resumo do topo. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  categoryId: 'Categoria',
  description: 'Descrição',
  stockMode: 'Controle de estoque',
  variants: 'Preço',
  'variants.0.priceCents': 'Preço',
  'variants.0.name': 'Variação',
};

/**
 * Cadastro de produto.
 *
 * Pede o mínimo: nome e preço. Categoria, descrição e o resto são editáveis
 * depois — um formulário de dez campos na primeira vez é o que faz o lojista
 * desistir antes de ter o cardápio no ar.
 *
 * A variação padrão é criada junto, sem aparecer na tela (P13): quem cadastra
 * "Coxinha" não deveria precisar entender o conceito de variação para vender
 * uma coxinha.
 *
 * Quem gerencia pode "puxar" a ficha técnica de um produto parecido já aqui.
 * A opção mostra o custo por unidade de cada receita — calculado no servidor —
 * ao lado do campo de preço: é o momento em que o número importa.
 */
export default function NovoProdutoPage() {
  const router = useRouter();
  const { user } = useSession();
  const categories = useApi<Category[]>('/categories');
  const mutation = useMutation();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [priceCents, setPriceCents] = useState(0);
  const [stockMode, setStockMode] = useState<StockMode>('on_demand');
  const [recipeSourceId, setRecipeSourceId] = useState('');

  const manages = canManageCosts(user?.role);
  const recipeSources = useRecipeSources(manages);
  const recipeSource = recipeSources.sources.find((item) => item.variantId === recipeSourceId);

  const priceError = mutation.fieldErrors['variants.0.priceCents'] ?? mutation.fieldErrors['variants'];

  async function handleSubmit() {
    const created = await mutation.run(() =>
      catalogApi.createProduct({
        name,
        ...(categoryId ? { categoryId } : {}),
        ...(description ? { description } : {}),
        stockMode,
        availableFor: 'both',
        active: true,
        variants: [{ name: 'Padrão', priceCents }],
      }),
    );
    if (!created) return;

    const variant = created.variants[0];
    if (recipeSourceId && variant) {
      // O produto já existe: se a cópia falhar, a tela do produto avisa e
      // oferece tentar de novo — desfazer o cadastro seria pior.
      try {
        await copyRecipe(recipeSourceId, variant.id);
      } catch {
        router.replace(`/painel/produtos/${created.id}?ficha=falhou`);
        return;
      }
    }

    router.replace(`/painel/produtos/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Novo produto"
        description="Nome e preço bastam. O resto dá para completar depois."
        back={{ href: '/painel/produtos', label: 'Produtos' }}
      />

      <Form
        onSubmit={handleSubmit}
        fieldErrors={mutation.fieldErrors}
        error={mutation.error}
        className="space-y-5"
      >
        <FormErrors
          error={mutation.error}
          fieldErrors={mutation.fieldErrors}
          labels={FIELD_LABELS}
        />

        <Card>
          <CardBody className="space-y-5">
            <Field label="Nome" error={mutation.fieldErrors['name']} required>
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  required
                  maxLength={120}
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Coxinha de frango"
                />
              )}
            </Field>

            <Field
              label="Preço"
              error={priceError}
              hint={
                recipeSource
                  ? `A receita escolhida custa ${formatCents(recipeSource.unitCostCents)} por unidade hoje.`
                  : 'Digite só os números: 750 vira R$ 7,50.'
              }
              required
            >
              {(props) => (
                <CurrencyInput {...props} value={priceCents} onValueChange={setPriceCents} />
              )}
            </Field>

            <Field label="Categoria" hint="Dá para deixar em branco e organizar depois.">
              {(props) => (
                <Select
                  {...props}
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {categories.data?.map((category) => (
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
                  ? 'A vitrine calcula quantas unidades dá para fazer com os insumos que você tem.'
                  : 'Você informa quantas unidades tem, como num refrigerante revendido.'
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

            <Field label="Descrição" hint="Aparece na vitrine, abaixo do nome.">
              {(props) => (
                <Textarea
                  {...props}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Massa de batata, recheio de frango desfiado."
                />
              )}
            </Field>
          </CardBody>
        </Card>

        {manages ? (
          <Card>
            <CardHeader
              title="Ficha técnica"
              description="Opcional. Copie a receita de um produto parecido e ajuste depois."
            />
            <CardBody>
              <Field
                label="Copiar a ficha de"
                hint={
                  recipeSource?.hasUnknownCost
                    ? 'Há insumo sem compra registrada nesta receita: o custo está subestimado.'
                    : 'Só aparecem produtos que já têm ficha, com o custo de hoje.'
                }
              >
                {(props) => (
                  <Select
                    {...props}
                    disabled={recipeSources.loading}
                    value={recipeSourceId}
                    onChange={(event) => setRecipeSourceId(event.target.value)}
                  >
                    <option value="">
                      {recipeSources.loading ? 'Carregando…' : 'Não copiar — monto depois'}
                    </option>
                    {recipeSources.sources.map((source) => (
                      <option key={source.variantId} value={source.variantId}>
                        {source.label} — {formatCents(source.unitCostCents)} por unidade
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </CardBody>
          </Card>
        ) : null}

        <FormActions sticky>
          <Button variant="ghost" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={mutation.submitting}>
            Cadastrar produto
          </Button>
        </FormActions>
      </Form>
    </div>
  );
}
