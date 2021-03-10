import "reflect-metadata";
import "dotenv/config";
import { GraphQLServer } from "graphql-yoga";
import session = require("express-session");
import connectRedis = require("connect-redis");
import RateLimit = require("express-rate-limit");
import RateLimitRedisStore = require("rate-limit-redis"); 
import { redis } from "./redis";
import { createTypeormConn } from "./utils/createTypeormConnection";
import { confirmEmail } from "./routes/confirmEmail";
import { genSchema } from "./utils/genSchema";
import { redisSessionPrefix } from "./constants";
import * as passport from "passport";
import { Strategy } from "passport-twitter";
import { User } from "./entity/User";
import { createTestConn } from "./testUtils/createTestConn";



const RedisStore = connectRedis(session);


export const startServer = async () => {

  if (process.env.NODE_ENV === "test") {
    await redis.flushall();
  }
  
  const server = new GraphQLServer({ 
    schema: genSchema(),
    context: ({ request }) => ({
      redis,
      url: request.protocol + "://" + request.get("host"),
      session: request.session,
      req: request
    })
  });

  server.express.use(
//@ts-ignore
  new RateLimit({
      store: new RateLimitRedisStore({
        client: redis
      }),
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      delayMs: 0 // disable delaying - full speed until the max limit is reached
    })
  );

  server.express.use(
    session({
      store: new RedisStore({
        client: redis as any
      }),
      name: "cookie",
      secret: process.env.SESSION_SECRET as string,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
      }
    })
  );

  const cors = {
    credentials: true,
    origin: process.env.NODE_ENV == "test" ? "*" : process.env.FRONT_END_HOST
  };


   server.express.get("/confirm/:id", confirmEmail);
   const connection = await createTypeormConn();

   passport.use(
    new Strategy(
      {
        consumerKey: process.env.TWITTER_CONSUMER_KEY as string,
        consumerSecret: process.env.TWITTER_CONSUMER_SECRET as string,
        callbackURL: process.env.CALLBACK_URL as string +"/auth/twitter/callback",
        includeEmail: true
      },
      async (_, __, profile, cb) => {
        const { id, emails } = profile;

        const query = connection
          .getRepository(User)
          .createQueryBuilder("user")
          .where("user.twitterId = :id", { id });

        let email: string | null = null;

        if (emails) {
          email = emails[0].value;
          query.orWhere("user.email = :email", { email });
        }

        let user = await query.getOne();

        // this user needs to be registered
        if (!user) {
          user = await User.create({
            twitterId: id,
            email
          }).save();
        } else if (!user.twitterId) {
          // merge account
          // we found user by email
          user.twitterId = id;
          await user.save();
        } else {
          // we have a twitterId
          // login
        }

        return cb(null, { id: user.id });
      }
    )
  );

  server.express.use(passport.initialize());

  server.express.get("/auth/twitter", passport.authenticate("twitter"));

  server.express.get(
    "/auth/twitter/callback",
    passport.authenticate("twitter", { session: false }),
    (req, res) => {
      (req.session as any).userId = (req.user as any).id;
      // @todo redirect to frontend
      res.redirect("/");
    }
  );

  if (process.env.NODE_ENV === "test") {
    await createTestConn(true);
  } else {
    await createTypeormConn();
  }

  const app = await server.start({
    cors,
    port: process.env.NODE_ENV === "test" ? 0 : 4000
  });
  //@ts-ignore
  console.log("Server is running on localhost:"+app.address().port);
 
   return app;
};