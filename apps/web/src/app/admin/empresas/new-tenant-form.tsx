'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../components/ui/card';
import { Alert } from '../../../components/ui/feedback';
import { Field, Input, Select } from '../../../components/ui/field';
import { PasswordInput } from '../../../components/ui/password-input';
import { adminApi } from '../../../features/admin/api';
import { useAdminApi } from '../../../features/admin/use-admin-api';
import { ApiError } from '../../../lib/api';
import { slugify } from '../../../lib/slugify';

/**
 * Cadastro de empresa pela plataforma.
 *
 * Cria a empresa, o usuário dono e o subdomínio na mesma transação da API. O
 * formulário pede a senha inicial porque não existe fluxo de auto-cadastro
 * ainda: quem vende fala com o cliente, cria a conta e entrega o acesso.
 */
export function NewTenantForm({ onCreated }: { onCreated: () => void }) {
  const plans = useAdminApi(() => adminApi.listPlans(), []);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [trialDays, setTrialDays] = useState(14);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      await adminApi.createTenant({
        name,
        slug,
        ownerName,
        ownerEmail,
        ownerPassword,
        trialDays,
        timeZone: 'America/Sao_Paulo',
        ...(planCode ? { planCode } : {}),
      });
      onCreated();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.code === 'validation_error' ? null : caught.message);
        setFieldErrors(caught.fieldErrors);
      } else {
        setError('Não foi possível criar a empresa.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Nova empresa"
        description="Cria a loja, o usuário dono e o subdomínio de uma vez."
      />
      <form onSubmit={handleSubmit} noValidate>
        <CardBody className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da loja" error={fieldErrors['name']} required>
              {(props) => (
                <Input
                  {...props}
                  required
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    // O endereço acompanha o nome até alguém editá-lo à mão —
                    // depois disso ele para de mudar sozinho, senão uma
                    // correção de digitação apagaria a escolha.
                    if (!slugTouched) setSlug(slugify(event.target.value));
                  }}
                  placeholder="Padaria do Zé"
                />
              )}
            </Field>

            <Field
              label="Endereço da vitrine"
              hint="Vira o subdomínio. Não muda depois."
              error={fieldErrors['slug']}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(slugify(event.target.value));
                  }}
                  placeholder="padaria-do-ze"
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome do dono" error={fieldErrors['ownerName']} required>
              {(props) => (
                <Input
                  {...props}
                  required
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                />
              )}
            </Field>

            <Field label="E-mail do dono" error={fieldErrors['ownerEmail']} required>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  inputMode="email"
                  // O e-mail é do cliente, não de quem está cadastrando: o
                  // navegador não deve sugerir o do suporte.
                  autoComplete="off"
                  required
                  value={ownerEmail}
                  onChange={(event) => setOwnerEmail(event.target.value)}
                />
              )}
            </Field>

            <Field
              label="Senha inicial"
              hint="Mínimo de 8 caracteres."
              error={fieldErrors['ownerPassword']}
              required
            >
              {(props) => (
                <PasswordInput
                  {...props}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plano" hint="Opcional — pode ser escolhido depois pelo lojista.">
              {(props) => (
                <Select
                  {...props}
                  value={planCode}
                  onChange={(event) => setPlanCode(event.target.value)}
                >
                  <option value="">Sem plano</option>
                  {(plans.data ?? [])
                    .filter((plan) => plan.active)
                    .map((plan) => (
                      <option key={plan.id} value={plan.code}>
                        {plan.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>

            <Field label="Dias de teste" error={fieldErrors['trialDays']}>
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  max={90}
                  value={trialDays}
                  onChange={(event) => setTrialDays(Number(event.target.value))}
                />
              )}
            </Field>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={!name || !slug || !ownerEmail || ownerPassword.length < 8}
            >
              Criar empresa
            </Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}
