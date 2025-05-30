import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import ethena from './ethena';
import etherfi from './etherfi';
import kinetix from './kinetix';
import rings from './rings';
import swell from './swell';
import lisk from './lisk';
import yei from './yei';
import silo from './silo';
import infrared from './infrared';

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(ethena, { prefix: '/ethena' });
  instance.register(etherfi, { prefix: '/etherfi' });
  instance.register(kinetix, { prefix: '/kinetix' });
  instance.register(rings, { prefix: '/rings' });
  instance.register(swell, { prefix: '/swell' });
  instance.register(yei, { prefix: '/yei' });
  instance.register(lisk, { prefix: '/lisk' });
  instance.register(infrared, { prefix: '/infrared' });
  instance.register(silo, { prefix: '/silo' });
  done();
}
