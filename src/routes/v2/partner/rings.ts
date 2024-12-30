import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import type { Hex } from 'viem';
import { addressSchema } from '../../../schema/address';
import { bigintSchema } from '../../../schema/bigint';
import { getAsyncCache } from '../../../utils/async-lock';
import { getBeefyVaultConfig } from '../../../vault-breakdown/vault/getBeefyVaultConfig';
import { getTokenBalances } from '../../../vault-breakdown/vault/getTokenBalances';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  {
    type UrlParams = {
      block: string;
      vaultAddress: Hex;
    };

    const urlParamsSchema = S.object()
      .prop('block', bigintSchema.required().description('Return data up to this block number'))
      .prop('vaultAddress', addressSchema.required().description('The vault address'));

    const schema: FastifySchema = {
      tags: ['v2'],
      params: urlParamsSchema,
      response: {
        200: S.string(),
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/sonic/:block/:vaultAddress/weights',
      { schema },
      async (request, reply) => {
        const { block, vaultAddress } = request.params;
        const res = await getRingsRows(BigInt(block), vaultAddress);
        if (!res) {
          reply.status(404);
          reply.send('Not found');
          return;
        }
        reply.send(res);
      }
    );
  }

  done();
}

export const getRingsRows = async (block: bigint, vaultAddress: Hex) => {
  const chain = 'sonic';
  const asyncCache = getAsyncCache();

  const configs = await getBeefyVaultConfig(
    chain,
    v =>
      v.vault_address.toLowerCase() === vaultAddress.toLowerCase() ||
      (v.protocol_type === 'beefy_clm_vault' &&
        v.beefy_clm_manager.vault_address.toLowerCase() === vaultAddress.toLowerCase())
  );

  const config = configs?.[0] ?? null;
  if (!config) {
    throw new Error('Vault not found');
  }

  const allAddresses = [
    config.vault_address,
    ...config.reward_pools.map(rp => rp.reward_pool_address),
    ...config.boosts.map(b => b.boost_address),
    ...(config.protocol_type === 'beefy_clm_vault'
      ? [
          config.beefy_clm_manager.vault_address,
          ...config.beefy_clm_manager.boosts.map(b => b.boost_address),
          ...config.beefy_clm_manager.reward_pools.map(rp => rp.reward_pool_address),
        ]
      : []),
  ].map(a => a.toLowerCase() as Hex);

  const balances = await asyncCache.wrap(`${chain}:breakdown:${block}`, 30_000, () =>
    getTokenBalances(chain, { blockNumber: block, amountGt: 0n, tokenAddresses: allAddresses })
  );

  const amountPerHolder = balances
    .filter(b => !allAddresses.includes(b.user_address.toLowerCase() as Hex))
    .filter(b => b.balance > 0n)
    .reduce(
      (acc, b) => {
        if (!acc[b.user_address]) {
          acc[b.user_address] = 0n;
        }
        acc[b.user_address] += b.balance;
        return acc;
      },
      {} as Record<Hex, bigint>
    );

  const hundredPercent = BigInt(10) ** BigInt(36);
  const totalAmount = Object.values(amountPerHolder).reduce((acc, b) => acc + b, 0n);

  const percentagePerHolder = Object.fromEntries(
    Object.entries(amountPerHolder).map(([address, amount]) => [
      address,
      (amount * hundredPercent) / totalAmount,
    ])
  );

  return {
    weights: Object.entries(percentagePerHolder).map(([address, weight]) => ({
      user: address,
      weight,
    })),
  };
};
