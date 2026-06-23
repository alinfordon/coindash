import { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authenticateUser, ensureBootstrapAdmin } from "./users";
import { normalizeRole, type AppRole } from "./roles";

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

        const role = normalizeRole(user.role);
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
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = user.id;
        token.role = normalizeRole((user as { role?: AppRole }).role);
        token.email = user.email;
        token.name = user.name;
      }
      if (trigger === "update" && session?.name) {
        token.name = session.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.role = normalizeRole(token.role);
        session.user.email = token.email ?? session.user.email;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
};
