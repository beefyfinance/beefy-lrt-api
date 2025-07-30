import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import beGEMS from "./beGEMS";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(beGEMS, { prefix: "/begems" });
  done();
}
