import Decimal from 'decimal.js';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { uniq } from 'lodash';
import { erc20Abi } from 'viem';
import type { ChainId } from '../../../config/chains';
import { bigintSchema } from '../../../schema/bigint';
import { chainSchema } from '../../../schema/chain';
import { GraphQueryError } from '../../../utils/error';
import { getViemClient } from '../../../utils/viemClient';
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

export const getSiloRows = async (chain: ChainId, block: bigint) => {
  const beetsv3SonicBeefyusdceScusd = '0x0ad8162b686af063073eabbea9bc6fda2d8184a4';
  const beefyWrapper = '0x7870ddFd5ACA4E977B2287e9A212bcbe8FC4135a';
  const silov2SonicUsdceWs = '0xdb6E5dC4C6748EcECb97b565F6C074f24384fD07';

  const vaultConfig = await getBeefyVaultConfig(chain, v => {
    return (
      v.pointStructureIds.includes('silo-points') &&
      v.vault_address.toLowerCase() !== beetsv3SonicBeefyusdceScusd.toLowerCase()
    );
  });

  const positions = (
    await graphClient
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
      })
  ).beefyVaults.flatMap(
    vault =>
      vault.positions.flatMap(position =>
        position.balanceBreakdown.flatMap(breakdown => ({
          vault: { ...vault, positions: null },
          position: { ...position, balanceBreakdown: null },
          breakdown,
        }))
      )
    // remove share tokens
  );

  const wrapperInvestorPositions = positions.filter(
    p => p.position.investor.address.toLowerCase() === beefyWrapper.toLowerCase()
  );
  const nonWrapperPositions = positions.filter(
    p => p.position.investor.address.toLowerCase() !== beefyWrapper.toLowerCase()
  );

  // if there are no wrapper positions, return the non wrapper positions
  if (chain !== 'sonic' || wrapperInvestorPositions.length === 0) {
    return nonWrapperPositions.map(p => ({
      vault_address: p.vault.address,
      underlying_token_address: p.breakdown.token?.address,
      underlying_token_symbol: p.breakdown.token?.symbol,
      investor_address: p.position.investor.address,
      latest_share_balance: p.position.rawSharesBalance,
      latest_underlying_balance: p.breakdown.rawBalance,
    }));
  }

  if (wrapperInvestorPositions.length > 1) {
    throw new Error('Multiple wrapper investor positions found, this should not happen');
  }

  const wrapperInvestorPosition = wrapperInvestorPositions[0];

  const viemClient = getViemClient(chain);
  const totalWrapperSupply = await viemClient.readContract({
    address: silov2SonicUsdceWs,
    abi: erc20Abi,
    functionName: 'totalSupply',
    blockNumber: block,
  });

  const rawBeetsData = await graphClient
    .VaultBalanceBreakdown(
      {
        block_number: Number(block),
        vault_addresses_bytes: [beetsv3SonicBeefyusdceScusd],
        vault_addresses_string: [beetsv3SonicBeefyusdceScusd],
      },
      { chainName: chain }
    )
    .catch((e: unknown) => {
      // we have nothing to leak here
      throw new GraphQueryError(e);
    });

  if (rawBeetsData.beefyVaults.length !== 1) {
    throw new Error('Beets data not found');
  }

  const beetsData = rawBeetsData.beefyVaults[0];
  const totalWrapperSupplyDecimal = new Decimal(totalWrapperSupply.toString());
  const beetsPositions = beetsData.positions.flatMap(p =>
    p.balanceBreakdown
      .filter(b => b.token?.address?.toLowerCase() === beefyWrapper.toLowerCase())
      .flatMap(b => ({
        ...p,
        balanceBreakdown: b,
      }))
      .map(b => ({
        ...b,
        beetsInvestorShareOfWrapper: new Decimal(b.balanceBreakdown.rawBalance).div(
          totalWrapperSupplyDecimal
        ),
      }))
  );

  const beetsInvestorActualWrapperPosition = beetsPositions.map(beetsPosition => ({
    vault_address: wrapperInvestorPosition.vault.address,
    underlying_token_address: wrapperInvestorPosition.breakdown.token?.address,
    underlying_token_symbol: wrapperInvestorPosition.breakdown.token?.symbol,
    investor_address: beetsPosition.investor.address,
    latest_share_balance: BigInt(
      new Decimal(wrapperInvestorPosition.position.rawSharesBalance)
        .times(beetsPosition.beetsInvestorShareOfWrapper)
        .toFixed(0)
    ),
    latest_underlying_balance: BigInt(
      new Decimal(wrapperInvestorPosition.breakdown.rawBalance)
        .times(beetsPosition.beetsInvestorShareOfWrapper)
        .toFixed(0)
    ),
  }));

  const totalBeetsBalance = beetsInvestorActualWrapperPosition.reduce(
    (acc, curr) => acc + curr.latest_underlying_balance,
    0n
  );
  const totalBeetsShareBalance = beetsInvestorActualWrapperPosition.reduce(
    (acc, curr) => acc + curr.latest_share_balance,
    0n
  );

  const rows = beetsInvestorActualWrapperPosition
    .concat(
      nonWrapperPositions.map(p => ({
        vault_address: p.vault.address,
        underlying_token_address: p.breakdown.token?.address,
        underlying_token_symbol: p.breakdown.token?.symbol,
        investor_address: p.position.investor.address,
        latest_share_balance: p.position.rawSharesBalance,
        latest_underlying_balance: p.breakdown.rawBalance,
      }))
    )
    // add the remaining balance of the wrapper position not in the beets positions
    .concat([
      {
        vault_address: wrapperInvestorPosition.vault.address,
        underlying_token_address: wrapperInvestorPosition.breakdown.token?.address,
        underlying_token_symbol: wrapperInvestorPosition.breakdown.token?.symbol,
        investor_address: wrapperInvestorPosition.position.investor.address,
        latest_share_balance:
          BigInt(wrapperInvestorPosition.position.rawSharesBalance) - totalBeetsShareBalance,
        latest_underlying_balance:
          BigInt(wrapperInvestorPosition.breakdown.rawBalance) - totalBeetsBalance,
      },
    ]);

  return rows;
};
