import "next-auth";

declare module "next-auth" {
  interface Session {
    userId: string;
    bungieMembershipId: string;
    bungieMembershipType: number;
    displayName: string;
    bungieAccessToken?: string;
    bungieRefreshToken?: string;
    bungieTokenExpiresAt?: string | null;
  }

  interface User {
    id: string;
    bungieMembershipId: string;
    bungieMembershipType: number;
    displayName: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    bungieMembershipId: string;
    bungieMembershipType: number;
    displayName: string;
    bungieAccessToken?: string;
    bungieRefreshToken?: string;
    bungieTokenExpiresAt?: string | null;
  }
}
