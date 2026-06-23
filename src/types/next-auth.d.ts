import "next-auth";
import "next-auth/jwt";
import type { AppRole } from "@/lib/roles";

declare module "next-auth" {
  interface User {
    role?: AppRole;
  }
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: AppRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: AppRole;
    email?: string;
    name?: string;
  }
}
