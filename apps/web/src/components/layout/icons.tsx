import type { SVGProps } from 'react';

/**
 * Ícones desenhados à mão, em vez de uma biblioteca.
 *
 * São poucos e não crescem muito: uma dependência de ícones traria centenas
 * para o bundle e um traço que não é o nosso. Todos usam `currentColor` e
 * traço de 1.75 — mais fino que o padrão de 2, que sobre bege pesa demais.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
    <path d="M9.5 20v-6h5v6" />
  </Icon>
);

export const OrdersIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 3h12l1.5 4H4.5L6 3Z" />
    <path d="M4.5 7h15v12a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V7Z" />
    <path d="M9.5 11.5h5" />
  </Icon>
);

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const ProductsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
    <path d="M4 8.5 12 13l8-4.5M12 13v7" />
  </Icon>
);

export const StockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13" width="7" height="7" rx="1.5" />
  </Icon>
);

export const RecipeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 19.5v-15Z" />
    <path d="M5 17.5h14M9 7.5h6M9 11h6" />
  </Icon>
);

export const CustomersIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6" />
  </Icon>
);

export const FinanceIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
  </Icon>
);

export const ReportIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5V12H3.5Z" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
  </Icon>
);

export const PlanIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18" />
    <path d="M7 14.5h3" />
  </Icon>
);

export const LogoutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 4.5h3.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M10 8.5 6.5 12 10 15.5M6.5 12H15" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12.5 10 17l9-10" />
  </Icon>
);

export const BellIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);

export const ListIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth={2.5} />
  </Icon>
);

export const EyeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const UserIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6" />
  </Icon>
);

export const MapPinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const BasketIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 10h14l-1.4 8.4a2 2 0 0 1-2 1.6H8.4a2 2 0 0 1-2-1.6L5 10Z" />
    <path d="M9 10 8 5.5M15 10l1-4.5M9.5 13.5l.6 4M14.5 13.5l-.6 4" />
  </Icon>
);

export const EyeOffIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 4l16 16" />
    <path d="M9.9 5.8A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.5M6.2 7.4A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 4.3-1" />
    <path d="M10 10.2a3 3 0 0 0 4 4" />
  </Icon>
);

/* --- Vitrine: os dois jeitos de comprar e o que vem com eles ------------- */

export const ScooterIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="6" cy="17.5" r="2.5" />
    <circle cx="18" cy="17.5" r="2.5" />
    <path d="M8.5 17.5H14l3-7.5" />
    <path d="M17 10 15.5 5.5H13" />
    <path d="M3 14.5v-5h6.5v5" />
  </Icon>
);

export const StoreIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 10.5V20h15v-9.5" />
    <path d="M3 5.5 4.5 3h15L21 5.5v1.8a2.7 2.7 0 0 1-4.5 2 2.7 2.7 0 0 1-4.5 0 2.7 2.7 0 0 1-4.5 0 2.7 2.7 0 0 1-4.5-2V5.5Z" />
    <path d="M10 20v-5h4v5" />
  </Icon>
);

export const MinusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14" />
  </Icon>
);

export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7" />
    <path d="m6.5 7 .9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
    <path d="M10.2 11v5.5M13.8 11v5.5" />
  </Icon>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 12h15M13.5 6l6 6-6 6" />
  </Icon>
);

export const ChatIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4 20 1.4-4A7.8 7.8 0 1 1 8.5 19L4 20Z" />
    <path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01" strokeWidth={2.5} />
  </Icon>
);

export const PhoneIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6.5 3.5h2.8l1.4 4.2-2 1.4a11.5 11.5 0 0 0 6.2 6.2l1.4-2 4.2 1.4v2.8a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.5 5.6a2 2 0 0 1 2-2.1Z" />
  </Icon>
);

export const ShieldIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5 5 6v5.5c0 4 2.9 7.6 7 9 4.1-1.4 7-5 7-9V6l-7-2.5Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const CardIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M6.5 14.5h4" />
  </Icon>
);
