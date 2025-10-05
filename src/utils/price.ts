import type { Token } from 'blockchain-addressbook';
import { getAsyncCache } from './async-lock';
import { getConfig } from './config';
import { FriendlyError } from './error';
import { fetchWithRetry } from './fetch';
import { getLoggerFor } from './log';

const logger = getLoggerFor('utils/price');

export const getTokenPrice = async (token: Token, timestamp: Date) => {
  const asyncCache = getAsyncCache();
  const price = await asyncCache.wrap(`price:${token.oracleId}:${timestamp.getTime()}`, 60000, () =>
    fetchBeefyPrice(timestamp, token.oracleId)
  );
  return price;
};

const fetchBeefyPrice = async (
  timestamp: Date,
  oracleId: string,
  options?: {
    cacheBusting?: boolean;
  }
) => {
  const config = getConfig();
  const priceMargin = 5 * 60 * 60 * 1000; // give it 5h margin, we accept prices as old as 5h before the timestamp
  const startDate = new Date(timestamp.getTime() - priceMargin);
  const endDate = new Date(timestamp.getTime());

  const params = {
    oracle: oracleId,
    from: Math.floor(startDate.getTime() / 1000).toString(),
    to: Math.ceil(endDate.getTime() / 1000).toString(),
    key: config.beefyDataKey,
    rng: options?.cacheBusting ? Math.floor(Math.random() * 10000000000).toString() : '',
  };
  logger.debug({ msg: 'Fetching prices', data: { params } });

  type ApiResponse = { t: number; v: number }[];
  const res = await fetchWithRetry(
    `${config.beefyDataUrl}/api/v2/prices/range?${new URLSearchParams(params).toString()}`,
    { method: 'GET' },
    { logger }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch prices: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as ApiResponse;

  if (data.length === 0) {
    throw new FriendlyError(
      `No prices found for ${oracleId} at ${timestamp}. Please ping devz to make sure the price is available.`
    );
  }

  const orderedData = data.sort((a, b) => a.t - b.t);

  return orderedData[orderedData.length - 1].v;
};
