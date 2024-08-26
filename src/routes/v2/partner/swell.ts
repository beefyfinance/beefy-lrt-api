import { stringify as csvStringify } from 'csv-stringify/sync';
import Decimal from 'decimal.js';
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
  // swell csv endpoint
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
      '/ethereum/:block/time-weighted-holders/csv',
      { schema },
      async (request, reply) => {
        const { block } = request.params;
        const rows = await getSwellRows(BigInt(block));

        const csvStr = csvStringify(
          rows.map(row => [row.address, row.time_weighted_share_percent]),
          {
            header: true,
            columns: ['address', 'time_weighted_share_percent'],
          }
        );

        reply.header('Content-Type', 'text/plain');
        reply.send(csvStr);
      }
    );
  }

  done();
}

export const getSwellRows = async (block: bigint) => {
  const res = await graphClient
    .SwellTimeWeightedBalance(
      {
        block_number: Number(block),
        token_address: '0x5dA90BA82bED0AB701E6762D2bF44E08634d9776',
      },
      { chainName: 'ethereum' }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  if (!res.token) {
    return [];
  }

  const total = new Decimal(
    res.token.investorPositionBalanceBreakdowns
      .map(b => BigInt(b.rawTimeWeightedBalance))
      .reduce((a, b) => a + b)
      .toString()
  );

  return res.token.investorPositionBalanceBreakdowns.map(b => ({
    address: b.investorPosition.investor.address,
    time_weighted_share_percent: new Decimal(BigInt(b.rawTimeWeightedBalance).toString())
      .div(total)
      .toString(),
  }));
};
