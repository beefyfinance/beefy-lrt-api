import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import kinetix from './kinetix';
import swell from './swell';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(swell, { prefix: '/swell' });
  instance.register(kinetix, { prefix: '/kinetix' });
  done();
}
