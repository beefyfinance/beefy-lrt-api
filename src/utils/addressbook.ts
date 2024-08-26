import { type Token, addressBook } from 'blockchain-addressbook';
import type { Hex } from 'viem';
import type { ChainId } from '../config/chains';

export const getTokenAddressBySymbol = (chainId: ChainId, symbol: string): Hex | null => {
  return (addressBook[chainId]?.tokens[symbol]?.address as Hex) || null;
};

export const getTokenConfigBySymbol = (chainId: ChainId, symbol: string): Token | null => {
  return addressBook[chainId]?.tokens[symbol] ?? null;
};
