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
import { Hex } from "viem";
import { getViemClient } from "../../../utils/viemClient";
import { FriendlyError } from "../../../utils/error";
import Decimal from "decimal.js";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  {
    type UrlParams = {
      user_address: string;
    };

    const urlParamsSchema = S.object().prop(
      "user_address",
      addressSchema.required().description("The user address")
    );

    const schema: FastifySchema = {
      tags: ["v2"],
      params: urlParamsSchema,
      response: {
        200: S.object()
          .prop("isValid", S.boolean())
          .prop("message", S.string())
          .prop(
            "result",
            S.object()
              .prop("currentBlockNumber", bigintSchema)
              .prop("previousBlockNumber", bigintSchema)
              .prop("balance", bigintSchema)
              .prop("price", S.number())
              .prop("balanceUSD", S.number())
          ),
      },
    };

    instance.get<{ Params: UrlParams }>(
      "/verify/:user_address",
      { schema },
      async (request, reply) => {
        const { user_address } = request.params;
        const chain: ChainId = "base";

        try {
          const res = await getOrbiterResult(chain, user_address as Hex);
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

const MS_PER_BLOCK: Partial<Record<ChainId, number>> = {
  base: 2000,
};

const REORG_BUFFER_BLOCKS: Partial<Record<ChainId, number>> = {
  base: 60,
};

async function getBlocks(chain: ChainId) {
  const client = getViemClient(chain);

  const msPerBlock = MS_PER_BLOCK[chain];
  if (!msPerBlock) {
    throw new FriendlyError(
      `Chain ${chain} not supported, please add it to the MS_PER_BLOCK map`
    );
  }

  const reorgBufferBlocks = REORG_BUFFER_BLOCKS[chain];
  if (!reorgBufferBlocks) {
    throw new FriendlyError(
      `Chain ${chain} not supported, please add it to the REORG_BUFFER_BLOCKS map`
    );
  }

  const currentBlockNumber = await client.getBlockNumber();
  const previousBlockNumber =
    currentBlockNumber - (24n * 60n * 60n * 1000n) / BigInt(msPerBlock);
  return {
    currentBlockNumber: currentBlockNumber - BigInt(reorgBufferBlocks),
    previousBlockNumber: previousBlockNumber - BigInt(reorgBufferBlocks),
  };
}

async function getBalances(
  chain: ChainId,
  vaultId: string,
  blockNumber: bigint
) {
  const url = `https://balance-api.beefy.finance/api/v1/vault/${chain}/${vaultId}/${blockNumber}/bundle-holder-share`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new FriendlyError(
      `Failed to get balances for vault ${vaultId} at block ${blockNumber}: ${response.statusText}`
    );
  }
  const data = (await response.json()) as {
    holder: Hex;
    balance: string;
    hold_details: {
      token: Hex;
      balance: string;
    }[];
  }[];
  return data.map((b) => ({
    holder: b.holder,
    balance: new Decimal(b.balance),
  }));
}

async function getVaultLpPrices() {
  const url = `https://api.beefy.finance/lps`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new FriendlyError(
      `Failed to get token price: ${response.statusText}`
    );
  }
  const data = (await response.json()) as Record<string, number>;
  return data;
}

export const getOrbiterResult = async (chain: ChainId, userAddress: Hex) => {
  const asyncCache = getAsyncCache();

  const vaultId = "uniswap-cow-base-clanker-weth";

  const { currentBlockNumber, previousBlockNumber } = await asyncCache.wrap(
    `orbiter:blocks:${chain}`,
    30_000,
    async () => await getBlocks(chain)
  );

  const vaultConfigs = await getBeefyVaultConfig(
    chain,
    (v) => v.id === vaultId
  );
  const vaultConfig = vaultConfigs?.at(0);
  if (!vaultConfig) {
    throw new FriendlyError(
      `Vault config not found for chain ${chain} and vault id ${vaultId}`
    );
  }

  const currentBalances = await asyncCache.wrap(
    `orbiter:balances:${chain}:${vaultId}:${currentBlockNumber}`,
    30_000,
    async () => await getBalances(chain, vaultId, currentBlockNumber)
  );
  const previousBalances = await asyncCache.wrap(
    `orbiter:balances:${chain}:${vaultId}:${previousBlockNumber}`,
    30_000,
    async () => await getBalances(chain, vaultId, previousBlockNumber)
  );

  const vaultLpPrices = await asyncCache.wrap(
    `orbiter:vaultLpPrice:${chain}:${vaultId}`,
    30_000,
    async () => await getVaultLpPrices()
  );

  const vaultLpPrice = new Decimal(vaultLpPrices[vaultId.toLowerCase()] ?? 0);

  const currentUserBalance =
    currentBalances.find(
      (b) => b.holder.toLowerCase() === userAddress.toLowerCase()
    )?.balance ?? new Decimal(0);
  const previousUserBalance =
    previousBalances.find(
      (b) => b.holder.toLowerCase() === userAddress.toLowerCase()
    )?.balance ?? new Decimal(0);
  const currentUserBalanceUSD = currentUserBalance.mul(vaultLpPrice);
  const previousUserBalanceUSD = previousUserBalance.mul(vaultLpPrice);

  // format result:
  const isValid = currentUserBalanceUSD.gt(10) && previousUserBalanceUSD.gt(10);
  return {
    isValid,
    message: isValid ? "Valid" : "Invalid",
    result: {
      currentBlockNumber,
      previousBlockNumber,
      currentUserBalance,
      previousUserBalance,
      currentUserBalanceUSD,
      previousUserBalanceUSD,
    },
  };
};
