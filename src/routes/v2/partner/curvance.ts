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
import { groupBy, keyBy, zip } from "lodash";
import { getViemClient } from "../../../utils/viemClient";
import {
  BeefyVault,
  getBeefyVaultConfig,
} from "../../../vault-breakdown/vault/getBeefyVaultConfig";

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
        reply.send(result);
      }
    );
  }

  done();
}

const curvanceProductFilter = (vault: BeefyVault) => {
  return (
    vault.pointStructureIds.includes("curvance") ||
    vault.platformId === "curvance"
  );
};

const getCurvanceRows = async (chain: ChainId, blockNumber: bigint) => {
  const asyncCache = getAsyncCache();

  let [balances, curvanceProducts] = await asyncCache.wrap(
    `curvance:breakdown:${chain}:${blockNumber}`,
    30_000,
    () =>
      Promise.all([
        getUserTVLAtBlock(chain, blockNumber, curvanceProductFilter),
        getBeefyVaultConfig(chain, curvanceProductFilter),
      ])
  );

  balances = balances.filter((b) => b.token_balance.balance > 0);

  let flatBalances = balances.flatMap((b) =>
    b.details.map((d) => ({
      ...b,
      ...d,
    }))
  );

  const balancesByVaultAddress = groupBy(flatBalances, "vault_address");

  const uniqueStrategyAddresses = [
    ...new Set(curvanceProducts.map((p) => p.strategy_address)),
  ] as `0x${string}`[];
  const viemClient = getViemClient(chain);
  const cTokens = await viemClient.multicall({
    allowFailure: false,
    contracts: uniqueStrategyAddresses.map((address) => ({
      address: address as `0x${string}`,
      abi: curvanceStrategyAbi,
      functionName: "cToken",
      args: [],
    })),
  });

  const cTokensByStrategyAddress = keyBy(
    zip(uniqueStrategyAddresses, cTokens).map(([address, cToken]) => ({
      strategy_address: address,
      cToken: cToken as `0x${string}`,
    })),
    "strategy_address"
  );

  const productsByVaultAddress = keyBy(curvanceProducts, "vault_address");

  return Object.entries(balancesByVaultAddress).map(
    ([vaultAddress, balances]) => {
      const product = productsByVaultAddress[vaultAddress];
      return {
        ...product,
        cToken: cTokensByStrategyAddress[product?.strategy_address]?.cToken,
        balances: balances.map((b) => ({
          user_address: b.user_address,
          token_address: b.token_address,
          token_balance: b.contribution,
        })),
      };
    }
  );
};

const curvanceStrategyAbi = [
  {
    type: "function",
    name: "cToken",
    inputs: [],
    outputs: [{ name: "cToken", type: "address" }],
    stateMutability: "view",
  },
] as const;
