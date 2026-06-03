"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cpu, Lock, Mail, LogIn, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const res = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (res?.ok) {
      toast.success("Authenticated");
      router.replace(res.url || callbackUrl);
      router.refresh();
    } else {
      setErr("Invalid credentials");
      toast.error("Invalid credentials");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Animated mesh backdrop */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full animate-floatMesh"
          style={{
            background:
              "radial-gradient(closest-side, rgba(0,245,255,0.18), transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <div
          className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full animate-floatMesh"
          style={{
            background:
              "radial-gradient(closest-side, rgba(123,47,255,0.20), transparent 70%)",
            filter: "blur(20px)",
            animationDelay: "-6s",
          }}
        />
      </div>

      <form
        onSubmit={onSubmit}
        className="glass w-full max-w-sm p-7 animate-fadeUp relative"
        autoComplete="off"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/30 to-secondary/30 border border-primary/50 flex items-center justify-center shadow-neon animate-pulseGlow">
            <Cpu className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mt-4 font-heading font-bold text-2xl tracking-tight">
            NEXUS<span className="text-primary">.</span>TRADE
          </h1>
          <div className="mt-1 text-[10px] mono tracking-[0.35em] text-text-muted">
            AUTHENTICATION REQUIRED
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] mono uppercase tracking-widest text-text-muted">
              Email
            </label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="email"
                className="input pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                required
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] mono uppercase tracking-widest text-text-muted">
              Password
            </label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="password"
                className="input pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 text-danger text-xs px-3 py-2">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="btn-primary w-full justify-center mt-5 py-2.5"
        >
          {loading ? (
            <span className="mono text-xs tracking-widest">AUTHENTICATING…</span>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              <span>SIGN IN</span>
            </>
          )}
        </button>

        <div className="mt-5 flex items-start gap-2 text-[10px] text-text-muted">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
          <span>
            Autentificare cu email și parolă. Administratorii pot invita utilizatori noi.
           
          </span>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
