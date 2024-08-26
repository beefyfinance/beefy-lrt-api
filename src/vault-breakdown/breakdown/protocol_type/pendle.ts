import { getContract } from 'viem';
import type { BeefyViemClient } from '../../../utils/viemClient';
import { BeefyVaultV7Abi } from '../../abi/BeefyVaultV7Abi';
import { PendleMarketAbi } from '../../abi/PendleMarket';
import type { BeefyVault } from '../../vault/getBeefyVaultConfig';
import type { BeefyVaultBreakdown } from '../types';

// https://etherscan.io/address/0x00000000005BBB0EF59571E58418F9a4357b68A0
// https://arbiscan.io/address/0x00000000005BBB0EF59571E58418F9a4357b68A0
const PENDLE_ROUTER_ADDRESS = '0x00000000005BBB0EF59571E58418F9a4357b68A0';

export const getPendleVaultBreakdown = async (
  client: BeefyViemClient,
  blockNumber: bigint,
  vault: BeefyVault
): Promise<BeefyVaultBreakdown> => {
  const vaultContract = getContract({
    client,
    address: vault.vault_address,
    abi: BeefyVaultV7Abi,
  });

  const pendleMarketContract = getContract({
    client,
    address: vault.undelying_lp_address,
    abi: PendleMarketAbi,
  });

  const [vaultWantBalance, vaultTotalSupply, tokenAddresses, pendleState] = await Promise.all([
    vaultContract.read.balance({ blockNumber }),
    vaultContract.read.totalSupply({ blockNumber }),
    pendleMarketContract.read.readTokens({ blockNumber }),
    pendleMarketContract.read.readState([PENDLE_ROUTER_ADDRESS], { blockNumber }),
  ]);

  return {
    vault,
    blockNumber,
    vaultTotalSupply,
    isLiquidityEligible: true,
    balances: [
      {
        tokenAddress: tokenAddresses[0],
        vaultBalance: (pendleState.totalSy * vaultWantBalance) / pendleState.totalLp,
      },
    ],
  };
};
