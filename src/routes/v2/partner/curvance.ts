import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifySchema,
} from "fastify";
import type { ChainId } from "../../../config/chains";
import { getChainsByProvider } from "../../../config/chains";
import { bigintSchema } from "../../../schema/bigint";
import { chainSchema } from "../../../schema/chain";
import { getAsyncCache } from "../../../utils/async-lock";
import { getUserTVLAtBlock } from "../../../vault-breakdown/fetchAllUserBreakdown";
import S from "fluent-json-schema";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // balances endpoint
  {
    type UrlParams = {
      chain: ChainId;
      blockNumber: string;
    };

    const urlParamsSchema = S.object()
      .prop(
        "chain",
        chainSchema.required().description("Chain to query balances for")
      )
      .prop(
        "blockNumber",
        bigintSchema.required().description("Block number to query balances at")
      );

    const responseSchema = S.object();

    const schema: FastifySchema = {
      tags: ["v2"],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      "/:chain/points-integration/:blockNumber/user-balance",
      { schema },
      async (request, reply) => {
        const { chain, blockNumber } = request.params;
        const providerId = "curvance" as const;

        const validChains = getChainsByProvider(providerId);
        const chainConfig = validChains.find((c) => c.id === chain);
        if (!chainConfig) {
          reply.code(404).send({
            error: "Chain not supported for provider",
            validChains: validChains.map((c) => c.id),
          });
          return;
        }

        const result = await getCurvanceRows(
          chainConfig.id,
          BigInt(blockNumber)
        );
        reply.send({
          Result: result,
        });
      }
    );
  }

  done();
}

const getCurvanceRows = async (chain: ChainId, blockNumber: bigint) => {
  const asyncCache = getAsyncCache();

  const balances = await asyncCache.wrap(
    `curvance:breakdown:${chain}:${blockNumber}`,
    30_000,
    () =>
      getUserTVLAtBlock(chain, blockNumber, (vault) => {
        return (
          vault.pointStructureIds.includes("curvance") ||
          vault.platformId === "curvance"
        );
      })
  );

  return balances.filter((b) => b.token_balance.balance > 0);
};
