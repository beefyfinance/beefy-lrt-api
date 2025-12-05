import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import ethena from "./ethena";
import etherfi from "./etherfi";
import infrared from "./infrared";
import resolv from "./resolv";
import orbiter from "./orbiter";
import curvance from "./curvance";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(ethena, { prefix: "/ethena" });
  instance.register(etherfi, { prefix: "/etherfi" });
  instance.register(infrared, { prefix: "/infrared" });
  instance.register(resolv, { prefix: "/resolv" });
  instance.register(orbiter, { prefix: "/orbiter" });
  instance.register(curvance, { prefix: "/curvance" });
  done();
}
