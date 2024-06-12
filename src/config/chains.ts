import { keyBy } from 'lodash';
import { keys } from '../utils/object';

export type ProviderId = 'renzo' | 'etherfi' | 'kelp' | 'vector' | 'anzen';
export const allProviderIds: ProviderId[] = [
  'renzo',
  'etherfi',
  'kelp',
  'vector',
  'anzen',
] as const;

export type Chain<T extends string = string> = {
  id: T;
  name: string;
  providers: Partial<Record<ProviderId, string[]>>;
};

function toChainMap<T extends ReadonlyArray<Chain>>(arr: T) {
  return keyBy(arr, 'id') as { [K in T[number]['id']]: Extract<T[number], { id: K }> };
}

const renzo = ['ezETH'];
const etherfi = ['eETH', 'weETH', 'weETH.mode'];
const kelp = ['rsETH', 'wrsETH'];
const vector = ['vETH'];
const anzen = ['USDz'];

const providers = { renzo, etherfi, kelp, vector, anzen };

export const chains = toChainMap([
  {
    id: 'ethereum',
    name: 'Ethereum',
    providers,
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum',
    providers,
  },
  {
    id: 'linea',
    name: 'Linea',
    providers,
  },
  {
    id: 'base',
    name: 'Base',
    providers,
  },
  {
    id: 'optimism',
    name: 'Optimism',
    providers,
  },
  {
    id: 'bsc',
    name: 'BSC',
    providers,
  },
  {
    id: 'mode',
    name: 'Mode',
    providers,
  },
] as const satisfies ReadonlyArray<Chain>);

export type Chains = typeof chains;
export type ChainId = keyof Chains;

export const allChainIds = keys(chains);

export function getChain<T extends ChainId = ChainId>(id: T): Chain<T> {
  if (id in chains) {
    return chains[id];
  }
  throw new Error(`Unknown chain: ${id}`);
}

export function getChainOrUndefined<T extends ChainId = ChainId>(id: T): Chain<T> | undefined {
  if (id in chains) {
    return chains[id];
  }
  return undefined;
}

export function getChainsByProvider(provider: ProviderId): Chain<ChainId>[] {
  return allChainIds.filter(chainId => provider in chains[chainId].providers).map(getChain);
}
