/**
 * Schema completo. É este objeto que o cliente Drizzle recebe.
 *
 * A ordem dos re-exports segue a dependência entre os módulos:
 * plataforma → identidade → configuração → catálogo → insumos → estoque →
 * pedidos → agenda → financeiro.
 */

export * from './enums';
export * from './platform';
export * from './identity';
export * from './settings';
export * from './customers';
export * from './catalog';
export * from './supplies';
export * from './recipes';
export * from './stock';
export * from './availability';
export * from './delivery-orders';
export * from './preorders';
export * from './finance';
export * from './calendar';
export * from './views';
