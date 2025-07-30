import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifySchema,
} from "fastify";
import S from "fluent-json-schema";
import type { Hex } from "viem";
import { addressSchema } from "../../../schema/address";
import { getAsyncCache } from "../../../utils/async-lock";
import { getLoggerFor } from "../../../utils/log";
import { fetchWithRetry } from "../../../utils/fetch";
import { getConfig } from "../../../utils/config";

const logger = getLoggerFor("beGEMS");

export default async function (
  instance: FastifyInstance,
  _opts: FastifyPluginOptions,
  done: (err?: Error) => void
) {
  //  beGEMS summary endpoint
  {
    const schema: FastifySchema = {
      tags: ["v2"],
      response: {
        200: S.object()
          .prop(
            "topUsers",
            S.array().items(
              S.object().prop("address", S.string()).prop("points", S.number())
            )
          )
          .prop(
            "bottomUser",
            S.object().prop("address", S.string()).prop("points", S.number())
          )
          .prop("totalPoints", S.number())
          .prop("totalUsers", S.number())
          .prop("lastUpdated", S.number()),
      },
    };

    instance.get("/summary", { schema }, async (_, reply) => {
      try {
        const data = await getBeGemsData();

        // Get top 10 and bottom 1
        const topUsers = data.leaderboard.slice(0, 10);
        const bottomUser = data.leaderboard[data.leaderboard.length - 1];

        reply.send({
          topUsers,
          bottomUser,
          totalPoints: data.totalPoints,
          totalUsers: data.totalUsers,
          lastUpdated: data.lastUpdated,
        });
      } catch (error) {
        logger.error("Error fetching beGEMS summary", error);
        reply.code(500).send({ error: "Failed to fetch beGEMS data" });
      }
    });
  }

  //  beGEMS user-specific endpoint
  {
    type UrlParams = {
      address: Hex;
    };

    const urlParamsSchema = S.object().prop(
      "address",
      addressSchema.required().description("User address")
    );

    const responseSchema = S.object();

    const schema: FastifySchema = {
      tags: ["v2"],
      params: urlParamsSchema,
      response: {
        200: responseSchema,
        404: S.object().prop("error", S.string()),
      },
    };

    instance.get<{ Params: UrlParams }>(
      "/user/:address",
      { schema },
      async (request, reply) => {
        try {
          const { address } = request.params;
          const data = await getBeGemsData();

          // Find user data using efficient byUser mapping
          const userData = data.byUser[address.toLowerCase()];

          if (!userData) {
            reply.code(404).send({ error: "User not found" });
            return;
          }

          reply.send({
            address: address,
            points: userData.points,
            rank: userData.rank,
          });
        } catch (error) {
          logger.error("Error fetching user beGEMS data", error);
          reply.code(500).send({ error: "Failed to fetch user data" });
        }
      }
    );
  }

  done();
}

type BeGemsUser = {
  address: string;
  points: number;
  rank: number;
};

type BeGemsData = {
  leaderboard: BeGemsUser[];
  byUser: Record<string, { points: number; rank: number }>;
  totalPoints: number;
  totalUsers: number;
  lastUpdated: number;
};

// Function to fetch beGEMS data with 2-hour caching
const getBeGemsData = async (): Promise<BeGemsData> => {
  const asyncCache = getAsyncCache();

  return asyncCache.wrap(
    "begems:data",
    2 * 60 * 60 * 1000, // 2 hours in milliseconds
    async () => {
      logger.info("Fetching fresh beGEMS data from Sentio API");

      const response = await fetchWithRetry(
        "https://endpoint.sentio.xyz/rxp/beefy-clm-sonic-sentio/sonic_global_twtvl?cache_policy.force_refresh=false&cache_policy.ttl_secs=86400&size=100000",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": getConfig().sentioApiKey,
          },
          body: JSON.stringify({}),
        },
        {
          logger,
          maxRetries: 3,
          retryDelay: 30000,
        }
      );

      if (!response.ok) {
        throw new Error(
          `Sentio API error: ${response.status} ${response.statusText}`
        );
      }

      const responseData = await response.json();

      // Transform the Sentio API response into our format
      // Based on the actual API response structure provided
      const users = responseData.syncSqlResponse.result.rows.map(
        (row: any) => ({
          address: row.user,
          points: row.tt,
        })
      );

      // Sort users by points descending and add ranks
      const sortedUsers = users.sort((a: any, b: any) => b.points - a.points);
      const leaderboard: BeGemsUser[] = sortedUsers.map(
        (user: any, index: number) => ({
          address: user.address,
          points: user.points,
          rank: index + 1,
        })
      );

      // Create byUser mapping for efficient lookups
      const byUser: Record<string, { points: number; rank: number }> = {};
      leaderboard.forEach((user) => {
        byUser[user.address.toLowerCase()] = {
          points: user.points,
          rank: user.rank,
        };
      });

      const totalPoints = users.reduce(
        (sum: number, user: any) => sum + user.points,
        0
      );
      const totalUsers = users.length;

      logger.info(
        `Fetched ${totalUsers} users with ${totalPoints} total beGEMS points`
      );

      return {
        leaderboard,
        byUser,
        totalPoints,
        totalUsers,
        lastUpdated: Date.now(),
      };
    }
  );
};
