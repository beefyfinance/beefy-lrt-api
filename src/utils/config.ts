import dotenv from 'dotenv';

dotenv.config();

export const getConfig = () => {
  return {
    beefyDataKey: process.env.BEEFY_DATA_KEY ?? 'BEEFY_DATA_KEY',

    // url configs
    beefyDataUrl: process.env.BEEFY_DATA_URL ?? 'https://data.beefy.finance',
  };
};
