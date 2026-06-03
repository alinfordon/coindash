"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Cpu, Lock, Mail, LogIn } from "lucide-react";
import { toast } from "sonner";

function InviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState<{ email: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Link de invitație invalid");
      setLoading(false);
      return;
    }
    fetch(`/api/auth/invite/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setValid({ email: j.email, name: j.name });
        else setError(j.error || "Invitație invalidă");
      })
      .catch(() => setError("Nu s-a putut verifica invitația"))
      .finally(() => setLoading(false));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Parola: minim 8 caractere");
      return;
    }
    if (password !== confirm) {
      toast.error("Parolele nu coincid");
      return;
    }
    setSubmitting(true);
    const r = await fetch("/api/auth/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const j = await r.json();
    if (!j.ok) {
      toast.error(j.error || "Eroare");
      setSubmitting(false);
      return;
    }
    toast.success("Cont activat — autentificare…");
    const res = await signIn("credentials", {
      email: j.email,
      password,
      redirect: false,
    });
    setSubmitting(false);
    if (res?.ok) {
      router.replace("/dashboard");
      router.refresh();
    } else {
      toast.success("Cont creat. Te poți autentifica.");
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="glass w-full max-w-sm p-7 animate-fadeUp">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/30 to-secondary/30 border border-primary/50 flex items-center justify-center">
            <Cpu className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mt-4 font-heading font-bold text-xl">Activează contul</h1>
          <p className="text-[10px] mono text-text-muted mt-1 tracking-widest">INVITAȚIE NEXUS TRADE</p>
        </div>

        {loading && <p className="text-sm text-text-muted text-center">Se verifică invitația…</p>}
        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 text-danger text-sm px-3 py-2">
            {error}
          </div>
        )}
        {valid && (
          <>
            <p className="text-sm text-text-muted mb-4 text-center">
              Bun venit, <span className="text-text-primary font-medium">{valid.name}</span>
            </p>
            <div className="mb-3">
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Email</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input className="input pl-9 opacity-70" value={valid.email} readOnly />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Parolă nouă</label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  type="password"
                  className="input pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Confirmă parola</label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  type="password"
                  className="input pl-9"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-2.5">
              <LogIn className="h-4 w-4" />
              {submitting ? "Se activează…" : "Activează și intră"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>}>
      <InviteInner />
    </Suspense>
  );
}
