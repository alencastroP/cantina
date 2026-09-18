'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError } from './api';

/**
 * Busca de dados.
 *
 * Deliberadamente pequeno: não há cache entre telas, nem revalidação em foco,
 * nem deduplicação. TanStack Query resolve tudo isso e vai valer o peso quando
 * o kanban precisar de polling com invalidação cruzada (F7) — até lá, um hook
 * de trinta linhas evita uma dependência que ninguém está usando de verdade.
 *
 * `path: null` desliga a busca. É como se espera por um id que ainda não
 * existe, sem quebrar a regra dos hooks.
 */

export interface UseApiResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Recarrega mantendo os dados atuais na tela, sem piscar o esqueleto. */
  reload: () => void;
}

export interface UseApiOptions {
  /**
   * Recarrega sozinho a cada N milissegundos (P10).
   *
   * Pausa quando a aba está oculta: o kanban fica aberto o dia inteiro num
   * tablet do balcão, e continuar consultando com a tela apagada só gasta
   * bateria e banco.
   */
  refreshMs?: number;
}

export function useApi<T>(path: string | null, options: UseApiOptions = {}): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  // Resposta de uma busca antiga não pode sobrescrever a atual: quem digita
  // rápido dispara várias, e elas não voltam na ordem em que saíram.
  const requestId = useRef(0);

  useEffect(() => {
    if (path === null) {
      setData(null);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);

    void (async () => {
      try {
        const result = await api.get<T>(path, { signal: controller.signal });
        if (id !== requestId.current) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted || id !== requestId.current) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, { code: 'network_error', message: 'Sem conexão com o servidor.' }),
        );
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const { refreshMs } = options;

  useEffect(() => {
    if (!refreshMs || path === null) return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, refreshMs);

    // Voltar para a aba recarrega na hora: quem estava com o kanban aberto e
    // volta quer ver o pedido que entrou, não esperar o próximo ciclo.
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshMs, path, reload]);

  return { data, error, loading, reload };
}

/**
 * Atrasa o valor até parar de mudar.
 *
 * Usado na busca: sem isto, cada tecla vira uma requisição, e o servidor
 * recebe oito consultas para uma palavra de oito letras.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Estado de uma ação de escrita: enviando, erro, erros por campo.
 *
 * Concentra o `try/catch` que toda tela de formulário repetiria, incluindo a
 * tradução de `validation_error` para erros por campo.
 */
export interface MutationState {
  submitting: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  /**
   * O erro da API, inteiro.
   *
   * Existe porque `error` (texto) e `fieldErrors` cobrem o caso comum, mas
   * algumas telas precisam do `code` e dos `details` — o conflito de telefone,
   * por exemplo, traz o id de quem já existe, e a tela oferece ir até lá em
   * vez de mandar procurar de novo.
   */
  apiError: ApiError | null;
}

export function useMutation() {
  const [state, setState] = useState<MutationState>({
    submitting: false,
    error: null,
    fieldErrors: {},
    apiError: null,
  });

  const run = useCallback(async <T>(action: () => Promise<T>): Promise<T | null> => {
    setState({ submitting: true, error: null, fieldErrors: {}, apiError: null });
    try {
      const result = await action();
      setState({ submitting: false, error: null, fieldErrors: {}, apiError: null });
      return result;
    } catch (caught) {
      if (caught instanceof ApiError) {
        setState({
          submitting: false,
          error: caught.code === 'validation_error' ? null : caught.message,
          fieldErrors: caught.fieldErrors,
          apiError: caught,
        });
      } else {
        setState({
          submitting: false,
          error: 'Não foi possível concluir. Verifique sua conexão.',
          fieldErrors: {},
          apiError: null,
        });
      }
      return null;
    }
  }, []);

  const reset = useCallback(
    () => setState({ submitting: false, error: null, fieldErrors: {}, apiError: null }),
    [],
  );

  return { ...state, run, reset };
}
