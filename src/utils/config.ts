import dotenv from 'dotenv';

dotenv.config();

export const getConfig = () => {
  return {
    sentioApiKey: process.env.SENTIO_API_KEY ?? 'SENTIO_API_KEY',
  };
};
