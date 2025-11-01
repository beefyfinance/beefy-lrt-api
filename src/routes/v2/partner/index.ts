import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import ethena from "./ethena";
import etherfi from "./etherfi";
import infrared from "./infrared";
import resolv from "./resolv";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(ethena, { prefix: "/ethena" });
  instance.register(etherfi, { prefix: "/etherfi" });
  instance.register(infrared, { prefix: "/infrared" });
  instance.register(resolv, { prefix: "/resolv" });
  done();
}
