'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody } from '../../../../../components/ui/card';
import { Alert } from '../../../../../components/ui/feedback';
import { Field, Input, Textarea } from '../../../../../components/ui/field';
import { Form, FormActions, FormErrors } from '../../../../../components/ui/form';
import { customersApi } from '../../../../../features/customers/api';
import { useMutation } from '../../../../../lib/use-api';

/**
 * Cadastro de cliente.
 *
 * Raramente é usado: o cadastro nasce sozinho no primeiro pedido (D4). Serve
 * para quem quer registrar um cliente antes da primeira venda.
 *
 * Telefone repetido não é erro cego: a API devolve o id de quem já existe, e
 * a tela oferece ir até lá em vez de mandar procurar de novo.
 */
export default function NovoClientePage() {
  const router = useRouter();
  const mutation = useMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  // A API devolve o id de quem já usa aquele telefone — quem está atendendo
  // quer ir para o cadastro existente, não receber um erro e procurar de novo.
  const duplicateId = mutation.apiError?.details?.['customerId'];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const created = await mutation.run(() =>
      customersApi.create({
        name,
        phone,
        ...(email ? { email } : {}),
        ...(notes ? { notes } : {}),
      }),
    );

    if (created) router.replace(`/painel/clientes/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Novo cliente"
        back={{ href: '/painel/clientes', label: 'Clientes' }}
      />

      <Form onSubmit={handleSubmit} fieldErrors={mutation.fieldErrors} error={mutation.error}>
        <Card>
          <CardBody className="space-y-5">
            <FormErrors
              fieldErrors={mutation.fieldErrors}
              labels={{ name: 'Nome', phone: 'Telefone', email: 'E-mail', notes: 'Observações' }}
            />
            {mutation.error ? (
              <Alert tone="danger">
                {mutation.error}
                {typeof duplicateId === 'string' ? (
                  <p className="mt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/painel/clientes/${duplicateId}`)}
                    >
                      Abrir o cadastro existente
                    </Button>
                  </p>
                ) : null}
              </Alert>
            ) : null}

            <Field label="Nome" error={mutation.fieldErrors['name']} required>
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  required
                  // Os dados são do cliente, não de quem digita: o navegador
                  // não deve sugerir o nome e o telefone do atendente.
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Maria Silva"
                  invalid={Boolean(mutation.fieldErrors['name'])}
                />
              )}
            </Field>

            <Field
              label="Telefone"
              hint="É por ele que o cliente é identificado nos pedidos."
              error={mutation.fieldErrors['phone']}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(11) 98765-4321"
                  invalid={Boolean(mutation.fieldErrors['phone'])}
                />
              )}
            </Field>

            <Field label="E-mail" error={mutation.fieldErrors['email']}>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>

            <Field label="Observações" hint="Alergia, preferência, ponto de referência fixo…">
              {(props) => (
                <Textarea
                  {...props}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <FormActions sticky className="mt-5">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={mutation.submitting}>
            Cadastrar cliente
          </Button>
        </FormActions>
      </Form>
    </div>
  );
}
