import { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const authOptions: AuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (!creds?.username || !creds?.password) return null;

        const expectedUser = process.env.ADMIN_USERNAME || "admin";
        if (creds.username !== expectedUser) {
          await new Promise((r) => setTimeout(r, 400));
          return null;
        }

        const hash = process.env.ADMIN_PASSWORD_HASH;
        if (hash) {
          const ok = await bcrypt.compare(creds.password, hash);
          return ok ? { id: "admin", name: expectedUser } : null;
        }

        const plain = process.env.ADMIN_PASSWORD || "admin";
        if (creds.password === plain) return { id: "admin", name: expectedUser };
        return null;
      },
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.uid;
      return session;
    },
  },
};
