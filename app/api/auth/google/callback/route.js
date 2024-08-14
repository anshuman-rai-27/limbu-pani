import { parseCookies } from "oslo/cookie";
import { NextResponse } from "next/server";
import { google, lucia } from "@/auth";
import { generateId } from "lucia";
import { cookies } from "next/headers";
import { db } from "@/db";

async function GET(req, res) {
  const reqCookies = parseCookies(req.headers.get("Cookie") ?? "");
  const stateCookie = reqCookies.get("google_oauth_state") ?? null;
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const codeVerifier = cookies().get("codeVerifier");
  

  if (!state || !stateCookie || !code || stateCookie !== state) {
    return NextResponse.json(null, { status: 400 });
  }
  try {
    const tokens = await google.validateAuthorizationCode(
      code,
      codeVerifier.value,
    );
    
    const userResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      },
    );
    
    const googleUser = await userResponse.json();
    
    let existingUser = await db.user.findUnique({
      where: {
        email: googleUser.email,
      },
    });

    if (!existingUser) {
      existingUser = await db.user.create({
        data: {
          id: generateId(15),
          name: googleUser.name,
          email: googleUser.email,
          photo: googleUser.picture,
        },
      });
    }
    const session = await lucia.createSession(existingUser.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    cookies().set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes,
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(error, { status: 403 });
  }
  return NextResponse.json(null, { status: 302, headers: { Location: "/" } });
}

export { GET as GET };
