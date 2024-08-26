import { http, type Chain as ViemChain, createPublicClient } from 'viem';
import {
  arbitrum,
  base,
  bsc,
  fraxtal,
  kava,
  linea,
  mainnet,
  manta,
  mantle,
  mode,
  optimism,
  sei,
} from 'viem/chains';
import type { ChainId } from '../config/chains';
import { createCachedFactoryByChainId } from './factory';

const mapping: Record<ChainId, ViemChain> = {
  linea: linea,
  arbitrum: arbitrum,
  base: base,
  bsc: bsc,
  ethereum: mainnet,
  fraxtal: fraxtal,
  kava: kava,
  manta: manta,
  mantle: mantle,
  mode: mode,
  optimism: optimism,
  sei: sei,
};

export const getViemClient = createCachedFactoryByChainId(chainId => {
  return createPublicClient({
    chain: mapping[chainId],
    transport: http(),
    batch: {
      multicall: true,
    },
  });
});
export type BeefyViemClient = ReturnType<typeof getViemClient>;
