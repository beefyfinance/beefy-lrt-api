import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import ethena from "./ethena";
import etherfi from "./etherfi";
// import kinetix from "./_kinetix";
import rings from "./rings";
// import swell from "./_swell";
// import yei from "./_yei";
import silo from "./silo";
import infrared from "./infrared";
import falcon from "./falcon";
import hybra from "./hybra";

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  instance.register(ethena, { prefix: "/ethena" });
  instance.register(etherfi, { prefix: "/etherfi" });
  instance.register(falcon, { prefix: "/falcon" });
  instance.register(hybra, { prefix: "/hybra" });
  instance.register(infrared, { prefix: "/infrared" });
  // instance.register(kinetix, { prefix: "/kinetix" });
  instance.register(rings, { prefix: "/rings" });
  instance.register(silo, { prefix: "/silo" });
  // instance.register(swell, { prefix: "/swell" });
  // instance.register(yei, { prefix: "/yei" });
  done();
}
