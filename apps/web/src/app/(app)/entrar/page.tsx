'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useSession } from '../../../components/auth-provider';
import { AuthShell } from '../../../components/layout/auth-shell';
import { Button } from '../../../components/ui/button';
import { Spinner } from '../../../components/ui/feedback';
import { Field, Input } from '../../../components/ui/field';
import { Form, FormErrors } from '../../../components/ui/form';
import { PasswordInput } from '../../../components/ui/password-input';
import { ApiError } from '../../../lib/api';

/**
 * Login do painel.
 *
 * O campo "empresa" começa escondido: quase todo mundo tem conta em uma loja
 * só, e pedir o identificador dela de cara seria atrito para 95% das pessoas.
 * Ele aparece só quando a API responde `tenant_required` — o que acontece
 * quando o mesmo e-mail existe em mais de uma empresa (D3).
 *
 * O que segue as recomendações de formulário de acesso (web.dev, GOV.UK):
 *
 *   - `autocomplete="username"` e `current-password`, para o gerenciador de
 *     senhas preencher os dois — é assim que boa parte das pessoas entra;
 *   - "Mostrar senha" e aviso de Caps Lock, os dois erros mais comuns num
 *     teclado de celular;
 *   - o e-mail NUNCA é apagado depois de um erro; o foco vai para o aviso,
 *     que diz o que houve, e basta redigitar a senha;
 *   - "Esqueci minha senha" ao lado do rótulo, levando o e-mail já digitado.
 */
export default function EntrarPage() {
  const router = useRouter();
  const { status, login } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [needsTenant, setNeedsTenant] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Quem já tem sessão não vê o formulário.
  useEffect(() => {
    if (status === 'authenticated') router.replace('/painel');
  }, [status, router]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      await login({
        email,
        password,
        ...(tenantSlug ? { tenantSlug } : {}),
      });
      router.replace('/painel');
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === 'tenant_required') {
          setNeedsTenant(true);
          setError('Este e-mail está em mais de uma empresa. Informe qual delas.');
        } else if (caught.code === 'validation_error') {
          setFieldErrors(caught.fieldErrors);
        } else {
          setError(caught.message);
        }
      } else {
        setError('Não foi possível entrar. Verifique sua conexão.');
      }
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-muted">
        <Spinner size={24} />
        <span className="sr-only">Carregando</span>
      </div>
    );
  }

  const recoverHref = email ? `/recuperar?email=${encodeURIComponent(email)}` : '/recuperar';

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse o painel da sua loja."
      footer={
        <>
          Primeiro acesso? Use o link do convite que chegou no seu e-mail. Sem convite, peça
          ao dono da loja para enviar um.
        </>
      }
    >
      <Form
        onSubmit={handleSubmit}
        fieldErrors={fieldErrors}
        error={error}
        className="space-y-5"
      >
        {/* Só o aviso geral: os erros de campo já aparecem embaixo de cada um. */}
        <FormErrors error={error} />

        <Field label="E-mail" error={fieldErrors['email']}>
          {(props) => (
            <Input
              {...props}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              enterKeyHint="next"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@sualoja.com.br"
            />
          )}
        </Field>

        <Field
          label="Senha"
          error={fieldErrors['password']}
          labelAction={
            <Link
              href={recoverHref}
              className="text-clay-700 underline-offset-4 hover:underline"
            >
              Esqueci minha senha
            </Link>
          }
        >
          {(props) => (
            <PasswordInput
              {...props}
              name="password"
              autoComplete="current-password"
              enterKeyHint={needsTenant ? 'next' : 'go'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        {needsTenant ? (
          <Field
            label="Empresa"
            hint="O identificador que aparece no endereço da sua vitrine: padaria-do-ze.cantina.app."
            error={fieldErrors['tenantSlug']}
          >
            {(props) => (
              <Input
                {...props}
                name="tenantSlug"
                autoComplete="organization"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                required
                autoFocus
                value={tenantSlug}
                onChange={(event) => setTenantSlug(event.target.value)}
                placeholder="padaria-do-ze"
              />
            )}
          </Field>
        ) : null}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </Form>
    </AuthShell>
  );
}
