import type { Token } from 'blockchain-addressbook';
import type { FastifyInstance, FastifyPluginOptions, FastifySchema } from 'fastify';
import S from 'fluent-json-schema';
import { uniq } from 'lodash';
import type { Hex } from 'viem';
import type { ChainId, ProviderId } from '../../config/chains';
import { getChainsByProvider } from '../../config/chains';
import { addressSchema } from '../../schema/address';
import { bigintSchema } from '../../schema/bigint';
import { chainSchema } from '../../schema/chain';
import { providerSchema } from '../../schema/provider';
import { getTokenConfigBySymbol } from '../../utils/addressbook';
import { getAsyncCache } from '../../utils/async-lock';
import { getUserTVLAtBlock } from '../../vault-breakdown/fetchAllUserBreakdown';
import {
  type BeefyVault,
  getBeefyVaultConfig,
} from '../../vault-breakdown/vault/getBeefyVaultConfig';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  // balances endpoint
  {
    type UrlParams = {
      chain: ChainId;
      providerId: ProviderId;
      blockNumber: string;
    };
    const urlParamsSchema = S.object()
      .prop('providerId', providerSchema.required().description('LRT provider'))
      .prop('blockNumber', bigintSchema.required().description('Block number to query balances at'))
      .prop('chain', chainSchema.required().description('Chain to query balances for'));
    type QueryParams = {
      holderAddresses?: Hex[];
    };

    const querySchema = S.object().prop(
      'holderAddresses',
      S.array()
        .items(addressSchema)
        .description('Addresses to query balances for, everyone if not provided')
    );

    const responseSchema = S.object();

    const schema: FastifySchema = {
      tags: ['v2'],
      params: urlParamsSchema,
      querystring: querySchema,
      response: {
        200: responseSchema,
      },
    };

    instance.get<{ Params: UrlParams; Querystring: QueryParams }>(
      '/:chain/provider-token-balance/:providerId/:blockNumber',
      { schema },
      async (request, reply) => {
        const { providerId, chain, blockNumber } = request.params;
        const { holderAddresses } = request.query;

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

        const result = await getKelpRows(
          chainConfig.id,
          providerId,
          holderAddresses || [],
          tokensFilter,
          BigInt(blockNumber)
        );
        reply.send({
          Result: result,
        });
      }
    );
  }

  done();
}

const getKelpRows = async (
  chain: ChainId,
  providerId: ProviderId,
  holderContractAddressesFilter: Hex[],
  tokenAddressesFilter: Token[],
  blockNumber: bigint
) => {
  const asyncCache = getAsyncCache();

  const vaultFilter = (vault: BeefyVault) => {
    return vault.pointStructureIds.includes(providerId);
  };

  const vaults = await getBeefyVaultConfig(chain, vaultFilter);
  const allContractAddresses = uniq(
    vaults
      .map(v => v.vault_address)
      .concat(vaults.flatMap(v => v.strategy_address))
      .concat(vaults.flatMap(v => v.undelying_lp_address))
      .concat(vaults.flatMap(v => v.vault_address))
      .concat(vaults.flatMap(v => v.reward_pools.map(p => p.clm_address)))
      .concat(vaults.flatMap(v => v.reward_pools.map(p => p.reward_pool_address)))
      .concat(vaults.flatMap(v => v.boosts.map(b => b.boost_address)))
      .flat()
      .filter(Boolean)
      .map(a => a.toLocaleLowerCase())
  );

  const balances = await asyncCache.wrap(
    `${providerId}:breakdown:${chain}:${blockNumber}`,
    30_000,
    () => getUserTVLAtBlock(chain, blockNumber, vaultFilter)
  );

  const balanceAggByUser = balances
    .map(b => ({
      block_number: BigInt(b.block_number),
      user_address: b.user_address.toLocaleLowerCase() as Hex,
      token_address: b.token_address.toLocaleLowerCase() as Hex,
      token_balance: b.token_balance,
    }))
    .filter(b => tokenAddressesFilter.some(t => t.address.toLocaleLowerCase() === b.token_address))
    .filter(b => !allContractAddresses.includes(b.user_address))
    .filter(
      b =>
        holderContractAddressesFilter.length === 0 ||
        holderContractAddressesFilter.some(a => a.toLocaleLowerCase() === b.user_address)
    )
    .reduce(
      (acc, b) => {
        if (!acc[b.user_address]) {
          acc[b.user_address] = {
            effective_balance: 0n,
            details: [],
          };
        }

        acc[b.user_address] = {
          effective_balance: acc[b.user_address].effective_balance + b.token_balance.balance,
          details: [
            ...acc[b.user_address].details,
            ...b.token_balance.details.map(d => ({
              vault_id: d.vault_id,
              vault_address: d.vault_address,
              contribution: d.contribution,
              token_address: b.token_address,
            })),
          ],
        };
        return acc;
      },
      {} as Record<
        Hex,
        {
          effective_balance: bigint;
          details: {
            vault_id: string;
            vault_address: string;
            contribution: bigint;
            token_address: Hex;
          }[];
        }
      >
    );

  return Object.entries(balanceAggByUser).map(([address, balance]) => ({
    address,
    ...balance,
  }));
};
