import axios from "axios";
import { createTypeormConn } from "../../utils/createTypeormConnection";
import { User } from "../../entity/User";
import { Connection } from "typeorm";
import { TestClient } from "../../utils/TestClient";
import { createTestConn } from "../../testUtils/createTestConn";

let conn: Connection;
const email = "bob5@bob.com";
const password = "jlkajoioiqwe";

let userId: string;
beforeAll(async () => {
  conn = await createTestConn();
  const user = await User.create({
    email,
    password,
    confirmed: true
  }).save();
  userId = user.id;
});

afterAll(async () => {
  conn.close();
});

describe("logout", () => {
  test("multiple sessions", async () => {
    // computer 1
    const sess1 = new TestClient(process.env.TEST_HOST as string);
    // computer 2
    const sess2 = new TestClient(process.env.TEST_HOST as string);

    const login1 = await sess1.login(email, password);
    const login2 = await sess2.login(email, password);
 
    expect(await sess1.me()).toEqual(await sess2.me());
   const logout1 = await sess1.logout()


    expect(await sess1.me()).toEqual({"data": {"me": null}})
    
    expect(await sess2.me()).toEqual({"data": {"me": null}})
  });

  test("single session", async () => {
    //Single Computer
    const client = new TestClient(process.env.TEST_HOST as string);

    await client.login(email, password);

    const response = await client.me();

    expect(response.data).toEqual({
      me: {
        id: userId,
        email
      }
    });

    await client.logout();

    const response2 = await client.me();

    expect(response2.data.me).toBeNull();
  });
});