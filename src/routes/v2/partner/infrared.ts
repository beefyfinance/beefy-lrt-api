import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { bigintSchema } from '../../../schema/bigint';
import { getAsyncCache } from '../../../utils/async-lock';
import { ChainId } from '../../../config/chains';
import { getUserTVLAtBlock } from '../../../vault-breakdown/fetchAllUserBreakdown';

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
      '/berachain/:block/balances',
      { schema },
      async (request, reply) => {
        const { block } = request.params;
        const res = await getInfraredRows('berachain', BigInt(block));
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

export const getInfraredRows = async (chain: ChainId, block: bigint) => {
  const asyncCache = getAsyncCache();

  const balances = await asyncCache.wrap(`infrared:breakdown:${chain}:${block}`, 30_000, () =>
    getUserTVLAtBlock(chain, block, vault => {
      return vault.pointStructureIds.includes('infrared');
    })
  );

  return balances
    .map(b => ({ ...b, details: undefined }))
    .filter(b => b.token_balance.balance > 0n);
};
