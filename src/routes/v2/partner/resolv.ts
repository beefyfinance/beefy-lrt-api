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
import { getTokenConfigByAddress } from "../../../utils/addressbook";
import Decimal from "decimal.js";
import { getBlockDataByNumber } from "../../../utils/block";
import { getViemClient } from "../../../utils/viemClient";
import { chunk, groupBy, uniq, uniqBy, zip } from "lodash";
import { getTokenPrice } from "../../../utils/price";
import { erc20Abi, Hex } from "viem";
import { getBeefyVaultConfig } from "../../../vault-breakdown/vault/getBeefyVaultConfig";
import { BeefyVault } from "../../../vault-breakdown/vault/getBeefyVaultConfig";
import { getTokenBalances } from "../../../vault-breakdown/vault/getTokenBalances";
import { extractAllAddresses } from "../../../vault-breakdown/vault/getAllAddresses";
import { getLoggerFor } from "../../../utils/log";
import { BeefyVaultBreakdown } from "../../../vault-breakdown/breakdown/types";
import { getUserTVLAtBlock } from "../../../vault-breakdown/fetchAllUserBreakdown";

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
        const res = await getResolvRowsV1({
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

    instance.get<{ Params: UrlParams; Querystring: QueryParams }>(
      "/points-v2/:chain",
      { schema },
      async (request, reply) => {
        const { chain } = request.params;
        const { block, page, pageSize, debug } = request.query;
        const res = await getResolvRowsV2({
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

export const getResolvRowsV1 = async ({
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
  const balances = await asyncCache.wrap(
    `resolv:breakdown:v1:${chain}:${block}`,
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

  return processBreakdownBalances({
    chain,
    block,
    page,
    pageSize,
    debug,
    balances,
  });
};

export const getResolvRowsV2 = async ({
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
  const balances = await asyncCache.wrap(
    `resolv:breakdown:v2:${chain}:${block}`,
    30_000,
    () =>
      getResolvVaultUserTVLAtBlock(
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

  return processBreakdownBalances({
    chain,
    block,
    page,
    pageSize,
    debug,
    balances,
  });
};

type BreakdownBalance = Awaited<ReturnType<typeof getUserTVLAtBlock>>[0];

const processBreakdownBalances = async ({
  chain,
  block,
  page,
  pageSize,
  debug,
  balances,
}: {
  chain: ChainId;
  block: bigint;
  page: bigint;
  pageSize: bigint;
  debug: boolean;
  balances: BreakdownBalance[];
}) => {
  const blockData = await getBlockDataByNumber(getViemClient(chain), block);

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

const logger = getLoggerFor("routes/v2/partner/resolv");

export const getResolvVaultUserTVLAtBlock = async (
  chainId: ChainId,
  blockNumber: bigint,
  vaultFilter: (vault: BeefyVault) => boolean
) => {
  const allVaultConfigs = await getBeefyVaultConfig(chainId, vaultFilter);
  const investorPositions = await getTokenBalances(chainId, {
    blockNumber: BigInt(blockNumber),
    amountGt: 0n,
    tokenAddresses: extractAllAddresses(allVaultConfigs),
  });

  const vaultConfigs = allVaultConfigs.filter(vaultFilter);

  // merge investor positions for clm and reward pools
  const vaultRewardPoolMap: Record<string, string> = {};
  for (const vault of vaultConfigs) {
    vaultRewardPoolMap[vault.vault_address] = vault.vault_address;
    for (const pool of vault.reward_pools) {
      vaultRewardPoolMap[pool.reward_pool_address] = vault.vault_address;
    }
  }

  const mergedInvestorPositionsByInvestorAndClmAddress: Record<
    string,
    (typeof investorPositions)[0]
  > = {};
  for (const position of investorPositions) {
    const vaultAddress =
      vaultRewardPoolMap[position.token_address.toLowerCase()];
    const key = `${position.user_address}_${vaultAddress}`;
    if (!mergedInvestorPositionsByInvestorAndClmAddress[key]) {
      mergedInvestorPositionsByInvestorAndClmAddress[key] = position;
    } else {
      mergedInvestorPositionsByInvestorAndClmAddress[key].balance +=
        position.balance;
    }
  }
  const mergedPositions = Object.values(
    mergedInvestorPositionsByInvestorAndClmAddress
  );

  const vaultAddressWithActivePosition = uniq(
    investorPositions.map((pos) => pos.token_address)
  );
  const vaults = vaultConfigs.filter(
    (vault) =>
      vaultAddressWithActivePosition.includes(vault.vault_address) ||
      vault.reward_pools.some((pool) =>
        vaultAddressWithActivePosition.includes(pool.reward_pool_address)
      )
  );
  // get breakdowns for all vaults
  logger.debug({
    msg: "Fetching breakdowns",
    vaults: vaults.length,
    blockNumber,
    chainId,
  });
  const breakdowns = await getResolvVaultBreakdownAtBlock(
    chainId,
    BigInt(blockNumber),
    vaults
  );
  logger.debug({ msg: "Fetched breakdowns", breakdowns: breakdowns.length });

  const breakdownByVaultAddress = breakdowns.reduce((acc, breakdown) => {
    acc[breakdown.vault.vault_address.toLowerCase() as Hex] = breakdown;
    return acc;
  }, {} as Record<Hex, BeefyVaultBreakdown>);

  // merge by investor address and token address
  const investorTokenBalances: Record<
    Hex /* investor */,
    Record<
      Hex /* token */,
      {
        balance: bigint /* amount */;
        details: {
          vault_id: string;
          vault_address: string;
          contribution: bigint;
        }[];
      }
    >
  > = {};
  for (const position of mergedPositions) {
    const vaultAddress = vaultRewardPoolMap[
      position.token_address.toLowerCase()
    ] as Hex;
    const breakdown = breakdownByVaultAddress[vaultAddress];
    if (!breakdown) {
      // some test vaults were never available in the api
      continue;
    }

    if (breakdown.isLiquidityEligible === false) {
      // skip non-eligible vaults
      continue;
    }

    if (!investorTokenBalances[position.user_address]) {
      investorTokenBalances[position.user_address] = {};
    }

    for (const breakdownBalance of breakdown.balances) {
      if (
        !investorTokenBalances[position.user_address][
          breakdownBalance.tokenAddress
        ]
      ) {
        investorTokenBalances[position.user_address][
          breakdownBalance.tokenAddress
        ] = {
          balance: BigInt(0),
          details: [],
        };
      }

      const breakdownContribution =
        (position.balance * breakdownBalance.vaultBalance) /
        breakdown.vaultTotalSupply;
      investorTokenBalances[position.user_address][
        breakdownBalance.tokenAddress
      ].balance += breakdownContribution;
      investorTokenBalances[position.user_address][
        breakdownBalance.tokenAddress
      ].details.push({
        vault_id: breakdown.vault.id,
        vault_address: breakdown.vault.vault_address,
        contribution: breakdownContribution,
      });
    }
  }

  // format output
  return Object.entries(investorTokenBalances).flatMap(([investor, balances]) =>
    Object.entries(balances).map(([token, balance]) => ({
      block_number: blockNumber,
      user_address: investor as Hex,
      token_address: token as Hex,
      token_balance: balance,
      details: balance.details,
    }))
  );
};

export const getResolvVaultBreakdownAtBlock = async (
  chainId: ChainId,
  blockNumber: bigint,
  vaults: BeefyVault[]
): Promise<BeefyVaultBreakdown[]> => {
  const whitelistedResolvEulerVaults = [
    "0x4718484ac9dc07fbbc078561e8f8ef29e2a369cd",
    "0x538f01e0ba3cf3ab5b3837a0d138a3f67b9b8235",
    "0xb23377af59d4fc95cb8330ee2834aa8241eeed03",
    "0x6a9e59545169be88115671d7171967f8fbffa0cd",
  ];

  const client = getViemClient(chainId);

  // == get beefy vault totalSupply

  const vaultTotalSuppliesResults = await client.multicall({
    contracts: vaults.map((vault) => ({
      abi: erc4626Abi,
      address: vault.vault_address,
      functionName: "totalSupply",
    })),
    blockNumber,
    allowFailure: false,
  });

  const vaultsWithTotalSupplies = zip(vaults, vaultTotalSuppliesResults).map(
    ([vault, totalSupply]) => ({
      vault: vault!,
      totalSupply: totalSupply! as bigint,
    })
  );

  // == find out which euler earn the strategy is deploying capital to

  const eulerEarnAddressesResults = await client.multicall({
    contracts: vaults.map(
      (vault) =>
        ({
          abi: eulerEarnStrategyAbi,
          address: vault.strategy_address,
          functionName: "erc4626Vault",
        } as const)
    ),
    blockNumber,
    allowFailure: false,
  });

  const vaultsAndEarnAddress = zip(
    vaultsWithTotalSupplies,
    eulerEarnAddressesResults
  ).map(([c, address]) => ({
    ...(c as NonNullable<typeof c>),
    eulerEarnAddress: address! as Hex,
  }));

  // == find out the proportion of the euler earn vault that belongs to the strategy
  // eulerEarn totalSupply + eulerEarn.balanceOf(strategy)?
  const beefyStrategyBalancesResults = await client.multicall({
    contracts: vaultsAndEarnAddress.flatMap(({ eulerEarnAddress, vault }) => [
      {
        abi: erc20Abi,
        address: eulerEarnAddress,
        functionName: "totalSupply",
      },
      {
        abi: erc20Abi,
        address: eulerEarnAddress,
        functionName: "balanceOf",
        args: [vault.strategy_address],
      },
    ]),
    blockNumber,
    allowFailure: false,
  });

  const vaultsAndBeefyStrategyBalances = zip(
    vaultsAndEarnAddress,
    chunk(beefyStrategyBalancesResults, 2) as [bigint, bigint][]
  ).map(([c, res]) => ({
    ...(c as NonNullable<typeof c>),
    eulerEarnTotalSupply: res![0] as bigint,
    eulerEarnStrategyBalance: res![1] as bigint,
  }));

  // == get the allocation of the whitelisted euler vault
  // for each beefy vault (euler earn), get the allocation of the whitelisted euler vault
  const vaultsAndWhitelistedVaults = vaultsAndBeefyStrategyBalances.flatMap(
    (c) =>
      whitelistedResolvEulerVaults.map((whitelistedVault) => ({
        ...(c as NonNullable<typeof c>),
        whitelistedVault: whitelistedVault as Hex,
      }))
  );

  const eulerEarnAllocationsResults = await client.multicall({
    contracts: vaultsAndWhitelistedVaults.map(
      ({ eulerEarnAddress, whitelistedVault }) => ({
        abi: eulerEarnAbi,
        address: eulerEarnAddress,
        functionName: "config",
        args: [whitelistedVault],
      })
    ),
    blockNumber,
    allowFailure: false,
  });

  const whitelistedVaultsWithShares = zip(
    vaultsAndWhitelistedVaults,
    eulerEarnAllocationsResults
  )
    .map(([c, allocation]) => ({
      ...(c as NonNullable<typeof c>),
      shares: allocation![0] as bigint,
    }))
    .filter((c) => c.shares > 0n);

  // == get the underlying amount associated with the whitelisted vault deposit

  // then preview redeem of the whitelisted vault
  const redeemResults = await client.multicall({
    contracts: whitelistedVaultsWithShares.map(
      ({ whitelistedVault, shares }) => ({
        abi: erc4626Abi,
        address: whitelistedVault,
        functionName: "previewRedeem",
        args: [shares],
      })
    ),
    blockNumber,
    allowFailure: false,
  });

  const whitelistedVaultsWithUnderlying = zip(
    whitelistedVaultsWithShares,
    redeemResults
  ).map(([c, underlying]) => ({
    ...(c as NonNullable<typeof c>),
    totalEulerEarnVaultUnderlying: underlying! as bigint,
  }));

  // == format output
  /**
 * {
  vault: BeefyVault;
  blockNumber: bigint;
  vaultTotalSupply: bigint;
  isLiquidityEligible: boolean;
  balances: {
    tokenAddress: Hex;
    vaultBalance: bigint;
  }[];
};
 */

  const byVault = groupBy(
    whitelistedVaultsWithUnderlying,
    "vault.vault_address"
  );
  const breakdowns = Object.values(byVault).map((entries) => ({
    vault: entries[0].vault,
    blockNumber,
    vaultTotalSupply: entries[0].totalSupply,
    isLiquidityEligible: true,
    balances: entries.map((e) => ({
      tokenAddress: e.vault?.undelying_lp_address as Hex,
      vaultBalance:
        (e.totalEulerEarnVaultUnderlying * e.eulerEarnStrategyBalance) /
        e.eulerEarnTotalSupply,
    })),
  }));

  return breakdowns;
};

const eulerEarnStrategyAbi = [
  {
    type: "function",
    name: "erc4626Vault",
    inputs: [],
    stateMutability: "view",
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const eulerEarnAbi = [
  {
    inputs: [
      {
        internalType: "contract IERC4626",
        name: "",
        type: "address",
      },
    ],
    name: "config",
    outputs: [
      {
        internalType: "uint112",
        name: "balance",
        type: "uint112",
      },
      {
        internalType: "uint136",
        name: "cap",
        type: "uint136",
      },
      {
        internalType: "bool",
        name: "enabled",
        type: "bool",
      },
      {
        internalType: "uint64",
        name: "removableAt",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const erc4626Abi = [
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "previewRedeem",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "amount", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
