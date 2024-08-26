import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import etherfi from './etherfi';
import kinetix from './kinetix';
import swell from './swell';
import yei from './yei';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(etherfi, { prefix: '/etherfi' });
  instance.register(kinetix, { prefix: '/kinetix' });
  instance.register(swell, { prefix: '/swell' });
  instance.register(yei, { prefix: '/yei' });
  done();
}
