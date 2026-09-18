import type { UserRole } from '@cantina/contracts';
import type { ComponentType, SVGProps } from 'react';

import {
  CalendarIcon,
  CustomersIcon,
  FinanceIcon,
  HomeIcon,
  OrdersIcon,
  PlanIcon,
  ProductsIcon,
  RecipeIcon,
  ReportIcon,
  SettingsIcon,
  StockIcon,
} from './icons';

/**
 * Navegação do painel.
 *
 * `status: 'soon'` é honesto de propósito: o item aparece, mas não vira link.
 * Mostrar a forma inteira do produto ajuda o lojista a entender o que vem —
 * e um link que leva a lugar nenhum é pior que nenhum link.
 *
 * Cada item vira `ready` quando a fase correspondente do FRONTEND.md entrega.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  status: 'ready' | 'soon';
  /** Aparece na barra inferior do celular. No máximo quatro. */
  primary?: boolean;
  /**
   * Papéis que enxergam o item. Ausente significa "todos".
   *
   * Precisa espelhar o `requireRole` da rota correspondente na API: um link
   * que só devolve 403 é pior que link nenhum — ele ensina o atendente a
   * ignorar mensagens de erro.
   */
  roles?: UserRole[];
}

/** Financeiro e relatórios: o mesmo recorte que a API aplica (§6.9). */
const FINANCE_ROLES: UserRole[] = ['owner', 'manager', 'finance'];

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Operação',
    items: [
      { href: '/painel', label: 'Início', icon: HomeIcon, status: 'ready', primary: true },
      { href: '/painel/pedidos', label: 'Pedidos', icon: OrdersIcon, status: 'ready', primary: true },
      { href: '/painel/encomendas', label: 'Encomendas', icon: OrdersIcon, status: 'ready' },
      { href: '/painel/calendario', label: 'Calendário', icon: CalendarIcon, status: 'ready' },
    ],
  },
  {
    label: 'Cadastro',
    items: [
      { href: '/painel/produtos', label: 'Produtos', icon: ProductsIcon, status: 'ready', primary: true },
      { href: '/painel/estoque', label: 'Estoque', icon: StockIcon, status: 'ready', primary: true },
      {
        href: '/painel/fichas',
        label: 'Fichas técnicas',
        icon: RecipeIcon,
        status: 'ready',
        // Receita e custo exigem `manager` para LER (módulo 4).
        roles: ['owner', 'manager'],
      },
      { href: '/painel/clientes', label: 'Clientes', icon: CustomersIcon, status: 'ready' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      {
        href: '/painel/financeiro',
        label: 'Financeiro',
        icon: FinanceIcon,
        status: 'ready',
        roles: FINANCE_ROLES,
      },
      {
        href: '/painel/relatorios',
        label: 'Relatórios',
        icon: ReportIcon,
        status: 'ready',
        roles: FINANCE_ROLES,
      },
      {
        href: '/painel/assinatura',
        label: 'Assinatura',
        icon: PlanIcon,
        status: 'ready',
        // Só o dono: quem contrata e cancela é quem paga, e um gerente com
        // acesso a isto poderia derrubar a loja sem o dono saber.
        roles: ['owner'],
      },
      { href: '/painel/configuracoes', label: 'Configurações', icon: SettingsIcon, status: 'ready' },
    ],
  },
];

export const PRIMARY_NAV: NavItem[] = NAV_SECTIONS.flatMap((section) =>
  section.items.filter((item) => item.primary),
);

/** Filtra pelo papel de quem está logado. Sem papel ainda, mostra o básico. */
export function visibleSections(role: UserRole | undefined): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || (role && item.roles.includes(role))),
  })).filter((section) => section.items.length > 0);
}

/** `/painel` só casa exato; o resto casa por prefixo (subrotas ficam ativas). */
export function isActive(pathname: string, href: string): boolean {
  return href === '/painel' ? pathname === href : pathname.startsWith(href);
}
