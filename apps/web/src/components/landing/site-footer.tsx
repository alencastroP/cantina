import Link from 'next/link';

import { Wordmark } from './wordmark';

/**
 * Rodapé.
 *
 * Os links legais não são enfeite: a partir do momento em que o formulário de
 * teste pede CPF, a política de privacidade passa a ser exigência da LGPD, e
 * ela precisa estar alcançável de qualquer página — não só de dentro do
 * cadastro. As duas páginas existem em `/termos` e `/privacidade` e estão
 * marcadas como pendentes de redação: elas PRECISAM ser escritas antes de a
 * landing ir ao ar.
 */

const COLUMNS = [
  {
    title: 'Produto',
    links: [
      { label: 'Vitrine e pedidos', href: '/#vender' },
      { label: 'Encomendas', href: '/#encomendar' },
      { label: 'Estoque', href: '/#estoque' },
      { label: 'Custo e financeiro', href: '/#financeiro' },
    ],
  },
  {
    title: 'Cantina',
    links: [
      { label: 'Como começar', href: '/#comecar' },
      { label: 'Dúvidas frequentes', href: '/#duvidas' },
      { label: 'Teste grátis', href: '/teste-gratis' },
      { label: 'Acessar o painel', href: '/entrar' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Termos de uso', href: '/termos' },
      { label: 'Política de privacidade', href: '/privacidade' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-sand-200 bg-sand-50/60">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Wordmark />
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              Vitrine, encomendas, estoque e custo real para quem vive de fazer doce.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="font-display text-sm font-medium text-ink">{column.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {/* O deslocamento de 2px no hover dá ao link uma área de
                        resposta que a mudança de cor sozinha não dá — útil numa
                        coluna de links pequenos e próximos. */}
                    <Link
                      href={link.href}
                      className="inline-block text-sm text-ink-muted transition-[color,transform] duration-200 ease-out hover:translate-x-0.5 hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-sand-200 pt-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Cantina. Todos os direitos reservados.</p>
          {/* PLACEHOLDER: razão social e CNPJ da empresa — obrigatórios no rodapé
              de quem vende para consumidor e cobra assinatura recorrente. */}
          <p>[Razão social] · CNPJ [00.000.000/0001-00]</p>
        </div>
      </div>
    </footer>
  );
}
