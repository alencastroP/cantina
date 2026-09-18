'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../../lib/api';

/**
 * Busca de dados da administração.
 *
 * Não reaproveita o `useApi` do painel porque aquele usa o cliente do painel,
 * com o token do painel. Reaproveitá-lo com um parâmetro de cliente daria uma
 * função que às vezes manda um token de plataforma para uma rota de tenant —
 * uma opção a mais para errar, num lugar onde errar significa vazamento.
 */
export function useAdminApi<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // Mesma guarda do painel: resposta antiga não sobrescreve a atual quando
  // alguém digita rápido num filtro.
  const requestId = useRef(0);
  const run = useRef(fetcher);
  run.current = fetcher;

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);

    void (async () => {
      try {
        const result = await run.current();
        if (id !== requestId.current) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (id !== requestId.current) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, { code: 'network_error', message: 'Sem conexão com o servidor.' }),
        );
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, loading, reload };
}
