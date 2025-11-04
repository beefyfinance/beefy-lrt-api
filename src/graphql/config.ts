import dotenv from 'dotenv';
dotenv.config();

const RAW_GRAPHQL_ENDPOINT: string | null = process.env.GRAPHQL_ENDPOINT ?? null;
if (!RAW_GRAPHQL_ENDPOINT) {
  throw new Error('GRAPHQL_ENDPOINT is not set');
}
export const GRAPHQL_ENDPOINT = RAW_GRAPHQL_ENDPOINT;

export const GRAPHQL_AUTH_HEADER: Record<string, string> | null = process.env.GRAPHQL_AUTH_HEADER
  ? JSON.parse(process.env.GRAPHQL_AUTH_HEADER)
  : null;
