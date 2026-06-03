import { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authenticateUser, ensureBootstrapAdmin } from "./users";

export const authOptions: AuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;

        await ensureBootstrapAdmin();
        const user = await authenticateUser(creds.email, creds.password);
        if (!user) {
          await new Promise((r) => setTimeout(r, 400));
          return null;
        }

        const role: "admin" | "user" = user.role === "admin" ? "admin" : "user";
        return {
          id: String(user._id),
          name: user.name,
          email: user.email,
          role,
        };
      },
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: "admin" | "user" }).role;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.role = token.role as "admin" | "user" | undefined;
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    },
  },
};
