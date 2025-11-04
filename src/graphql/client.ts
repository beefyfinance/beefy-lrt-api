import { GraphQLClient } from 'graphql-request';
import { createCachedFactoryByChainId } from '../utils/factory';
import { type Sdk, getSdk } from './client.generated';
import { GRAPHQL_AUTH_HEADER, GRAPHQL_ENDPOINT } from './config';

export const getGraphClient = createCachedFactoryByChainId((): Sdk => {
  const client = new GraphQLClient(GRAPHQL_ENDPOINT, {
    headers: {
      ...(GRAPHQL_AUTH_HEADER ?? {}),
    },
    jsonSerializer: {
      stringify: value => {
        return JSON.stringify(value, (_key, value) => {
          if (typeof value === 'bigint') {
            return value.toString();
          }
          return value;
        });
      },
      parse: value => {
        return JSON.parse(value);
      },
    },
  });
  return getSdk(client) as Sdk;
});
