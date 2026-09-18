'use client';

import { isValidCpf, maskCpf, onlyDigits } from '@cantina/domain';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/field';
import { Form, FormErrors } from '../../components/ui/form';
import { LockIcon } from '../../components/layout/icons';
import { slugify } from '../../lib/slugify';
import { SignupError, safeCheckoutUrl, startTrial } from './api';

/**
 * Cadastro do teste grátis.
 *
 * ── O que esta tela NÃO tem, e por quê ───────────────────────────────────────
 *
 * Não tem campo de cartão. Nenhum. O fluxo é: aqui se coleta identificação
 * (loja, responsável, CPF), o servidor cria a conta e o cliente no gateway, e
 * a pessoa segue para a página de pagamento DO PROVEDOR, no domínio dele, onde
 * digita o cartão.
 *
 * Isso não é comodidade — é o que tira o número do cartão do alcance de
 * qualquer coisa que rode nesta origem. Um campo de cartão numa página nossa
 * seria legível por qualquer script carregado aqui, por qualquer extensão do
 * navegador com permissão nesta origem, e apareceria em qualquer ferramenta de
 * gravação de sessão que alguém instalasse depois sem pensar. Não existindo o
 * campo, não existe o que roubar, e o escopo de PCI-DSS fica no mínimo.
 *
 * Também não tem senha. Quem se cadastra recebe por e-mail um link para
 * definir a dela, o que verifica de quebra que o e-mail é mesmo daquela
 * pessoa — e evita transportar senha no mesmo passo em que se fala com um
 * gateway de pagamento.
 *
 * ── O que é feito com o CPF ──────────────────────────────────────────────────
 *
 *   - fica em estado de componente e só sai daqui no corpo do POST, sob HTTPS;
 *   - nunca em `localStorage`, `sessionStorage`, cookie ou URL. Query string
 *     vaza em histórico do navegador, em log de servidor e no `Referer`;
 *   - nunca em `console.log`, nem em mensagem de erro devolvida à tela;
 *   - é apagado da memória quando a tela sai (ver o `useEffect` de limpeza);
 *   - `autoComplete="off"`: não é um campo que gerenciador de senha deva
 *     guardar, e preenchimento automático de documento é onde a pessoa acaba
 *     mandando o CPF de outra pessoa sem perceber.
 *
 * A validação daqui é CONVENIÊNCIA — evita a viagem até o gateway com um
 * dígito trocado. A que vale é a do servidor, que precisa repetir tudo isto
 * usando a mesma função de `@cantina/domain`.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'cantina.localhost';

/** Celular brasileiro: `(11) 98765-4321`, montado enquanto digita. */
function maskPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Só o formato. Endereço que existe de verdade, só o servidor sabe. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface FormState {
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string;
  document: string;
  accepted: boolean;
}

const EMPTY: FormState = {
  businessName: '',
  slug: '',
  ownerName: '',
  email: '',
  phone: '',
  document: '',
  accepted: false,
};

function validate(state: FormState): Record<string, string> {
  const errors: Record<string, string> = {};

  if (state.businessName.trim().length < 2) {
    errors['businessName'] = 'Escreva o nome da sua doceria.';
  }

  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(state.slug)) {
    errors['slug'] = 'Use letras, números e hífen — entre 3 e 40 caracteres.';
  }

  if (state.ownerName.trim().split(/\s+/).length < 2) {
    errors['ownerName'] = 'Informe o nome completo, como está no CPF.';
  }

  if (!EMAIL_SHAPE.test(state.email.trim())) {
    errors['email'] = 'Confira o e-mail: parece faltar alguma coisa.';
  }

  const phoneDigits = onlyDigits(state.phone);
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    errors['phone'] = 'Informe o celular com DDD.';
  }

  if (!isValidCpf(state.document)) {
    // A mensagem não repete o número digitado: erro de tela vira print, e
    // print de erro circula em conversa de suporte.
    errors['document'] = 'Esse CPF não confere. Confira os dígitos.';
  }

  if (!state.accepted) {
    errors['accepted'] = 'Para continuar, é preciso aceitar os termos.';
  }

  return errors;
}

export function TrialForm() {
  const [state, setState] = useState<FormState>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * Isca para robô: campo real, escondido de gente.
   *
   * Fica fora do React state porque ninguém deve digitar nele — quem preenche
   * é script que enxerga o HTML e ignora o CSS. É um sinal FRACO e vai junto
   * no corpo só para o servidor decidir; a defesa de verdade é limite por IP e
   * a confirmação por e-mail, que estão do outro lado.
   */
  const honeypot = useRef<HTMLInputElement>(null);
  const mountedAt = useRef(Date.now());

  // Ao sair da tela, o CPF some do estado. Não elimina toda cópia possível na
  // memória do processo, mas encurta a janela em que ela existe — e deixa
  // registrado que este campo merece esse cuidado.
  useEffect(() => {
    return () => setState(EMPTY);
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((current) => {
      const next = { ...current, [key]: value };

      // O endereço da vitrine acompanha o nome da loja até a pessoa mexer
      // nele. Depois disso, é escolha dela e ninguém sobrescreve.
      if (key === 'businessName' && !slugTouched) {
        next.slug = slugify(String(value));
      }
      return next;
    });
  }

  async function handleSubmit() {
    const errors = validate(state);
    setFieldErrors(errors);
    setError(null);

    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);

    try {
      const { checkoutUrl } = await startTrial(
        {
          businessName: state.businessName.trim(),
          slug: state.slug,
          ownerName: state.ownerName.trim(),
          email: state.email.trim().toLowerCase(),
          phone: onlyDigits(state.phone),
          document: onlyDigits(state.document),
          antiAbuse: {
            website: honeypot.current?.value ?? '',
            elapsedMs: Date.now() - mountedAt.current,
          },
        },
        { idempotencyKey: `signup-${crypto.randomUUID()}` },
      );

      const destination = safeCheckoutUrl(checkoutUrl);

      if (!destination) {
        // Falha fechada: a URL não é de um host de checkout conhecido. O link
        // NÃO é mostrado nem tornado clicável — se ele é suspeito, oferecê-lo
        // à pessoa apenas transfere o risco para ela.
        setError(
          'Não foi possível abrir a página de pagamento com segurança. Sua conta não foi cobrada. Tente de novo em alguns minutos.',
        );
        setSubmitting(false);
        return;
      }

      // Sai desta origem. `assign` (e não `replace`) mantém o botão voltar
      // funcionando: quem desistir no checkout volta para cá, não para fora.
      window.location.assign(destination.toString());
    } catch (caught) {
      if (caught instanceof SignupError) {
        if (Object.keys(caught.fieldErrors).length > 0) {
          setFieldErrors(caught.fieldErrors);
          setError(null);
        } else {
          setError(caught.message);
        }
      } else {
        setError('Não foi possível concluir agora. Verifique sua conexão e tente de novo.');
      }
      setSubmitting(false);
    }
  }

  return (
    <Form
      onSubmit={handleSubmit}
      fieldErrors={fieldErrors}
      error={error}
      className="space-y-5"
    >
      <FormErrors error={error} />

      {/* Isca. `aria-hidden` + `tabIndex={-1}` mantêm o campo fora do caminho
          de quem usa teclado ou leitor de tela; `autoComplete="off"` impede o
          navegador de preenchê-lo sozinho e acusar gente de ser robô. */}
      <div className="absolute left-[-9999px] top-0" aria-hidden="true">
        <label htmlFor="site-da-empresa">Não preencha este campo</label>
        <input
          ref={honeypot}
          id="site-da-empresa"
          name="site-da-empresa"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Field label="Nome da sua doceria" error={fieldErrors['businessName']} required>
        {(props) => (
          <Input
            {...props}
            name="businessName"
            autoComplete="organization"
            enterKeyHint="next"
            autoFocus
            required
            value={state.businessName}
            onChange={(event) => update('businessName', event.target.value)}
            placeholder="Doces da Ana"
          />
        )}
      </Field>

      <Field
        label="Endereço da sua vitrine"
        hint={
          <>
            É o link que você manda para as clientes. Dá para trocar depois, no painel.
          </>
        }
        error={fieldErrors['slug']}
        required
      >
        {(props) => (
          <div className="flex items-stretch overflow-hidden rounded-control border border-border bg-sunken focus-within:border-clay-400 focus-within:shadow-[0_0_0_3px_var(--color-clay-100)]">
            <input
              {...props}
              name="slug"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              value={state.slug}
              onChange={(event) => {
                setSlugTouched(true);
                update('slug', slugify(event.target.value));
              }}
              placeholder="doces-da-ana"
              className="h-11 min-w-0 flex-1 bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink-muted/80 sm:text-sm"
            />
            <span className="flex shrink-0 items-center border-l border-border bg-sand-200 px-3 text-sm text-ink-muted">
              .{ROOT_DOMAIN}
            </span>
          </div>
        )}
      </Field>

      <div className="border-t border-border pt-5">
        <h2 className="font-display text-lg text-ink">Quem responde pela loja</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Precisam ser os dados de quem vai assinar — o gateway de pagamento confere o
          nome com o CPF.
        </p>
      </div>

      <Field label="Seu nome completo" error={fieldErrors['ownerName']} required>
        {(props) => (
          <Input
            {...props}
            name="ownerName"
            autoComplete="name"
            enterKeyHint="next"
            required
            value={state.ownerName}
            onChange={(event) => update('ownerName', event.target.value)}
            placeholder="Ana Maria de Souza"
          />
        )}
      </Field>

      <Field
        label="E-mail"
        hint="É para cá que vai o link de acesso ao painel."
        error={fieldErrors['email']}
        required
      >
        {(props) => (
          <Input
            {...props}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            required
            value={state.email}
            onChange={(event) => update('email', event.target.value)}
            placeholder="voce@suadoceria.com.br"
          />
        )}
      </Field>

      <Field label="WhatsApp" error={fieldErrors['phone']} required>
        {(props) => (
          <Input
            {...props}
            type="tel"
            name="phone"
            autoComplete="tel-national"
            inputMode="numeric"
            enterKeyHint="next"
            required
            value={state.phone}
            onChange={(event) => update('phone', maskPhone(event.target.value))}
            placeholder="(11) 98765-4321"
          />
        )}
      </Field>

      <Field
        label="CPF"
        hint="Exigido pelo gateway para emitir a cobrança no seu nome. Fica guardado com o provedor de pagamento, não em telas do Cantina."
        error={fieldErrors['document']}
        required
      >
        {(props) => (
          <Input
            {...props}
            name="document"
            inputMode="numeric"
            enterKeyHint="done"
            required
            /* Documento não entra em gerenciador de senha nem em autopreenchimento. */
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={14}
            value={state.document}
            onChange={(event) => update('document', maskCpf(event.target.value))}
            placeholder="000.000.000-00"
          />
        )}
      </Field>

      <div className="space-y-1.5 border-t border-border pt-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="accepted"
            checked={state.accepted}
            onChange={(event) => update('accepted', event.target.checked)}
            aria-invalid={fieldErrors['accepted'] ? true : undefined}
            className="mt-0.5 h-5 w-5 shrink-0 accent-clay-500"
          />
          <span className="text-sm leading-relaxed text-ink-soft">
            Li e aceito os{' '}
            <Link
              href="/termos"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-clay-700 underline underline-offset-4"
            >
              termos de uso
            </Link>{' '}
            e a{' '}
            <Link
              href="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-clay-700 underline underline-offset-4"
            >
              política de privacidade
            </Link>
            , inclusive o tratamento do meu CPF para emissão da cobrança.
          </span>
        </label>

        {fieldErrors['accepted'] ? (
          <p className="pl-8 text-sm text-danger-700">{fieldErrors['accepted']}</p>
        ) : null}
      </div>

      <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
        {submitting ? 'Preparando…' : 'Continuar para o pagamento'}
      </Button>

      <p className="flex items-start gap-2 text-sm text-ink-muted">
        <LockIcon size={15} className="mt-0.5 shrink-0" />
        <span>
          O próximo passo abre a página do provedor de pagamento, onde você digita o
          cartão. Nada é cobrado durante o teste, e o Cantina não recebe nem guarda os
          dados do seu cartão.
        </span>
      </p>
    </Form>
  );
}
