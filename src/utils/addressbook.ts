import { type Token, addressBook } from '@beefyfinance/blockchain-addressbook';
import type { Hex } from 'viem';
import type { ChainId } from '../config/chains';

export const getTokenAddressBySymbol = (chainId: ChainId, symbol: string): Hex | null => {
  return (addressBook[chainId]?.tokens[symbol]?.address as Hex) || null;
};

export const getTokenConfigBySymbol = (chainId: ChainId, symbol: string): Token | null => {
  return addressBook[chainId]?.tokens[symbol] ?? null;
};

export const getTokenConfigByAddress = (chainId: ChainId, address: Hex): Token | null => {
  for (const token of Object.values(addressBook[chainId]?.tokens ?? {})) {
    if (token.address.toLowerCase() === address.toLowerCase()) {
      return token;
    }
  }
  return null;
};

export const getWNativeToken = (chainId: ChainId): Token => {
  const token = addressBook[chainId]?.tokens.WNATIVE;
  if (!token) {
    throw new Error(`WNATIVE token is not available on chain ${chainId}`);
  }
  return token;
};

export const getNativeTokenSymbol = (chainId: ChainId): string => {
  return addressBook[chainId]?.native.symbol;
};

export const isNativeToken = (chainId: ChainId, symbol: string) => {
  if (symbol === getNativeTokenSymbol(chainId)) {
    return true;
  }

  const wnative = getWNativeToken(chainId);
  return `W${symbol}` === wnative.symbol || symbol === 'ETH';
};
