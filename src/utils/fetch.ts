import type { Logger } from 'pino';
import { sleep } from './sleep';

// Helper function to fetch with retry for 504 errors
export const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  {
    logger,
    retryDelay = 30000,
    maxRetries = 3,
  }: { logger: Logger; retryDelay?: number; maxRetries?: number }
): Promise<Response> => {
  let retries = 0;

  while (true) {
    try {
      const response = await fetch(url, options);

      // If it's not a 504 error or we've used all retries, return the response
      if (response.status !== 504 || retries >= maxRetries) {
        return response;
      }

      // Log retry attempt
      logger.warn(
        `Received 504 Gateway Timeout. Retrying in ${
          retryDelay / 1000
        }s... (Attempt ${retries + 1} of ${maxRetries})`
      );

      // Wait before retrying
      await sleep(retryDelay);
      retries++;
    } catch (error) {
      // If we've used all retries, throw the error
      if (retries >= maxRetries) {
        throw error;
      }

      logger.warn(
        `Fetch error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }. Retrying in ${retryDelay / 1000}s... (Attempt ${retries + 1} of ${maxRetries})`
      );

      // Wait before retrying
      await sleep(retryDelay);
      retries++;
    }
  }
};
