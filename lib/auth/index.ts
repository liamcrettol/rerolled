import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { adminSupabase } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/auth/encrypt";

const BUNGIE_BASE = "https://www.bungie.net";

export const authConfig: NextAuthConfig = {
  providers: [
    {
      id: "bungie",
      name: "Bungie",
      type: "oauth",
      authorization: {
        url: `${BUNGIE_BASE}/en/OAuth/Authorize`,
        params: { response_type: "code" },
      },
      token: `${BUNGIE_BASE}/Platform/App/OAuth/token/`,
      userinfo: {
        url: `${BUNGIE_BASE}/Platform/User/GetCurrentBungieNetUser/`,
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const res = await fetch(
            `${BUNGIE_BASE}/Platform/User/GetCurrentBungieNetUser/`,
            {
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                "X-API-Key": process.env.BUNGIE_API_KEY!,
              },
            }
          );
          const data = await res.json();
          return data.Response;
        },
      },
      clientId: process.env.BUNGIE_CLIENT_ID,
      clientSecret: process.env.BUNGIE_CLIENT_SECRET,
      profile(profile) {
        const primary = profile.destinyMemberships?.[0];
        return {
          id: profile.membershipId,
          bungieMembershipId: primary?.membershipId ?? profile.membershipId,
          bungieMembershipType: primary?.membershipType ?? 0,
          displayName:
            profile.uniqueName ??
            profile.displayName ??
            "Guardian",
        };
      },
    },
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user) return false;

      const encryptedAccess = await encryptToken(account.access_token!);
      const encryptedRefresh = account.refresh_token
        ? await encryptToken(account.refresh_token)
        : null;

      const expiresAt = account.expires_at
        ? new Date(account.expires_at * 1000).toISOString()
        : null;

      // Upsert user record
      await adminSupabase.from("users").upsert(
        {
          id: user.id,
          display_name: user.displayName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      // Upsert bungie_accounts with encrypted tokens
      await adminSupabase.from("bungie_accounts").upsert(
        {
          user_id: user.id,
          membership_id: user.bungieMembershipId,
          membership_type: user.bungieMembershipType,
          access_token_enc: encryptedAccess,
          refresh_token_enc: encryptedRefresh,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.bungieMembershipId = user.bungieMembershipId;
        token.bungieMembershipType = user.bungieMembershipType;
        token.displayName = user.displayName;
      }
      return token;
    },

    async session({ session, token }) {
      session.userId = token.userId as string;
      session.bungieMembershipId = token.bungieMembershipId as string;
      session.bungieMembershipType = token.bungieMembershipType as number;
      session.displayName = token.displayName as string;
      return session;
    },
  },

  pages: {
    signIn: "/",
    error: "/auth/error",
  },

  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
