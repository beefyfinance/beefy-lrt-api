import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import type { ChainId } from '../../../config/chains';
import { bigintSchema } from '../../../schema/bigint';
import { GraphQueryError } from '../../../utils/error';
import { graphClient } from '../graphClient';

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
      '/sei/:block/time-weighted-token-breakdown',
      { schema },
      async (request, reply) => {
        const { block } = request.params;
        const res = await getYeiRows(BigInt(block));
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

export const getYeiRows = async (block: bigint) => {
  const tokens = await getTokenConfig('sei', ['SEI', 'WSEI', 'USDT', 'USDC']);
  const tokenAddresses = tokens.map(t => t.address);

  console.log({
    block_number: Number(block),
    platform: 'AAVE', // this is because that field contains the token breakdown strategy and not the actual platform
    token_addresses: tokenAddresses,
  });
  const res = await graphClient
    .TokenBreakdownByPlatform(
      {
        block_number: Number(block),
        platform: 'AAVE', // this is because that field contains the token breakdown strategy and not the actual platform
        token_addresses: tokenAddresses,
      },
      { chainName: 'sei' }
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
    underlying_token_address: f.vault.underlyingToken.address,
    underlying_token_symbol: f.vault.underlyingToken.symbol,
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

const getTokenConfig = async (chain: ChainId, tokenSymbols: string[]) => {
  const res = await graphClient
    .TokenSearchBySymbol(
      {
        token_symbols: tokenSymbols,
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  return res.tokens;
};
