import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { adminSupabase } from "@/lib/supabase/admin";

const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      // Called when /auth/complete submits the one-time auth code
      async authorize(credentials) {
        const code = credentials?.code as string | undefined;
        if (!code) return null;

        // Validate one-time code
        const { data: authCode } = await adminSupabase
          .from("auth_codes")
          .select("user_id, expires_at")
          .eq("code", code)
          .single();

        if (!authCode) return null;
        if (new Date(authCode.expires_at) < new Date()) return null;

        // Delete code immediately (one-time use)
        await adminSupabase.from("auth_codes").delete().eq("code", code);

        // Load user + bungie account
        const { data: user } = await adminSupabase
          .from("users")
          .select("id, display_name")
          .eq("id", authCode.user_id)
          .single();

        const { data: account } = await adminSupabase
          .from("bungie_accounts")
          .select("membership_id, membership_type")
          .eq("user_id", authCode.user_id)
          .single();

        if (!user || !account) return null;

        return {
          id: user.id,
          name: user.display_name,
          bungieMembershipId: account.membership_id,
          bungieMembershipType: account.membership_type,
          displayName: user.display_name,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as Record<string, unknown>;
        token.userId = u.id as string;
        token.bungieMembershipId = u.bungieMembershipId as string;
        token.bungieMembershipType = u.bungieMembershipType as number;
        token.displayName = u.displayName as string;
        token.bungieAccessToken = u.bungieAccessToken as string | undefined;
        token.bungieRefreshToken = u.bungieRefreshToken as string | undefined;
        token.bungieTokenExpiresAt = u.bungieTokenExpiresAt as string | null | undefined;
      }
      return token;
    },

    async session({ session, token }) {
      session.userId = token.userId as string;
      session.bungieMembershipId = token.bungieMembershipId as string;
      session.bungieMembershipType = token.bungieMembershipType as number;
      session.displayName = token.displayName as string;
      session.bungieAccessToken = token.bungieAccessToken as string | undefined;
      session.bungieRefreshToken = token.bungieRefreshToken as string | undefined;
      session.bungieTokenExpiresAt = token.bungieTokenExpiresAt as string | null | undefined;
      return session;
    },
  },

  pages: {
    signIn: "/",
    error: "/auth/error",
  },

  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, signIn, auth } = NextAuth(authConfig);
