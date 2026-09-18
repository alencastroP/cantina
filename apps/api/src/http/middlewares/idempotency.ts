import type { RequestHandler } from 'express';

import { badRequest } from '../errors/app-error';

/**
 * Chave de idempotência (invariante 6).
 *
 * A vitrine roda em celular com rede ruim: o cliente aperta "enviar", perde
 * sinal, aperta de novo. Sem chave, isso vira dois pedidos — e duas reservas
 * de estoque.
 *
 * A deduplicação em si acontece no banco: `delivery_orders` e `preorders`
 * têm índice único em `(tenant_id, idempotency_key)`, e o serviço trata a
 * violação devolvendo o pedido já criado. Este middleware só garante que a
 * chave chegou e está sã, para o serviço não precisar checar isso.
 *
 * Limitação conhecida: não há replay do CORPO da resposta para chamadas
 * repetidas de rotas sem registro próprio. Quando aparecer a primeira rota
 * assim, entra uma tabela `idempotency_records` — hoje seria infraestrutura
 * sem usuário.
 */

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{16,128}$/;

export const requireIdempotencyKey: RequestHandler = (req, _res, next) => {
  const key = req.header('idempotency-key');

  if (!key) {
    next(
      badRequest('Header Idempotency-Key é obrigatório nesta rota.', {
        header: 'Idempotency-Key',
      }),
    );
    return;
  }

  if (!KEY_PATTERN.test(key)) {
    next(
      badRequest('Idempotency-Key inválida: use de 16 a 128 caracteres [A-Za-z0-9_.:-].', {
        header: 'Idempotency-Key',
      }),
    );
    return;
  }

  next();
};

export function getIdempotencyKey(req: { header(name: string): string | undefined }): string | null {
  return req.header('idempotency-key') ?? null;
}
