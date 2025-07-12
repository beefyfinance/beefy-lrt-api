import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifySchema,
} from "fastify";
import S from "fluent-json-schema";
import type { Hex } from "viem";
import { bigintSchema } from "../../../schema/bigint";
import { getAsyncCache } from "../../../utils/async-lock";
import { getBeefyVaultConfig } from "../../../vault-breakdown/vault/getBeefyVaultConfig";
import { getTokenBalances } from "../../../vault-breakdown/vault/getTokenBalances";
import Decimal from "decimal.js";

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

    const urlParamsSchema = S.object().prop(
      "block",
      bigintSchema.required().description("Return data up to this block number")
    );

    const schema: FastifySchema = {
      tags: ["v2"],
      params: urlParamsSchema,
      response: {
        200: S.string(),
      },
    };

    instance.get<{ Params: UrlParams }>(
      "/ethereum/:block/shares",
      { schema },
      async (request, reply) => {
        const { block } = request.params;
        const res = await getFalconRows(BigInt(block));
        if (!res) {
          reply.status(404);
          reply.send("Not found");
          return;
        }
        reply.send(res);
      }
    );
  }

  done();
}

export const getFalconRows = async (block: bigint) => {
  const chain = "ethereum";
  const asyncCache = getAsyncCache();

  const configs = await getBeefyVaultConfig(chain, (v) =>
    v.pointStructureIds.includes("falcon-miles")
  );

  const allAddresses = configs
    .flatMap((config) => [
      config.vault_address,
      ...config.reward_pools.map((rp) => rp.reward_pool_address),
      ...config.boosts.map((b) => b.boost_address),
      // ...(config.protocol_type === "beefy_clm_vault"
      //   ? [
      //       config.beefy_clm_manager.vault_address,
      //       ...config.beefy_clm_manager.boosts.map((b) => b.boost_address),
      //       ...config.beefy_clm_manager.reward_pools.map(
      //         (rp) => rp.reward_pool_address
      //       ),
      //     ]
      //   : []),
    ])
    .map((a) => a.toLowerCase() as Hex);

  const balances = await asyncCache.wrap(
    `falcon:${chain}:${block}`,
    30_000,
    () =>
      getTokenBalances(chain, {
        blockNumber: block,
        amountGt: 0n,
        tokenAddresses: allAddresses,
      })
  );

  const amountPerContractAndHolder = balances.reduce((acc, b) => {
    if (!acc[b.user_address]) {
      acc[b.user_address] = {};
    }
    if (!acc[b.user_address][b.token_address]) {
      acc[b.user_address][b.token_address] = 0n;
    }
    acc[b.user_address][b.token_address] += b.balance;
    return acc;
  }, {} as Record<Hex, Record<Hex, bigint>>);

  const allUsers = Object.keys(amountPerContractAndHolder) as Hex[];

  return configs.map((config) => {
    if (config.protocol_type === "beefy_clm_vault") {
      throw new Error(
        "CLM vaults are not supported for falcon miles calculations. Ping devz to add support"
      );
    }

    const userBalances = allUsers
      .map((user) => {
        const userBalances = amountPerContractAndHolder[user];
        const vaultShares = userBalances[config.vault_address] ?? 0n;
        const boostShares = config.boosts.reduce(
          (acc, b) => acc + (userBalances[b.boost_address] ?? 0n),
          0n
        );
        const rewardPoolShares = config.reward_pools.reduce(
          (acc, rp) => acc + (userBalances[rp.reward_pool_address] ?? 0n),
          0n
        );
        const totalShares = vaultShares + boostShares + rewardPoolShares;

        return {
          user_address: user,
          total_shares: totalShares,
          details: {
            vault_shares: vaultShares,
            boost_shares: boostShares,
            reward_pool_shares: rewardPoolShares,
          },
        };
      })
      .filter((user) => user.total_shares > 0n);

    const totalShares = userBalances.reduce(
      (acc, user) => acc + user.total_shares,
      0n
    );

    const balancesWithPercentage = userBalances.map((user) => {
      return {
        ...user,
        percentage: new Decimal(user.total_shares.toString()).div(
          new Decimal(totalShares.toString())
        ),
      };
    });

    return {
      vault_id: config.id,
      vault_address: config.vault_address,
      total_shares: totalShares,
      balances: balancesWithPercentage,
    };
  });
};
