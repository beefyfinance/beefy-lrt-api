import type { CodegenConfig } from '@graphql-codegen/cli';
import { GRAPHQL_AUTH_HEADER, GRAPHQL_ENDPOINT } from './config';

const config: CodegenConfig = {
  schema: GRAPHQL_AUTH_HEADER
    ? {
        [GRAPHQL_ENDPOINT]: {
          headers: GRAPHQL_AUTH_HEADER,
        },
      }
    : GRAPHQL_ENDPOINT,
  documents: ['./src/graphql/queries/**/*.graphql'],
  overwrite: true,
  generates: {
    './src/graphql/client.generated.ts': {
      plugins: ['typescript', 'typescript-operations', 'typescript-graphql-request'],
      config: {
        documentMode: 'documentNode',
        scalars: {
          BigInt: {
            input: 'string',
            output: 'string | number',
          },
          DateTime: 'Date',
          numeric: { input: 'string', output: 'string' },
          timestamptz: { input: 'Date', output: 'Date' },
          pooltype: { input: 'string', output: 'string' },
          Bytes: { input: 'string', output: 'string' },
          ID: { input: 'string', output: 'string' },
          String: { input: 'string', output: 'string' },
          Boolean: { input: 'boolean', output: 'boolean' },
          Int: { input: 'number', output: 'number' },
          Float: { input: 'number', output: 'number' },
          initializablestatus: {
            input: "'INITIALIZING' | 'INITIALIZED'",
            output: "'INITIALIZING' | 'INITIALIZED'",
          },
          jsonb: { input: 'object', output: 'object' },
        },
        preResolveTypes: true,
        skipTypename: false,
        enumsAsTypes: true,
        constEnums: true,
        gqlImport: 'graphql#gql',
      },
    },
    './src/graphql/schema.generated.graphql': {
      plugins: ['schema-ast'],
      config: {},
    },
  },
};

export default config;
