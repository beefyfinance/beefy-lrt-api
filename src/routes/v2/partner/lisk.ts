import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { bigintSchema } from '../../../schema/bigint';
import { GraphQueryError } from '../../../utils/error';
import { graphClient } from '../graphClient';
import { getBeefyVaultConfig } from '../../../vault-breakdown/vault/getBeefyVaultConfig';
import { uniq } from 'lodash';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  {
    type UrlParams = {
      block: string;
    };

    const urlParamsSchema = S.object().prop(
      'block',
      bigintSchema.required().description('Return data up to this block number')
    );

    const schema: FastifySchema = {
      tags: ['v2'],
      params: urlParamsSchema,
      response: {
        200: S.string(),
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/lisk/:block/time-weighted-token-breakdown',
      { schema },
      async (request, reply) => {
        const { block } = request.params;
        const res = await getLiskRows(BigInt(block));
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

export const getLiskRows = async (block: bigint) => {
  const vaultConfig = await getBeefyVaultConfig('lisk', () => true);

  const allProductAddresses = vaultConfig
    .map(v => v.vault_address)
    .concat(vaultConfig.flatMap(v => v.reward_pools.map(p => p.reward_pool_address)))
    .concat(vaultConfig.flatMap(v => v.boosts.map(b => b.boost_address)));

  const res = await graphClient
    .TokenBreakdown(
      {
        block_number: Number(block),
        token_addresses: uniq(allProductAddresses) as string[],
      },
      { chainName: 'lisk' }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  const flattened = res.beefyVaults.flatMap(vault =>
    vault.positions.flatMap(position =>
      position.balanceBreakdown.flatMap(breakdown => ({
        vault,
        position,
        breakdown,
      }))
    )
  );

  return flattened.map(f => ({
    vault_address: f.vault.address,
    underlying_token_address: f.breakdown.token?.address,
    underlying_token_symbol: f.breakdown.token?.symbol,
    investor_address: f.position.investor.address,
    latest_share_balance: f.position.rawSharesBalance,
    latest_underlying_balance: f.breakdown.rawBalance,
    time_weighted_underlying_amount_1h: BigInt(f.breakdown.rawTimeWeightedBalance) / (60n * 60n),
    last_update_block: {
      number: f.breakdown.lastUpdateBlock,
      timestamp: f.breakdown.lastUpdateTimestamp,
    },
  }));
};
