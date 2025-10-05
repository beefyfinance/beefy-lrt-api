import { getAsyncCache } from './async-lock';
import type { BeefyViemClient } from './viemClient';

export const getBlockDataByNumber = async (client: BeefyViemClient, block: bigint) => {
  const asyncCache = getAsyncCache();
  const blockData = await asyncCache.wrap(`block:${block}`, 30_000, () =>
    client.getBlock({ blockNumber: block })
  );
  return {
    timestamp: new Date(Number(blockData.timestamp) * 1000),
    number: blockData.number,
  };
};
