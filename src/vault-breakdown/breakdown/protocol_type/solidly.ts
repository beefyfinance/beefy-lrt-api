import { type Hex, getContract } from 'viem';
import type { BeefyViemClient } from '../../../utils/viemClient';
import { BeefyVaultV7Abi } from '../../abi/BeefyVaultV7Abi';
import { SolidlyPoolAbi } from '../../abi/SolidlyPoolAbi';
import type { BeefyVault } from '../../vault/getBeefyVaultConfig';
import type { BeefyVaultBreakdown } from '../types';

export const getSolidlyVaultBreakdown = async (
  client: BeefyViemClient,
  blockNumber: bigint,
  vault: BeefyVault
): Promise<BeefyVaultBreakdown> => {
  const vaultContract = getContract({
    client,
    address: vault.vault_address,
    abi: BeefyVaultV7Abi,
  });
  const poolContract = getContract({
    client,
    address: vault.undelying_lp_address,
    abi: SolidlyPoolAbi,
  });

  const [balance, vaultTotalSupply, totalSupply, poolMetadata] = await Promise.all([
    vaultContract.read.balance({ blockNumber }),
    vaultContract.read.totalSupply({ blockNumber }),
    poolContract.read.totalSupply({ blockNumber }),
    poolContract.read.metadata({ blockNumber }),
  ]);

  const t0 = poolMetadata[5];
  const t1 = poolMetadata[6];
  const r0 = poolMetadata[2];
  const r1 = poolMetadata[3];

  return {
    vault,
    blockNumber,
    vaultTotalSupply,
    isLiquidityEligible: true,
    balances: [
      {
        tokenAddress: t0.toLocaleLowerCase() as Hex,
        vaultBalance: (r0 * balance) / totalSupply,
      },
      {
        tokenAddress: t1.toLocaleLowerCase() as Hex,
        vaultBalance: (r1 * balance) / totalSupply,
      },
    ],
  };
};
