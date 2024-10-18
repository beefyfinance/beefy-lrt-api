import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import type { ChainId } from '../../config/chains';
import { chainSchema } from '../../schema/chain';
import { providerSchema } from '../../schema/provider';
import { getAsyncCache } from '../../utils/async-lock';
import { getBeefyVaultConfig } from '../../vault-breakdown/vault/getBeefyVaultConfig';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  const asyncCache = getAsyncCache();

  // all configs with point structure id of some chain
  {
    type UrlParams = {
      chain: ChainId;
      pointStructureId: string;
    };
    const urlParamsSchema = S.object()
      .prop(
        'pointStructureId',
        providerSchema
          .required()
          .description(
            'The point structure id reference: https://api.beefy.finance/points-structures'
          )
      )
      .prop('chain', chainSchema.required().description('Chain to query balances for'));

    const responseSchema = S.object();

    const schema: FastifySchema = {
      tags: ['v2'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:chain/points-earning/:pointStructureId',
      { schema },
      async (request, reply) => {
        const { chain, pointStructureId } = request.params;

        const result = await asyncCache.wrap(
          `config:${chain}`,
          5 * 60 * 1000,
          async () =>
            await getBeefyVaultConfig(chain, vault =>
              vault.pointStructureIds?.includes(pointStructureId)
            )
        );
        reply.send(result);
      }
    );
  }

  done();
}
