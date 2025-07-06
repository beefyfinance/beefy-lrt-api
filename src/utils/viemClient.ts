import { http, type Chain as ViemChain, createPublicClient, defineChain } from 'viem';
import {
  arbitrum,
  base,
  berachain,
  bsc,
  fraxtal,
  kava,
  linea,
  lisk,
  mainnet,
  manta,
  mantle,
  mode,
  optimism,
  sei,
  sonic,
} from 'viem/chains';
import type { ChainId } from '../config/chains';
import { createCachedFactoryByChainId } from './factory';

const hyperevm = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: {
    decimals: 18,
    name: 'Hyperliquid',
    symbol: 'HYPE',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.hyperliquid.xyz/evm'],
      webSocket: ['wss://rpc.hyperliquid.xyz/evm'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: '"https://www.hyperscan.com' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 13051,
    },
  },
});

function applyEnv(chainId: ChainId, viemChain: ViemChain): ViemChain {
  const url = process.env[`${chainId.toUpperCase()}_RPC`];
  if (!url) {
    return viemChain;
  }

  return {
    ...viemChain,
    rpcUrls: {
      default: { http: [url] },
      public: { http: [url] },
    },
  };
}

const mapping: Record<ChainId, ViemChain> = {
  arbitrum: applyEnv('arbitrum', arbitrum),
  base: applyEnv('base', base),
  berachain: applyEnv('berachain', berachain),
  bsc: applyEnv('bsc', bsc),
  ethereum: applyEnv('ethereum', mainnet),
  fraxtal: applyEnv('fraxtal', fraxtal),
  kava: applyEnv('kava', kava),
  linea: applyEnv('linea', linea),
  lisk: applyEnv('lisk', lisk),
  manta: applyEnv('manta', manta),
  mantle: applyEnv('mantle', mantle),
  mode: applyEnv('mode', mode),
  optimism: applyEnv('optimism', optimism),
  sei: applyEnv('sei', sei),
  sonic: applyEnv('sonic', sonic),
  hyperevm: applyEnv('hyperevm', hyperevm),
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
