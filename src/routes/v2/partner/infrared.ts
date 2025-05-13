import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifySchema,
} from "fastify";
import S from "fluent-json-schema";
import { bigintSchema } from "../../../schema/bigint";
import { getAsyncCache } from "../../../utils/async-lock";
import { ChainId } from "../../../config/chains";
import { addressSchema } from "../../../schema/address";
import { getBeefyVaultConfig } from "../../../vault-breakdown/vault/getBeefyVaultConfig";
import { getTokenBalances } from "../../../vault-breakdown/vault/getTokenBalances";
import { Hex } from "viem";
import { getViemClient } from "../../../utils/viemClient";
import { FriendlyError } from "../../../utils/error";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  {
    type UrlParams = {
      contract: string;
      block: string;
    };

    const urlParamsSchema = S.object()
      .prop(
        "block",
        bigintSchema
          .required()
          .description("Return data up to this block number")
      )
      .prop(
        "contract",
        addressSchema.required().description("The contract address")
      );

    const schema: FastifySchema = {
      tags: ["v2"],
      params: urlParamsSchema,
      response: {
        200: S.object()
          .prop(
            "data",
            S.array().items(
              S.object()
                .prop("address", addressSchema)
                .prop("balance", bigintSchema)
            )
          )
          .prop("timestamp", bigintSchema),
      },
    };

    instance.get<{ Params: UrlParams }>(
      "/ir_points_program/:contract/:block",
      { schema },
      async (request, reply) => {
        const { contract, block } = request.params;
        const chain: ChainId = "berachain";

        try {
          const res = await getInfraredRows(
            chain,
            BigInt(block),
            contract as Hex
          );
          if (!res) {
            reply.status(404);
            reply.send("Not found");
            return;
          }
          reply.send(res);
        } catch (e) {
          if (e instanceof FriendlyError) {
            reply.status(404);
            reply.send({ error: e.message });
          } else {
            throw e;
          }
        }
      }
    );
  }

  done();
}

export const getInfraredRows = async (
  chain: ChainId,
  blockNumber: bigint,
  contract: Hex
) => {
  const asyncCache = getAsyncCache();

  const balances = await asyncCache.wrap(
    `infrared:breakdown:${chain}:${contract.toLowerCase()}:${blockNumber.toString()}`,
    30_000,
    async () => {
      const allVaultConfigs = await getBeefyVaultConfig(
        chain,
        (vault) =>
          vault.pointStructureIds.includes("infrared") &&
          vault.vault_address.toLowerCase() === contract.toLowerCase()
      );

      if (allVaultConfigs.length === 0) {
        return [];
      }
      if (allVaultConfigs.length > 1) {
        throw new Error(`Multiple vaults found for address ${contract}`);
      }

      const vaultConfig = allVaultConfigs[0];

      const balances = await getTokenBalances(chain, {
        blockNumber,
        amountGt: 0n,
        tokenAddresses: [vaultConfig.vault_address],
      });

      return balances;
    }
  );

  const blockTimestamp = await asyncCache.wrap(
    `infrared:block:${chain}:${blockNumber.toString()}`,
    30_000,
    async () => {
      const client = getViemClient(chain);
      const block = await client.getBlock({ blockNumber: blockNumber });
      return block.timestamp;
    }
  );

  return {
    data: balances
      .filter((b) => b.balance > 0n)
      .map((b) => ({
        address: b.user_address,
        balance: b.balance.toString(),
      })),
    timestamp: blockTimestamp,
  };
};
