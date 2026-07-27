'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * Devolve false durante o render do servidor e no primeiro render do cliente,
 * true depois da hidratação.
 *
 * Serve para componentes cujo conteúdo real só existe no cliente — tema salvo,
 * dados de localStorage — e que causariam divergência de hidratação se
 * renderizassem o valor verdadeiro de cara.
 *
 * Usa useSyncExternalStore em vez do par useState + useEffect porque chamar
 * setState dentro de um efeito dispara um render em cascata, que o lint do
 * React 19 sinaliza como erro.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
