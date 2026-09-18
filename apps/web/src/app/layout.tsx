import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

/**
 * Fontes carregadas pelo `next/font`: elas são baixadas no build e servidas do
 * mesmo domínio, então não há requisição a terceiros nem salto de layout
 * quando a fonte troca.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  // `soft` arredonda as serifas; é o que separa "aconchegante" de "jornal".
  axes: ['SOFT', 'WONK'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Cantina',
    template: '%s · Cantina',
  },
  description: 'Vitrine e gestão para pequenos negócios de comida.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // A cor da barra do navegador no celular acompanha o bege da página.
  themeColor: '#f7f1e8',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-canvas text-ink">{children}</body>
    </html>
  );
}
