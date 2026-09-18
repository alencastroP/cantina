'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AuthShell } from '../../../components/layout/auth-shell';
import { Button } from '../../../components/ui/button';
import { Alert } from '../../../components/ui/feedback';
import { Field, Input } from '../../../components/ui/field';
import { Form, FormErrors } from '../../../components/ui/form';
import { api, ApiError } from '../../../lib/api';

/**
 * Recuperação de senha.
 *
 * A API responde 204 exista o e-mail ou não, e a tela repete essa postura: a
 * mensagem de sucesso é a mesma nos dois casos. Dizer "esse e-mail não existe"
 * transformaria a página num verificador de cadastros.
 *
 * A empresa é pedida porque o e-mail é único POR EMPRESA (D3) — a mesma pessoa
 * pode ter conta em duas lojas. O e-mail chega preenchido quando a pessoa vem
 * do "Esqueci minha senha" do login: digitá-lo de novo seria pedir duas vezes
 * a mesma coisa.
 */
export default function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Lido da URL no cliente, e não com `useSearchParams`: a página é estática,
  // e o hook exigiria uma fronteira de Suspense só para isto.
  useEffect(() => {
    const fromLogin = new URLSearchParams(window.location.search).get('email');
    if (fromLogin) setEmail(fromLogin);
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      await api.post('/auth/forgot-password', { email, tenantSlug });
      setSent(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'validation_error') {
        setFieldErrors(caught.fieldErrors);
      } else {
        setError('Não foi possível enviar agora. Tente em instantes.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const backToLogin = (
    <Link href="/entrar" className="text-clay-700 underline-offset-4 hover:underline">
      Voltar para o login
    </Link>
  );

  if (sent) {
    return (
      <AuthShell title="Confira seu e-mail" footer={backToLogin}>
        <div className="space-y-5">
          <Alert tone="success" title="Se o e-mail estiver cadastrado, o link foi enviado.">
            Ele vale por 1 hora. Confira também a caixa de spam e as promoções.
          </Alert>
          <Button variant="secondary" fullWidth onClick={() => setSent(false)}>
            Não chegou? Enviar de novo
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recuperar acesso"
      subtitle="Enviamos um link para você criar uma senha nova."
      footer={backToLogin}
    >
      <Form onSubmit={handleSubmit} fieldErrors={fieldErrors} error={error} className="space-y-5">
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
              enterKeyHint="send"
              required
              value={tenantSlug}
              onChange={(event) => setTenantSlug(event.target.value)}
              placeholder="padaria-do-ze"
            />
          )}
        </Field>

        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          Enviar link de recuperação
        </Button>
      </Form>
    </AuthShell>
  );
}
