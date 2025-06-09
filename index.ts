import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import puppeteer from "puppeteer";
import qs from "qs";
import fs from "fs";

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

type CurrentUser = {
  userId: string;
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

// use puppeteer to fetch current user details
// as it requires waiting for the page to load current user data
const fetchCurrentUser = async (): Promise<CurrentUser> => {
  console.log("Fetching current user details...");
  const cookies = await jar.getCookies(BASE_URL);

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const puppeteerCookies = cookies.map((c) => {
    let sameSite: "Strict" | "Lax" | "None" | undefined;
    if (c.sameSite === "strict") sameSite = "Strict";
    else if (c.sameSite === "lax") sameSite = "Lax";
    else if (c.sameSite === "none") sameSite = "None";
    else sameSite = undefined;

    return {
      name: c.key,
      value: c.value,
      domain: (c.domain ?? "").replace(/^\./, ""),
      path: c.path ?? undefined,
      expires:
        c.expires instanceof Date ? Math.floor(c.expires.getTime() / 1000) : -1,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite,
    };
  });

  await page.setCookie(...puppeteerCookies);
  console.log("Navigating to settings page...");
  await page.goto(`${BASE_URL}/settings`, {
    waitUntil: "networkidle0",
  });

  // Query all input elements of type text and email on the page
  const [userId, firstName, lastName, email] = await page.$$eval(
    "input[type='text'], input[type='email']",
    (inputs) => {
      return inputs.map((input) => input.value);
    }
  );

  await browser.close();
  return {
    userId,
    firstName,
    lastName,
    email,
  };
};

(async () => {
  try {
    const nonce = await getLoginNonce();
    await login(nonce);
    const [users, currentUser] = await Promise.all([
      fetchUsers(),
      fetchCurrentUser(),
    ]);
    fs.writeFileSync(
      "users.json",
      JSON.stringify({ users, currentUser }, null, 2)
    );
    console.log("Users and current user details saved to users.json");
  } catch (error: any) {
    console.error(
      error?.response?.data || error?.message || "An error occurred"
    );
  }
})();
