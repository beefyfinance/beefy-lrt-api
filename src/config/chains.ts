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

const anzen = ['USDz' /*, 'sUSDz'*/];
const bedrock = ['uniETH'];
const dolomite = ['dUSDC'];
const ethena = ['USDe'];
const etherfi = ['eETH', 'weETH', 'weETH.mode'];
const kelp = ['rsETH', 'wrsETH'];
const lynex = ['inETH', 'ainETH'];
const renzo = ['ezETH'];
const stakestone = ['STONE'];
const vector = ['vETH'];
const yei = ['yei']; // this token does not exist

const providers = {
  anzen,
  bedrock,
  dolomite,
  ethena,
  etherfi,
  kelp,
  lynex,
  renzo,
  stakestone,
  vector,
  yei,
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
    id: 'manta',
    name: 'Manta',
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
    id: 'sei',
    name: 'Sei',
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
