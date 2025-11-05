import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifySchema,
} from "fastify";
import S from "fluent-json-schema";
import Decimal from "decimal.js";
import type { ChainId, ProviderId } from "../../config/chains";
import { getChainsByProvider } from "../../config/chains";
import { addressSchema } from "../../schema/address";
import { bigintSchema } from "../../schema/bigint";
import { chainSchema } from "../../schema/chain";
import { providerSchema } from "../../schema/provider";
import { FriendlyError, GraphQueryError } from "../../utils/error";
import { getGraphClient } from "../../graphql/client";
import { getChainNetworkId } from "../../utils/viemClient";
import { getLoggerFor } from "../../utils/log";

const logger = getLoggerFor("routes/v2/balances");

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // balances endpoint
  {
    type UrlParams = {
      providerId: ProviderId;
      chain: ChainId;
      block: string;
    };

    const urlParamsSchema = S.object()
      .prop("providerId", providerSchema.required().description("LRT provider"))
      .prop(
        "chain",
        chainSchema.required().description("Chain to query balances for")
      )
      .prop(
        "block",
        bigintSchema.required().description("Block number to query balances at")
      );

    const responseSchema = S.object()
      .prop(
        "result",
        S.array().items(
          S.object()
            .prop("address", addressSchema)
            .prop("effective_balance", bigintSchema)
            .prop("time_weighted_effective_balance_1h", bigintSchema)
            .prop(
              "detail",
              S.array().items(
                S.object()
                  .prop("vault", addressSchema)
                  .prop("balance", bigintSchema)
                  .prop("token", addressSchema)
                  .prop("time_weighted_balance_1h", bigintSchema)
              )
            )
        )
      )
      .prop(
        "meta",
        S.object()
          .prop("chainId", chainSchema)
          .prop(
            "block",
            S.object()
              .prop("number", bigintSchema)
              .prop("timestamp", bigintSchema)
          )
          .prop(
            "vaults",
            S.array().items(
              S.object()
                .prop("id", S.string())
                .prop("total", bigintSchema)
                .prop("address", addressSchema)
                .prop("underlying_token_address", addressSchema)
            )
          )
      );

    const schema: FastifySchema = {
      tags: ["v2"],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      "/:providerId/:chain/:block",
      { schema },
      async (request, reply) => {
        const { providerId, chain, block } = request.params;
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
        const result = await getBalances(
          chainConfig.id,
          symbols,
          BigInt(block)
        );
        reply.send({
          ...result,
          meta: { ...result.meta, provider: providerId },
        });
      }
    );
  }

  done();
}

const getBalances = async (
  chain: ChainId,
  symbols: string[],
  blockNumber: bigint
) => {
  const graphClient = getGraphClient(chain);

  const res = await graphClient
    .TokenBreakdownBalancesBySymbol(
      {
        blockLt: blockNumber.toString(),
        symbols: symbols,
        networkId: getChainNetworkId(chain),
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      logger.error(e);
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  const balances = res.Token.flatMap((token) =>
    token.breakdownTokensOf
      .filter((bt) => bt.vault !== null)
      .flatMap((bt) => {
        const vault = bt.vault!;
        const tokenIndex = vault.breakdownTokensOrder.indexOf(token.id);
        if (tokenIndex === -1) {
          return [];
        }

        return vault.positions.flatMap((position) => {
          const balanceBreakdown = position.balanceBreakdown[0];
          if (!balanceBreakdown) {
            return [];
          }

          const rawTotalSharesBalance = position.totalSharesBalance;
          const rawBalance = balanceBreakdown.balances[tokenIndex];
          const rawTimeWeightedBalance =
            balanceBreakdown.timeWeightedBalances[tokenIndex];

          if (!rawBalance && !rawTimeWeightedBalance) {
            return [];
          }

          const totalSharesBalance = new Decimal(
            rawTotalSharesBalance.toString()
          );
          const balance = totalSharesBalance.eq(0)
            ? new Decimal(0)
            : new Decimal(rawBalance.toString());
          const timeWeightedBalance1s = new Decimal(
            rawTimeWeightedBalance.toString()
          );

          if (balance.isZero() && timeWeightedBalance1s.isZero()) {
            return [];
          }

          return [
            {
              address: position.investor_id,
              vault: {
                id: vault.id,
                address: vault.address,
                vaultId: vault.vaultId,
                underlyingToken: {
                  address: "",
                },
              },
              balance,
              timeWeightedBalance1s,
              last_update_block: {
                number: BigInt(balanceBreakdown.lastUpdateBlock),
                timestamp: BigInt(balanceBreakdown.lastUpdateTimestamp),
              },
              token: {
                address: token.address,
                symbol: String(token.symbol ?? "UNKNOWN"),
                decimals: BigInt(token.decimals),
              },
            },
          ];
        });
      })
  );
  if (!balances.length) {
    throw new FriendlyError("No balances found");
  }

  const balancesAgg = balances.reduce(
    (acc, b) => {
      if (!acc[b.address]) {
        acc[b.address] = {
          balance: new Decimal(0),
          timeWeightedBalance1s: new Decimal(0),
          last_update_block: b.last_update_block,
          decimals: b.token.decimals,
          detail: [],
        };
      }
      acc[b.address].balance = acc[b.address].balance.plus(b.balance);
      acc[b.address].timeWeightedBalance1s = acc[
        b.address
      ].timeWeightedBalance1s.plus(b.timeWeightedBalance1s);
      // last update must be the earliest of all balances
      if (
        b.last_update_block.number < acc[b.address].last_update_block.number
      ) {
        acc[b.address].last_update_block = b.last_update_block;
      }
      acc[b.address].detail.push({
        vault: b.vault.vaultId,
        balance: b.balance,
        token: b.token.address,
        decimals: b.token.decimals,
      });
      return acc;
    },
    {} as Record<
      string,
      {
        balance: Decimal;
        timeWeightedBalance1s: Decimal;
        last_update_block: { number: bigint; timestamp: bigint };
        decimals: bigint;
        detail: {
          vault: string;
          token: string;
          balance: Decimal;
          decimals: bigint;
        }[];
      }
    >
  );

  const result = Object.entries(balancesAgg).map(([address, agg]) => {
    const decimalsMultiplier = new Decimal(10).pow(Number(agg.decimals));
    return {
      address,
      effective_balance: BigInt(agg.balance.mul(decimalsMultiplier).toFixed(0)),
      last_update_block: agg.last_update_block,
      // transform to 1h for renzo - do division with Decimal, then convert to BigInt
      time_weighted_effective_balance_1h: BigInt(
        agg.timeWeightedBalance1s
          .div(60 * 60)
          .mul(decimalsMultiplier)
          .toFixed(0)
      ),
      detail: agg.detail.map((d) => {
        const detailDecimalsMultiplier = new Decimal(10).pow(
          Number(d.decimals)
        );
        return {
          vault: d.vault,
          balance: BigInt(d.balance.mul(detailDecimalsMultiplier).toFixed(0)),
          token: d.token,
        };
      }),
    };
  });
  const minLastUpdate = balances.reduce(
    (acc, b) =>
      b.last_update_block.number < acc.number ? b.last_update_block : acc,
    balances[0].last_update_block
  );
  const vaultsByAddress = balances.reduce(
    (acc, b) => {
      if (!acc[b.vault.address]) {
        acc[b.vault.address] = {
          id: b.vault.vaultId,
          total: result.reduce((sum, r) => {
            const detail = r.detail.find((d) => d.vault === b.vault.vaultId);
            return (detail?.balance ?? 0n) + sum;
          }, 0n),
          address: b.vault.address,
          underlying_token_address: "",
        };
      }
      return acc;
    },
    {} as Record<
      string,
      {
        id: string;
        total: bigint;
        address: string;
        underlying_token_address: string;
      }
    >
  );

  return {
    result,
    meta: {
      chainId: chain,
      block: minLastUpdate,
      vaults: Object.values(vaultsByAddress),
    },
  };
};
