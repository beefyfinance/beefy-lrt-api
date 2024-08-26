import type { Hex } from 'viem';
import type { ChainId } from '../../config/chains';
import { FriendlyError } from '../../utils/error';
import { getLoggerFor } from '../../utils/log';
import { SUBGRAPH_PAGE_SIZE, getBalanceSubgraphUrl } from '../config';

type TokenBalance = {
  user_address: Hex;
  token_address: Hex;
  balance: bigint;
};

type QueryResult = {
  [key in
    | 'tokenBalances0'
    | 'tokenBalances1'
    | 'tokenBalances2'
    | 'tokenBalances3'
    | 'tokenBalances4'
    | 'tokenBalances5'
    | 'tokenBalances6'
    | 'tokenBalances7'
    | 'tokenBalances8'
    | 'tokenBalances9']: {
    account: {
      id: Hex;
    };
    token: {
      id: Hex;
    };
    amount: string;
  }[];
};

const logger = getLoggerFor('vault-breakdown/vault/getTokenBalances');

const PARRALEL_REQUESTS = 10;
const PARRALEL_REQUESTS_ARRAY = Array.from({ length: PARRALEL_REQUESTS }, (_, i) => i);
const USER_BALANCES_QUERY = `
  fragment Balance on TokenBalance {
    account {
      id
    }
    token {
      id
    }
    amount
  }

  query UserBalances($blockNumber: Int!, $first: Int!, ${PARRALEL_REQUESTS_ARRAY.map(i => `$skip${i}: Int!`).join(', ')}) {
    ${PARRALEL_REQUESTS_ARRAY.slice(1).map(
      i => `
      tokenBalances${i}: tokenBalances(
        block: { number: $blockNumber }
        first: $first
        where: { amount_gt: 0 }
        skip: $skip${i}
        orderBy: id
        orderDirection: asc
      ) {
        ...Balance
      }
    `
    )}
  }
`;

export const getTokenBalances = async (
  chainId: ChainId,
  blockNumber: bigint
): Promise<TokenBalance[]> => {
  let allPositions: TokenBalance[] = [];
  let skip = 0;
  const startAt = Date.now();
  logger.debug(`Fetching user balances for chain ${chainId} at block ${blockNumber}`);
  while (true) {
    logger.trace(
      `Fetching user balances for chain ${chainId} at block ${blockNumber} with base skip ${skip}`
    );

    const response = await fetch(getBalanceSubgraphUrl(chainId), {
      method: 'POST',
      body: JSON.stringify({
        query: USER_BALANCES_QUERY,
        variables: {
          first: SUBGRAPH_PAGE_SIZE,
          blockNumber: Number(blockNumber),
          ...PARRALEL_REQUESTS_ARRAY.reduce(
            (acc, i) => {
              acc[`skip${i}`] = skip + i * SUBGRAPH_PAGE_SIZE;
              return acc;
            },
            {} as { [key: string]: number }
          ),
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(text);
      throw new FriendlyError(`Subgraph query failed with status ${response.status}: ${text}`);
    }

    const res = (await response.json()) as
      | { data: QueryResult }
      | { errors: { message: string }[] };
    if ('errors' in res) {
      const errors = res.errors.map(e => e.message).join(', ');
      throw new FriendlyError(`Subgraph query failed: ${errors}`);
    }

    allPositions = allPositions.concat(
      (res.data.tokenBalances0 || [])
        .concat(res.data.tokenBalances1 || [])
        .concat(res.data.tokenBalances2 || [])
        .concat(res.data.tokenBalances3 || [])
        .concat(res.data.tokenBalances4 || [])
        .concat(res.data.tokenBalances5 || [])
        .concat(res.data.tokenBalances6 || [])
        .concat(res.data.tokenBalances7 || [])
        .concat(res.data.tokenBalances8 || [])
        .concat(res.data.tokenBalances9 || [])
        .map(
          (position): TokenBalance => ({
            balance: BigInt(position.amount),
            user_address: position.account.id.toLocaleLowerCase() as Hex,
            token_address: position.token.id.toLocaleLowerCase() as Hex,
          })
        )
    );

    if (res.data.tokenBalances9.length < SUBGRAPH_PAGE_SIZE) {
      break;
    }

    skip += SUBGRAPH_PAGE_SIZE * PARRALEL_REQUESTS;
  }

  logger.debug(
    `Fetched ${allPositions.length} user balances for chain ${chainId} at block ${blockNumber} in ${
      Date.now() - startAt
    }ms`
  );

  return allPositions;
};
