import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifySchema,
} from "fastify";
import S from "fluent-json-schema";
import { bigintSchema } from "../../../schema/bigint";
import { FriendlyError } from "../../../utils/error";
import { ChainId } from "../../../config/chains";
import { chainSchema } from "../../../schema/chain";
import { getAsyncCache } from "../../../utils/async-lock";
import { getUserTVLAtBlock } from "../../../vault-breakdown/fetchAllUserBreakdown";
import { getTokenConfigByAddress } from "../../../utils/addressbook";
import Decimal from "decimal.js";
import { getBlockDataByNumber } from "../../../utils/block";
import { getViemClient } from "../../../utils/viemClient";
import { uniqBy } from "lodash";
import { getTokenPrice } from "../../../utils/price";
import { Hex } from "viem";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  {
    type QueryParams = {
      block: string;
      page: string;
      pageSize?: string;
      debug?: boolean;
    };

    type UrlParams = {
      chain: ChainId;
    };

    const urlParamsSchema = S.object().prop(
      "chain",
      chainSchema.required().description("The chain")
    );

    const querySchema = S.object()
      .prop("block", bigintSchema.required().description("The block number"))
      .prop("page", bigintSchema.required().description("The page number"))
      .prop(
        "pageSize",
        bigintSchema.description("The page size, defaults to 100")
      )
      .prop(
        "debug",
        S.boolean().description("Whether to include debug information")
      );

    const schema: FastifySchema = {
      tags: ["v2"],
      params: urlParamsSchema,
      querystring: querySchema,
      response: {
        200: S.string(),
      },
    };

    instance.get<{ Params: UrlParams; Querystring: QueryParams }>(
      "/points/:chain",
      { schema },
      async (request, reply) => {
        const { chain } = request.params;
        const { block, page, pageSize, debug } = request.query;
        const res = await getResolvRows({
          chain,
          block: BigInt(block),
          page: BigInt(page),
          pageSize: pageSize ? BigInt(pageSize) : 100n,
          debug: debug ?? false,
        });
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

export const getResolvRows = async ({
  chain,
  block,
  page,
  pageSize,
  debug,
}: {
  chain: ChainId;
  block: bigint;
  page: bigint;
  pageSize: bigint;
  debug: boolean;
}) => {
  const asyncCache = getAsyncCache();

  const blockData = await getBlockDataByNumber(getViemClient(chain), block);

  const balances = await asyncCache.wrap(
    `resolv:breakdown:${chain}:${block}`,
    30_000,
    () =>
      getUserTVLAtBlock(
        chain,
        block,
        (vault) =>
          vault.pointStructureIds.includes("resolv") ||
          [
            "euler-plasma-telosc-usdt0",
            "euler-plasma-re7labs-usdt0",
            "euler-plasma-k3capital-usdt0",
          ].includes(vault.id)
      )
  );

  const decimalizedBalances = balances.map((b) => {
    const token = getTokenConfigByAddress(chain, b.token_address);
    if (!token) {
      throw new FriendlyError(
        `Token not found for address ${b.token_address}. Please ping devz to add it to the address book.`
      );
    }

    const decimalizedBalance = new Decimal(
      b.token_balance.balance.toString(10)
    ).div(new Decimal(10).pow(token.decimals));
    return {
      user_address: b.user_address,
      token: token,
      balance: decimalizedBalance,
      details: b.token_balance.details,
    };
  });

  const tokens = uniqBy(
    decimalizedBalances.map((b) => b.token),
    "address"
  );
  const prices = await Promise.all(
    tokens.map((t) => getTokenPrice(t, blockData.timestamp))
  );

  const pricesMap = new Map(tokens.map((t, i) => [t.address, prices[i]]));

  const usdPerUser = decimalizedBalances.reduce((acc, b) => {
    const token = b.token;
    const price = pricesMap.get(token.address);
    if (!price) {
      throw new Error("Price not found");
    }

    const user = b.user_address;
    const balance = b.balance;
    const usd = balance.mul(price);
    if (!acc[user]) {
      acc[user] = { amount: new Decimal(0), details: [] };
    }
    acc[user].amount = acc[user].amount.add(usd);
    acc[user].details = acc[user].details.concat(
      b.details.map((d) => ({
        vault_id: d.vault_id,
        vault_address: d.vault_address,
        contribution: d.contribution,
        contribution_usd: new Decimal(d.contribution.toString())
          .mul(price)
          .div(new Decimal(10).pow(token.decimals))
          .toNumber(),
      }))
    );
    return acc;
  }, {} as Record<Hex, { amount: Decimal; details: { vault_id: string; vault_address: string; contribution: bigint; contribution_usd: number }[] }>);

  const userBalances = Object.entries(usdPerUser).map(([user, data]) => ({
    user: user,
    position: data.amount,
    details: debug ? data.details : undefined,
  }));

  const sortedUserBalances = userBalances.sort(
    (a, b) => b.position.toNumber() - a.position.toNumber()
  );

  // page is 1-indexed
  const pageCount =
    Math.floor(sortedUserBalances.length / Number(pageSize)) + 1;
  const start = (Number(page) - 1) * Number(pageSize);
  const end = Number(page) * Number(pageSize);
  const pageUserBalances = sortedUserBalances.slice(start, end);

  return {
    values: pageUserBalances,
    page: page,
    totalPages: pageCount,
  };
};
