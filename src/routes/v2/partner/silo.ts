import Decimal from 'decimal.js';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { type Hex } from 'viem';
import type { ChainId } from '../../../config/chains';
import { bigintSchema } from '../../../schema/bigint';
import { chainSchema } from '../../../schema/chain';
import { GraphQueryError } from '../../../utils/error';
import { getBeefyVaultConfig } from '../../../vault-breakdown/vault/getBeefyVaultConfig';
import { graphClient } from '../graphClient';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  {
    type UrlParams = {
      chain: ChainId;
      block: string;
    };

    const urlParamsSchema = S.object()
      .prop('chain', chainSchema.required().description('The chain to get the data from'))
      .prop('block', bigintSchema.required().description('Return data up to this block number'));

    const schema: FastifySchema = {
      tags: ['v2'],
      params: urlParamsSchema,
      response: {
        200: S.string(),
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:chain/:block/time-weighted-token-breakdown',
      { schema },
      async (request, reply) => {
        const { chain, block } = request.params;
        const res = await getSiloRows(chain, BigInt(block));
        console.log('res.length', res.length);
        console.log(
          'res underlying',
          res.reduce((acc, curr) => acc + BigInt(curr.latest_underlying_balance), 0n)
        );
        console.log(
          'res shares',
          res.reduce((acc, curr) => acc + BigInt(curr.latest_share_balance), 0n)
        );
        if (!res) {
          reply.status(404);
          reply.send('Not found');
          return;
        }
        reply.send(res);
      }
    );
  }

  done();
}

type Position = {
  vault_address: string;
  underlying_token_address: string;
  underlying_token_symbol: string;
  investor_address: string;
  latest_share_balance: bigint;
  latest_underlying_balance: bigint;
  breakdown_last_update_block: {
    number: bigint;
    timestamp: bigint;
  };
};

export const getSiloRows = async (chain: ChainId, block: bigint): Promise<Position[]> => {
  const beetsv3SonicBeefyusdceScusd = '0x0ad8162b686af063073eabbea9bc6fda2d8184a4';
  const beetsv3SonicBeefyusdceScusdStrategy = '0x1795E8e6616007e1D1361A56F773244CC978a576';
  const beetsGaugeMajorityHolderOfBeetsPool = '0x5D9e8B588F1D9e28ea1963681180d8b5938D26BA';
  const beetsPoolHoldingWrapperInVault = '0x43026d483f42fB35efe03c20B251142D022783f2';
  const beetsVaultHoldingWrapper = '0xbA1333333333a1BA1108E8412f11850A5C319bA9';
  const beefyWrapper = '0x7870ddFd5ACA4E977B2287e9A212bcbe8FC4135a';
  // const silov2SonicUsdceWs = '0xdb6E5dC4C6748EcECb97b565F6C074f24384fD07';

  const vaultConfig = await getBeefyVaultConfig(chain, v => {
    const exclude = [
      beetsv3SonicBeefyusdceScusd,
      beetsv3SonicBeefyusdceScusdStrategy,
      beetsGaugeMajorityHolderOfBeetsPool,
      beetsPoolHoldingWrapperInVault,
      beetsVaultHoldingWrapper,
      beefyWrapper,
    ].map(s => s.toLowerCase());
    return (
      v.pointStructureIds.includes('silo-points') &&
      !exclude.includes(v.vault_address.toLowerCase())
    );
  });

  const vaultsWithPointsBreakdown = await graphClient
    .VaultBalanceBreakdown(
      {
        block_number: Number(block),
        vault_addresses_bytes: vaultConfig.map(v => v.vault_address),
        vault_addresses_string: vaultConfig.map(v => v.vault_address),
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  let positions = vaultsWithPointsBreakdown.beefyVaults
    .flatMap(vault =>
      vault.positions.flatMap(position =>
        position.balanceBreakdown.flatMap(breakdown => ({
          vault: { ...vault, positions: null },
          position: { ...position, balanceBreakdown: null },
          breakdown,
        }))
      )
    )
    .map(p => ({
      vault_address: p.vault.address,
      underlying_token_address: p.breakdown.token?.address,
      underlying_token_symbol: p.breakdown.token?.symbol ?? '',
      investor_address: p.position.investor.address,
      latest_share_balance: p.position.rawSharesBalance,
      latest_underlying_balance: p.breakdown.rawBalance,
      breakdown_last_update_block: {
        number: p.breakdown.lastUpdateBlock,
        timestamp: p.breakdown.lastUpdateTimestamp,
      },
    }));

  // if there are no wrapper positions, return the non wrapper positions
  if (chain !== 'sonic') {
    return positions;
  }

  // fetch the additional token balances to dispatch all the levels
  const additionalTokenBalances = (
    await graphClient
      .TokenBalance(
        {
          block_number: Number(block),
          token_addresses_bytes: [
            beetsPoolHoldingWrapperInVault,
            beetsGaugeMajorityHolderOfBeetsPool,
            beetsv3SonicBeefyusdceScusd,
          ],
        },
        { chainName: chain }
      )
      .catch((e: unknown) => {
        // we have nothing to leak here
        throw new GraphQueryError(e);
      })
  ).tokens.flatMap(t =>
    t.tokenBalances.flatMap(b => ({
      token_address: t.address,
      investor: b.investor.address,
      underlying: BigInt(b.rawBalance),
      shares: BigInt(b.rawBalance),
    }))
  );

  // dispatch the wrapper position into beets pool holders
  positions = unrollPooledPositions({
    positions,
    poolContractAddress: beefyWrapper,
    poolContractBalances: additionalTokenBalances.filter(
      t => t.token_address.toLowerCase() === beetsPoolHoldingWrapperInVault.toLowerCase()
    ),
  });

  // dispatch the beet gauge position into beets gauge holders
  positions = unrollPooledPositions({
    positions,
    poolContractAddress: beetsGaugeMajorityHolderOfBeetsPool,
    poolContractBalances: additionalTokenBalances.filter(
      t => t.token_address.toLowerCase() === beetsGaugeMajorityHolderOfBeetsPool.toLowerCase()
    ),
  });

  // dispatch the beets vault strategy position into beets vault holders
  positions = unrollPooledPositions({
    positions,
    poolContractAddress: beetsv3SonicBeefyusdceScusd,
    poolContractBalances: additionalTokenBalances.filter(
      t => t.token_address.toLowerCase() === beetsv3SonicBeefyusdceScusd.toLowerCase()
    ),
  });

  return positions;
};

const splitOnPredicate = <T>(arr: T[], predicate: (item: T) => boolean): [T[], T[]] => {
  const left: T[] = [];
  const right: T[] = [];
  for (const item of arr) {
    if (predicate(item)) {
      left.push(item);
    } else {
      right.push(item);
    }
  }
  return [left, right];
};

const dispatchBalance = (
  balanceToDispatch: {
    sourceTokenSharesToDispatch: bigint;
    underlyingToDispatch: bigint;
    holderTokenTotalSupply: bigint;
  },
  newInvestors: { holderTokenSharesBalance: bigint; investor: Hex }[]
) => {
  if (balanceToDispatch.holderTokenTotalSupply === 0n) {
    return []; // no one to dispatch to
  }

  // safety check to make sure we keep 100% of the balance
  const sumOfHolderTokenSharesBalance = newInvestors.reduce(
    (acc, curr) => acc + curr.holderTokenSharesBalance,
    0n
  );
  if (sumOfHolderTokenSharesBalance !== balanceToDispatch.holderTokenTotalSupply) {
    throw new Error('Sum of holder token shares balance does not match holder token total supply');
  }

  const sourceTokenSharesToDispatchDecimal = new Decimal(
    balanceToDispatch.sourceTokenSharesToDispatch.toString()
  );
  const underlyingToDispatchDecimal = new Decimal(
    balanceToDispatch.underlyingToDispatch.toString()
  );
  const holderTokenTotalSupplyDecimal = new Decimal(
    balanceToDispatch.holderTokenTotalSupply.toString()
  );

  return newInvestors.map(i => {
    const holderTokenSharesBalanceDecimal = new Decimal(i.holderTokenSharesBalance.toString());
    const investorHolderTokenShareOfTotalSupply = holderTokenSharesBalanceDecimal.div(
      holderTokenTotalSupplyDecimal
    );

    return {
      ...i,
      shares: BigInt(
        sourceTokenSharesToDispatchDecimal.times(investorHolderTokenShareOfTotalSupply).toFixed(0)
      ),
      underlying: BigInt(
        underlyingToDispatchDecimal.times(investorHolderTokenShareOfTotalSupply).toFixed(0)
      ),
    };
  });
};

const unrollPooledPositions = (params: {
  positions: Position[];
  poolContractAddress: string;
  poolContractBalances: {
    investor: Hex;
    underlying: bigint;
    shares: bigint;
  }[];
}): Position[] => {
  const { positions, poolContractAddress, poolContractBalances } = params;

  const totalSharesBefore = positions.reduce((acc, curr) => acc + curr.latest_share_balance, 0n);
  const totalUnderlyingBefore = positions.reduce(
    (acc, curr) => acc + curr.latest_underlying_balance,
    0n
  );

  const [maybePoolContractPosition, nonPoolContractPositions] = splitOnPredicate(
    positions,
    p => p.vault_address.toLowerCase() === poolContractAddress.toLowerCase()
  );

  if (maybePoolContractPosition.length === 0) {
    return nonPoolContractPositions;
  }

  if (maybePoolContractPosition.length > 1) {
    throw new Error('Multiple pool contract positions found');
  }

  const poolContractPosition = maybePoolContractPosition[0];

  const poolContractPositionDispatched = dispatchBalance(
    {
      sourceTokenSharesToDispatch: BigInt(poolContractPosition.latest_share_balance),
      underlyingToDispatch: BigInt(poolContractPosition.latest_underlying_balance),
      holderTokenTotalSupply: BigInt(
        poolContractBalances.reduce((acc, curr) => acc + curr.shares, 0n)
      ),
    },
    poolContractBalances.map(p => ({
      holderTokenSharesBalance: p.shares,
      investor: p.investor,
    }))
  ).map(pos => ({
    vault_address: poolContractPosition.vault_address,
    underlying_token_address: poolContractPosition.underlying_token_address,
    underlying_token_symbol: poolContractPosition.underlying_token_symbol,
    investor_address: pos.investor,
    latest_share_balance: pos.shares,
    latest_underlying_balance: pos.underlying,
    breakdown_last_update_block: poolContractPosition.breakdown_last_update_block,
  }));

  const newPositions = nonPoolContractPositions.concat(poolContractPositionDispatched);
  const totalSharesAfter = newPositions.reduce((acc, curr) => acc + curr.latest_share_balance, 0n);
  const totalUnderlyingAfter = newPositions.reduce(
    (acc, curr) => acc + curr.latest_underlying_balance,
    0n
  );

  // sanity check to make sure we didn't lose any shares or underlying
  if (totalSharesAfter !== totalSharesBefore) {
    throw new Error('Total shares after does not match total shares before');
  }
  if (totalUnderlyingAfter !== totalUnderlyingBefore) {
    throw new Error('Total underlying after does not match total underlying before');
  }
  return newPositions;
};
