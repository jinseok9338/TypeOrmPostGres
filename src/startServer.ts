import { GraphQLServer } from "graphql-yoga";
import { redis } from "./redis";
 import { createTypeormConn } from "./utils/createTypeormConnection";
 import { confirmEmail } from "./routes/confirmEmail";
 import session = require("express-session");
import connectRedis = require("connect-redis");
require('dotenv').config()

import { genSchema } from "./utils/genSchema";


const RedisStore = connectRedis(session);


export const startServer = async () => {
  const server = new GraphQLServer({ 
    schema: genSchema(),
    context: ({ request }) => ({
      redis,
      url: request.protocol + "://" + request.get("host"),
      session: request.session
    })
  });

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
    origin: process.env.FRONT_END_HOST 
  };


   server.express.get("/confirm/:id", confirmEmail);

   await createTypeormConn();   
  const app = await server.start({
    cors,
    port: process.env.NODE_ENV === "test" ? 0 : 4000
  });
  //@ts-ignore
  console.log("Server is running on localhost:"+app.address().port);

   return app;
};