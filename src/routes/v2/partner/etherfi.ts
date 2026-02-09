import type { Token } from "@beefyfinance/blockchain-addressbook";
import Decimal from "decimal.js";
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifySchema,
} from "fastify";
import S from "fluent-json-schema";
import type { Hex } from "viem";
import type { ChainId } from "../../../config/chains";
import { getChainsByProvider } from "../../../config/chains";
import { addressSchema } from "../../../schema/address";
import { bigintSchema } from "../../../schema/bigint";
import { chainSchema } from "../../../schema/chain";
import { getTokenConfigBySymbol } from "../../../utils/addressbook";
import { getAsyncCache } from "../../../utils/async-lock";
import { getUserTVLAtBlock } from "../../../vault-breakdown/fetchAllUserBreakdown";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void,
) {
  // balances endpoint
  {
    type UrlParams = {
      chain: ChainId;
    };

    const urlParamsSchema = S.object().prop(
      "chain",
      chainSchema.required().description("Chain to query balances for"),
    );
    type QueryParams = {
      blockNumber: bigint;
      addresses?: Hex[];
    };

    const querySchema = S.object()
      .prop(
        "blockNumber",
        bigintSchema
          .required()
          .description("Block number to query balances at"),
      )
      .prop(
        "addresses",
        S.array()
          .items(addressSchema)
          .description("Addresses to query balances for"),
      );

    const responseSchema = S.object();

    const schema: FastifySchema = {
      tags: ["v2"],
      params: urlParamsSchema,
      querystring: querySchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams; Querystring: QueryParams }>(
      "/:chain/points-integration/user-balance",
      { schema },
      async (request, reply) => {
        const { chain } = request.params;
        const { blockNumber, addresses } = request.query;
        const providerId = "etherfi" as const;

        const validChains = getChainsByProvider(providerId);
        const chainConfig = validChains.find((c) => c.id === chain);
        if (!chainConfig) {
          reply.code(404).send({
            error: "Chain not supported for provider",
            validChains: validChains.map((c) => c.id),
          });
          return;
        }

        const symbols = chainConfig.providers[providerId];
        if (!symbols) {
          reply.code(404).send({
            error: "Chain not supported for provider",
            validChains: validChains.map((c) => c.id),
          });
          return;
        }

        const tokensFilter = symbols
          .map((s) => getTokenConfigBySymbol(chainConfig.id, s))
          .filter(Boolean) as Token[];

        if (!tokensFilter.length) {
          reply.code(404).send({
            error: "No tokens found for chain",
          });
          return;
        }

        const result = await getEtherFiRows(
          chainConfig.id,
          addresses || [],
          tokensFilter,
          BigInt(blockNumber),
        );
        reply.send({
          Result: result,
        });
      },
    );
  }

  done();
}

const getEtherFiRows = async (
  chain: ChainId,
  holderContractAddressesFilter: Hex[],
  tokenAddressesFilter: Token[],
  blockNumber: bigint,
) => {
  const asyncCache = getAsyncCache();

  const balances = await asyncCache.wrap(
    `etherfi:breakdown:${chain}:${blockNumber}`,
    30_000,
    () =>
      getUserTVLAtBlock(chain, blockNumber, (vault) => {
        return vault.pointStructureIds.includes("etherfi");
      }),
  );

  const balanceAggByUser = balances
    .filter((b) =>
      tokenAddressesFilter.some(
        (t) =>
          t.address.toLocaleLowerCase() === b.token_address.toLocaleLowerCase(),
      ),
    )
    .filter(
      (b) =>
        holderContractAddressesFilter.length === 0 ||
        holderContractAddressesFilter.some(
          (a) => a.toLocaleLowerCase() === b.user_address.toLocaleLowerCase(),
        ),
    )
    .reduce(
      (acc, b) => {
        acc[b.user_address.toLocaleLowerCase() as Hex] =
          acc[b.user_address.toLocaleLowerCase() as Hex] || new Decimal(0);

        const token = tokenAddressesFilter.find(
          (t) =>
            t.address.toLocaleLowerCase() ===
            b.token_address.toLocaleLowerCase(),
        );
        if (!token) {
          throw new Error("Token not found");
        }

        const decimalizedBalance = new Decimal(
          b.token_balance.balance.toString(10),
        ).div(new Decimal(10).pow(token.decimals));

        acc[b.user_address.toLocaleLowerCase() as Hex] =
          acc[b.user_address.toLocaleLowerCase() as Hex].add(
            decimalizedBalance,
          );
        return acc;
      },
      {} as Record<Hex, Decimal>,
    );

  return Object.entries(balanceAggByUser).map(([address, balance]) => ({
    address,
    effective_balance: balance.toNumber(),
  }));
};
