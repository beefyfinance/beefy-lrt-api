import { keyBy } from 'lodash';
import { keys } from '../utils/object';

export type Chain<T extends string = string> = {
  id: T;
  name: string;
  providers: Partial<Record<ProviderId, string[]>>;
};

function toChainMap<T extends ReadonlyArray<Chain>>(arr: T) {
  return keyBy(arr, 'id') as {
    [K in T[number]['id']]: Extract<T[number], { id: K }>;
  };
}

const ethena = ['USDe', 'sUSDe'];
const etherfi = ['eETH', 'weETH', 'weETH.mode'];
const infrared = ['infrared']; // whitelisted by platform
const resolv = ['resolv']; // this token does not exist

const providers = {
  ethena,
  etherfi,
  infrared,
  resolv,
};

export type ProviderId = keyof typeof providers;
export const allProviderIds: ProviderId[] = keys(providers);

export const chains = toChainMap([
  {
    id: 'arbitrum',
    name: 'Arbitrum',
    providers,
  },
  {
    id: 'base',
    name: 'Base',
    providers,
  },
  {
    id: 'berachain',
    name: 'Berachain',
    providers,
  },
  {
    id: 'bsc',
    name: 'BSC',
    providers,
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    providers,
  },
  {
    id: 'fraxtal',
    name: 'Fraxtal',
    providers,
  },
  {
    id: 'hyperevm',
    name: 'Hyperevm',
    providers,
  },
  {
    id: 'kava',
    name: 'Kava',
    providers,
  },
  {
    id: 'linea',
    name: 'Linea',
    providers,
  },
  {
    id: 'lisk',
    name: 'Lisk',
    providers,
  },
  {
    id: 'manta',
    name: 'Manta',
    providers,
  },
  {
    id: 'mantle',
    name: 'Mantle',
    providers,
  },
  {
    id: 'mode',
    name: 'Mode',
    providers,
  },
  {
    id: 'optimism',
    name: 'Optimism',
    providers,
  },
  {
    id: 'plasma',
    name: 'Plasma',
    providers,
  },
  {
    id: 'sei',
    name: 'Sei',
    providers,
  },
  {
    id: 'sonic',
    name: 'Sonic',
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
