import type { Token } from 'blockchain-addressbook';
import Decimal from 'decimal.js';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import type { Hex } from 'viem';
import type { ChainId } from '../../../config/chains';
import { getChainsByProvider } from '../../../config/chains';
import { addressSchema } from '../../../schema/address';
import { bigintSchema } from '../../../schema/bigint';
import { chainSchema } from '../../../schema/chain';
import { getTokenConfigBySymbol } from '../../../utils/addressbook';
import { getAsyncCache } from '../../../utils/async-lock';
import { getLoggerFor } from '../../../utils/log';
import { getUserTVLAtBlock } from '../../../vault-breakdown/fetchAllUserBreakdown';
import { getTokenBalances } from '../../../vault-breakdown/vault/getTokenBalances';

const logger = getLoggerFor('routes/v2/partner/ethena');

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // user list endpoint
  {
    type UrlParams = {
      chain: ChainId;
    };

    const urlParamsSchema = S.object().prop(
      'chain',
      chainSchema.required().description('Chain to query users for')
    );

    const responseSchema = S.object();

    const schema: FastifySchema = {
      tags: ['v2'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    const asyncCache = getAsyncCache();

    instance.get<{ Params: UrlParams }>('/:chain/users', { schema }, async (request, reply) => {
      const { chain } = request.params;
      const providerId = 'ethena' as const;

      const validChains = getChainsByProvider(providerId);
      const chainConfig = validChains.find(c => c.id === chain);
      if (!chainConfig) {
        reply.code(404).send({
          error: 'Chain not supported for provider',
          validChains: validChains.map(c => c.id),
        });
        return;
      }

      const symbols = chainConfig.providers[providerId];
      if (!symbols) {
        reply.code(404).send({
          error: 'Chain not supported for provider',
          validChains: validChains.map(c => c.id),
        });
        return;
      }

      const tokensFilter = symbols
        .map(s => getTokenConfigBySymbol(chainConfig.id, s))
        .filter(Boolean) as Token[];

      if (!tokensFilter.length) {
        reply.code(404).send({
          error: 'No tokens found for chain',
        });
        return;
      }

      logger.debug({ msg: 'Fetching ethena users', chain });

      const allTokenBalances = await asyncCache.wrap(`ethena:users:${chain}`, 30_000, () =>
        getTokenBalances(chain, {})
      );
      const users = new Set(allTokenBalances.map(r => r.user_address));

      reply.send(Array.from(users));
    });
  }

  // balances endpoint
  {
    type UrlParams = {
      chain: ChainId;
      user_address: Hex;
      block_number: string;
    };

    const urlParamsSchema = S.object()
      .prop('chain', chainSchema.required().description('Chain to query balances for'))
      .prop(
        'user_address',
        addressSchema.required().description('User address to query balances for')
      )
      .prop(
        'block_number',
        bigintSchema.required().description('Block number to query balances at')
      );

    const responseSchema = S.object();

    const schema: FastifySchema = {
      tags: ['v2'],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams }>(
      '/:chain/user/:user_address/balance/:block_number',
      { schema },
      async (request, reply) => {
        const { chain, user_address, block_number } = request.params;
        const providerId = 'ethena' as const;

        const validChains = getChainsByProvider(providerId);
        const chainConfig = validChains.find(c => c.id === chain);
        if (!chainConfig) {
          reply.code(404).send({
            error: 'Chain not supported for provider',
            validChains: validChains.map(c => c.id),
          });
          return;
        }

        const symbols = chainConfig.providers[providerId];
        if (!symbols) {
          reply.code(404).send({
            error: 'Chain not supported for provider',
            validChains: validChains.map(c => c.id),
          });
          return;
        }

        const tokensFilter = symbols
          .map(s => getTokenConfigBySymbol(chainConfig.id, s))
          .filter(Boolean) as Token[];

        if (!tokensFilter.length) {
          reply.code(404).send({
            error: 'No tokens found for chain',
          });
          return;
        }

        const result = await getEthenaBalance(
          chainConfig.id,
          user_address,
          tokensFilter,
          BigInt(block_number)
        );
        reply.send(result);
      }
    );
  }

  done();
}

const getEthenaBalance = async (
  chain: ChainId,
  userAddressFilter: Hex,
  tokenFilter: Token[],
  blockNumber: bigint
) => {
  const asyncCache = getAsyncCache();

  const balances = await asyncCache.wrap(`ethena:breakdown:${chain}:${blockNumber}`, 30_000, () =>
    getUserTVLAtBlock(chain, blockNumber, vault => {
      return vault.pointStructureIds.includes('ethena');
    })
  );

  const balanceForUserAndBlock = balances
    .filter(b =>
      tokenFilter.some(t => t.address.toLocaleLowerCase() === b.token_address.toLocaleLowerCase())
    )
    .filter(b => userAddressFilter.toLocaleLowerCase() === b.user_address.toLocaleLowerCase())
    .reduce((acc, b) => {
      const token = tokenFilter.find(
        t => t.address.toLocaleLowerCase() === b.token_address.toLocaleLowerCase()
      );
      if (!token) {
        throw new Error('Token not found');
      }

      const decimalizedBalance = new Decimal(b.token_balance.toString(10)).div(
        new Decimal(10).pow(token.decimals)
      );
      return acc.add(decimalizedBalance);
    }, new Decimal(0));

  return {
    address: userAddressFilter,
    effective_balance: balanceForUserAndBlock.toString(),
  };
};
