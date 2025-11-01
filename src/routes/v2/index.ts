import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import balances from "./balances";
import beefy from "./beefy";
import config from "./config";
import partner from "./partner";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(balances, { prefix: "/balances" });
  instance.register(beefy, { prefix: "/beefy" });
  instance.register(partner, { prefix: "/partner" });
  instance.register(config, { prefix: "/config" });
  done();
}
