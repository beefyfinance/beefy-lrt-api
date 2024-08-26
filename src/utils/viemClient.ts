import { http, type Chain as ViemChain, createPublicClient } from 'viem';
import { arbitrum, base, bsc, kava, linea, mainnet, manta, mode, optimism, sei } from 'viem/chains';
import type { ChainId } from '../config/chains';
import { createCachedFactoryByChainId } from './factory';

const mapping: Record<ChainId, ViemChain> = {
  linea: linea,
  arbitrum: arbitrum,
  base: base,
  bsc: bsc,
  ethereum: mainnet,
  kava: kava,
  manta: manta,
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
