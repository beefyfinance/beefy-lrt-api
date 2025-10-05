import dotenv from 'dotenv';

dotenv.config();

export const getConfig = () => {
  return {
    sentioApiKey: process.env.SENTIO_API_KEY ?? 'SENTIO_API_KEY',
    beefyDataKey: process.env.BEEFY_DATA_KEY ?? 'BEEFY_DATA_KEY',

    // url configs
    beefyDataUrl: process.env.BEEFY_DATA_URL ?? 'https://data.beefy.finance',
  };
};
