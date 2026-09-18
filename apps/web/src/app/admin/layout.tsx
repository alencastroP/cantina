'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Wordmark } from '../../components/landing/wordmark';
import { Button } from '../../components/ui/button';
import { Card, CardBody } from '../../components/ui/card';
import { Spinner } from '../../components/ui/feedback';
import { Field, Input } from '../../components/ui/field';
import { Form, FormErrors } from '../../components/ui/form';
import { PasswordInput } from '../../components/ui/password-input';
import { AdminSessionProvider, useAdminSession } from '../../features/admin/session';
import { cn } from '../../lib/cn';

/**
 * Casca da administração da plataforma (D5).
 *
 * Fica FORA do grupo `(app)`: o provedor de sessão do lojista não envolve esta
 * área, e por isso nenhuma tela daqui tem acesso ao token do painel — nem o
 * contrário. É a mesma separação que existe na API, refletida na árvore de
 * rotas.
 *
 * O visual é deliberadamente mais seco que o do painel. Quem está aqui mexe na
 * conta de outras pessoas, e a tela precisa parecer uma ferramenta interna, não
 * o produto.
 */

const LINKS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/empresas', label: 'Empresas' },
  { href: '/admin/planos', label: 'Planos' },
  { href: '/admin/assinaturas', label: 'Assinaturas' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider>
      <Guard>{children}</Guard>
    </AdminSessionProvider>
  );
}

function Guard({ children }: { children: ReactNode }) {
  const { session, loading } = useAdminSession();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-muted">
        <Spinner size={24} />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, logout } = useAdminSession();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 lg:px-6">
          <Link
            href="/admin"
            aria-label="Cantina — administração da plataforma"
            className="flex items-center gap-2 rounded-control"
          >
            <Wordmark size="md" />
            <span className="rounded-full bg-sand-200 px-2 py-0.5 text-xs font-medium text-ink-soft">
              plataforma
            </span>
          </Link>

          <nav className="flex flex-1 flex-wrap gap-1">
            {LINKS.map((link) => {
              const active =
                link.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-control px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-clay-100 font-medium text-clay-700'
                      : 'text-ink-soft hover:bg-sand-200 hover:text-ink',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted">
              {session?.user.name} · {session?.user.role === 'owner' ? 'admin' : 'suporte'}
            </span>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-6 lg:py-8">{children}</main>
    </div>
  );
}

function LoginScreen() {
  const { login } = useAdminSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      await login(email, password);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível entrar. Tente de novo.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Wordmark size="lg" className="justify-center" />
          <p className="mt-1 text-sm text-ink-muted">Administração da plataforma</p>
        </div>

        <Card>
          <CardBody>
            <Form onSubmit={handleSubmit} error={error} className="space-y-4">
              <FormErrors error={error} />

              <Field label="E-mail">
                {(props) => (
                  <Input
                    {...props}
                    type="email"
                    name="email"
                    inputMode="email"
                    autoFocus
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                )}
              </Field>

              <Field label="Senha">
                {(props) => (
                  <PasswordInput
                    {...props}
                    name="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                )}
              </Field>

              <Button type="submit" variant="primary" fullWidth loading={submitting}>
                Entrar
              </Button>
            </Form>
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-xs text-ink-muted">
          Esta sessão vale só para esta aba e não é renovada.
        </p>
      </div>
    </div>
  );
}
