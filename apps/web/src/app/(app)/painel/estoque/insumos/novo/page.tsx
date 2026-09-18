'use client';

import type { UsageUnit } from '@cantina/contracts';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '../../../../../../components/layout/page-header';
import { Button } from '../../../../../../components/ui/button';
import { Card, CardBody } from '../../../../../../components/ui/card';
import { Alert } from '../../../../../../components/ui/feedback';
import { Field, Input, Select } from '../../../../../../components/ui/field';
import { Form, FormActions, FormErrors } from '../../../../../../components/ui/form';
import { QuantityInput } from '../../../../../../components/ui/quantity-input';
import { inventoryApi, USAGE_UNIT_LABELS } from '../../../../../../features/inventory/api';
import { useMutation } from '../../../../../../lib/use-api';

/**
 * Cadastro de insumo.
 *
 * A unidade de USO é a decisão que não dá para voltar atrás: trocar grama por
 * mililitro depois reinterpretaria todo o histórico de compras, o custo médio
 * e as receitas de uma vez — sem conversão possível, porque o número gravado
 * não diz qual era a unidade quando foi gravado. A tela avisa isso aqui, e não
 * depois que o erro aconteceu.
 *
 * O custo não é pedido: ele nasce da primeira compra (D11).
 */
export default function NovoInsumoPage() {
  const router = useRouter();
  const mutation = useMutation();

  const [name, setName] = useState('');
  const [usageUnit, setUsageUnit] = useState<UsageUnit>('g');
  const [type, setType] = useState<'ingredient' | 'packaging'>('ingredient');
  const [minStockQty, setMinStockQty] = useState(0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const created = await mutation.run(() =>
      inventoryApi.createSupply({ name, usageUnit, type, minStockQty, active: true }),
    );

    if (created) router.replace(`/painel/estoque/insumos/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Novo insumo"
        back={{ href: '/painel/estoque', label: 'Estoque' }}
      />

      <Form onSubmit={handleSubmit} fieldErrors={mutation.fieldErrors} error={mutation.error}>
        <Card>
          <CardBody className="space-y-5">
            <FormErrors
              error={mutation.error}
              fieldErrors={mutation.fieldErrors}
              labels={{
                name: 'Nome',
                usageUnit: 'Unidade de uso',
                type: 'Tipo',
                minStockQty: 'Estoque mínimo',
              }}
            />

            <Field label="Nome" error={mutation.fieldErrors['name']} required>
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Farinha de trigo"
                  invalid={Boolean(mutation.fieldErrors['name'])}
                />
              )}
            </Field>

            <Field
              label="Unidade de uso"
              hint="Como você mede este insumo na receita. Não dá para mudar depois."
              error={mutation.fieldErrors['usageUnit']}
              required
            >
              {(props) => (
                <Select
                  {...props}
                  value={usageUnit}
                  onChange={(event) => setUsageUnit(event.target.value as UsageUnit)}
                >
                  {Object.entries(USAGE_UNIT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Tipo"
              hint="Embalagem também é insumo: tem custo e acaba."
            >
              {(props) => (
                <Select
                  {...props}
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as 'ingredient' | 'packaging')
                  }
                >
                  <option value="ingredient">Ingrediente</option>
                  <option value="packaging">Embalagem</option>
                </Select>
              )}
            </Field>

            <Field
              label="Estoque mínimo"
              hint="Abaixo disso, você recebe um aviso. Deixe zero para não avisar."
            >
              {(props) => (
                <QuantityInput
                  {...props}
                  value={minStockQty}
                  onValueChange={setMinStockQty}
                  unit={usageUnit}
                />
              )}
            </Field>

            <Alert tone="info">
              O custo deste insumo vem da primeira compra que você registrar — não precisa
              informar aqui.
            </Alert>
          </CardBody>
        </Card>

        <FormActions sticky className="mt-5">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={mutation.submitting}>
            Cadastrar insumo
          </Button>
        </FormActions>
      </Form>
    </div>
  );
}
