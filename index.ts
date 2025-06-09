import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import fs from "fs";
import qs from "qs";

const BASE_URL: string = "https://challenge.sunvoy.com";

type Credentials = {
  email: string;
  password: string;
};

const credentials: Credentials = {
  email: "demo@example.org",
  password: "test",
};

const jar: CookieJar = new CookieJar();
const client = wrapper(
  axios.create({
    jar,
    withCredentials: true,
    headers: { "User-Agent": "Mozilla/5.0" },
  })
);

// get nonce value
const getLoginNonce = async (): Promise<string> => {
  const response = await client.get(`${BASE_URL}/login`);
  const nonceMatch = response.data.match(/name="nonce" value="([^"]+)"/);
  if (!nonceMatch) {
    throw new Error("Nonce not found in the login page.");
  }
  return nonceMatch[1];
};

// login
const login = async (nonce: string): Promise<void> => {
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const form: string = qs.stringify({
    username: credentials.email,
    password: credentials.password,
    nonce,
  });

  const response = await client.post(`${BASE_URL}/login`, form, { headers });

  if (response.status !== 200) {
    throw new Error("Login failed.");
  }
};

type User = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
};

const fetchUsers = async (): Promise<User[]> => {
  const response = await client.post(`${BASE_URL}/api/users`);
  if (response.status !== 200) {
    throw new Error("Failed to fetch users.");
  }
  return response.data;
};

(async () => {
  try {
    // login setup
    const nonce = await getLoginNonce();
    await login(nonce);

    // fetch users
    const users: User[] = await fetchUsers();

    // write users to file
    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
    console.log("Users fetched and saved to users.json");
  } catch (error) {
    console.error(error.response.data);
  }
})();
