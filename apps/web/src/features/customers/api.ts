import type {
  CreateAddressRequest,
  CreateCustomerRequest,
  Customer,
  CustomerAddress,
  CustomerDetail,
  CustomerOrder,
  Page,
  UpdateAddressRequest,
  UpdateCustomerRequest,
} from '@cantina/contracts';

import { api } from '../../lib/api';

/** Clientes do lojista (§6.3 do PLAN.md). */
export const customersApi = {
  list: (query: string) => api.get<Page<Customer>>(`/customers${query}`),

  get: (id: string) => api.get<CustomerDetail>(`/customers/${id}`),

  create: (body: CreateCustomerRequest) => api.post<CustomerDetail>('/customers', body),

  update: (id: string, body: UpdateCustomerRequest) =>
    api.patch<CustomerDetail>(`/customers/${id}`, body),

  remove: (id: string) => api.delete<void>(`/customers/${id}`),

  orders: (id: string) => api.get<Page<CustomerOrder>>(`/customers/${id}/orders?limit=20`),

  addresses: (id: string) => api.get<CustomerAddress[]>(`/customers/${id}/addresses`),

  createAddress: (id: string, body: CreateAddressRequest) =>
    api.post<CustomerAddress>(`/customers/${id}/addresses`, body),

  updateAddress: (id: string, addressId: string, body: UpdateAddressRequest) =>
    api.patch<CustomerAddress>(`/customers/${id}/addresses/${addressId}`, body),

  removeAddress: (id: string, addressId: string) =>
    api.delete<void>(`/customers/${id}/addresses/${addressId}`),

  anonymize: (id: string, reason?: string) =>
    api.post<Customer>(`/customers/${id}/anonymize`, {
      confirm: true,
      ...(reason ? { reason } : {}),
    }),
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  in_production: 'Em produção',
  ready: 'Pronto',
  out_for_delivery: 'Saiu para entrega',
  completed: 'Concluído',
  canceled: 'Cancelado',
};
