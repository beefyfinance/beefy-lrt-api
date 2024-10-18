import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import balances from './balances';
import blocks from './blocks';
import breakdown from './breakdown';
import config from './config';
import partner from './partner';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(balances, { prefix: '/balances' });
  instance.register(blocks, { prefix: '/blocks' });
  instance.register(breakdown, { prefix: '/breakdown' });
  instance.register(partner, { prefix: '/partner' });
  instance.register(config, { prefix: '/config' });
  done();
}
