import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import swell from './swell';
import kinetix from './kinetix';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(swell, { prefix: '/swell' });
  instance.register(kinetix, { prefix: '/kinetix' });
  done();
}
