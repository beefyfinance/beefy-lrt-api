import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
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
      bigintSchema.required().description('Return blocks up to this block number')
    );

    const schema: FastifySchema = {
      tags: ['v2'],
      params: urlParamsSchema,
      response: {
        200: S.string(),
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/kava/:block/time-weighted-underlying',
      { schema },
      async (request, reply) => {
        const { block } = request.params;
        const res = await getKinetixRows(BigInt(block));
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

export const getKinetixRows = async (block: bigint) => {
  const res = await graphClient
    .KinetixTimeWeightedBalance(
      {
        block_number: Number(block),
        vault_address: '0x9a207D4D2ee8175995C69c0Fb1F117Bf7CcC93cd', // kinetix-klp
      },
      { chainName: 'kava' }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  if (!res.beefyVault) {
    return null;
  }

  return {
    shareToken: res.beefyVault.sharesToken,
    underlyingToken: {
      address: res.beefyVault.underlyingToken.address,
      symbol: res.beefyVault.underlyingToken.symbol,
      decimals: res.beefyVault.underlyingToken.decimals,
    },
    balances: res.beefyVault.underlyingToken.investorPositionBalanceBreakdowns.map(b => ({
      address: b.investorPosition.investor.address,
      share_amount: b.investorPosition.rawSharesBalance,
      underlying_amount: b.rawBalance,
      time_weighted_underlying_amount_1h: BigInt(b.rawTimeWeightedBalance) / (60n * 60n),
    })),
  };
};
