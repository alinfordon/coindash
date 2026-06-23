"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { canAccessStats, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  User,
  Mail,
  Shield,
  Crown,
  Calendar,
  Clock,
  UserPlus,
  Lock,
  Save,
  BarChart3,
} from "lucide-react";
import { VipUpgradeCard } from "@/components/profile/VipUpgradeCard";

type Profile = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user" | "vip";
  status: "active" | "pending" | "disabled";
  createdAt: string;
  lastLoginAt: string | null;
  invitedByName: string | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const roleStyle: Record<string, string> = {
  admin: "border-primary/40 text-primary bg-primary/10",
  vip: "border-secondary/40 text-secondary bg-secondary/10",
  user: "border-border text-text-muted bg-surface-2/60",
};

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; profile: Profile }>("/api/profile");
  const profile = data?.profile;

  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile?.name]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Numele este obligatoriu");
      return;
    }
    if (trimmed === profile?.name) {
      toast.message("Nicio modificare");
      return;
    }
    setSavingProfile(true);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success("Profil actualizat");
      await updateSession({ name: trimmed });
      mutate();
    } catch (err: any) {
      toast.error(err.message || "Eroare");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Parola nouă: minim 8 caractere");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Parolele noi nu coincid");
      return;
    }
    setSavingPassword(true);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success("Parola a fost schimbată");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Eroare");
    } finally {
      setSavingPassword(false);
    }
  }

  const role = profile?.role ?? session?.user?.role;
  const hasStats = canAccessStats(role);

  return (
    <div className="space-y-6 max-w-9xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">Profil</h1>
        <p className="text-xs sm:text-sm text-text-muted mt-1 mono tracking-wider">
          CONT · SECURITATE · ACCES
        </p>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/25 to-secondary/25 border border-primary/40 flex items-center justify-center shrink-0">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-heading font-bold text-text-primary truncate">
              {profile?.name ?? session?.user?.name ?? "—"}
            </div>
            <div className="text-sm text-text-muted truncate mt-0.5">{profile?.email ?? session?.user?.email}</div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] mono uppercase tracking-widest",
                  roleStyle[profile?.role ?? "user"]
                )}
              >
                {profile?.role === "admin" && <Shield className="h-3 w-3" />}
                {profile?.role === "vip" && <Crown className="h-3 w-3" />}
                {roleLabel(role)}
              </span>
              {profile?.status === "active" && (
                <span className="text-[10px] mono uppercase tracking-widest text-success">Activ</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informații cont</CardTitle>
          </CardHeader>
          {isLoading ? (
            <p className="text-sm text-text-muted">Se încarcă…</p>
          ) : (
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[10px] mono uppercase tracking-widest text-text-muted">Email</dt>
                  <dd className="text-text-primary mt-0.5 break-all">{profile?.email}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[10px] mono uppercase tracking-widest text-text-muted">Membru din</dt>
                  <dd className="text-text-primary mt-0.5">{fmtDate(profile?.createdAt ?? null)}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[10px] mono uppercase tracking-widest text-text-muted">Ultima autentificare</dt>
                  <dd className="text-text-primary mt-0.5">{fmtDate(profile?.lastLoginAt ?? null)}</dd>
                </div>
              </div>
              {profile?.invitedByName && (
                <div className="flex items-start gap-3">
                  <UserPlus className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />
                  <div>
                    <dt className="text-[10px] mono uppercase tracking-widest text-text-muted">Invitat de</dt>
                    <dd className="text-text-primary mt-0.5">{profile.invitedByName}</dd>
                  </div>
                </div>
              )}
            </dl>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acces funcții</CardTitle>
          </CardHeader>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface-2/40 px-3 py-2">
              <span className="flex items-center gap-2 text-text-muted">
                <BarChart3 className="h-4 w-4" />
                Statistics
              </span>
              {hasStats ? (
                <span className="text-[10px] mono uppercase tracking-widest text-success">Activ</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] mono uppercase tracking-widest text-secondary/80">
                  <Crown className="h-3 w-3" />
                  VIP
                </span>
              )}
            </li>
            {!hasStats && (
              <p className="text-xs text-text-muted leading-relaxed pt-1">
                Rolul <span className="text-text-primary">User</span> include trading și setări personale.
                Upgrade la <span className="text-secondary">VIP</span> pentru Statistics — setat de admin sau
                donație USDC (vezi mai jos).
              </p>
            )}
          </ul>
        </Card>
      </div>

      {!hasStats && role !== "admin" && (
        <VipUpgradeCard onUpgraded={() => mutate()} />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nume afișat</CardTitle>
          </CardHeader>
          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Nume</label>
              <input
                className="input mt-1 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Numele tău"
                autoComplete="name"
              />
            </div>
            <button type="submit" disabled={savingProfile} className="btn-primary w-full sm:w-auto">
              <Save className="h-4 w-4" />
              Salvează
            </button>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schimbă parola</CardTitle>
          </CardHeader>
          <form onSubmit={savePassword} className="space-y-3">
            <div>
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Parola curentă</label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  type="password"
                  className="input pl-9 w-full"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Parola nouă</label>
              <input
                type="password"
                className="input mt-1 w-full"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div>
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Confirmă parola nouă</label>
              <input
                type="password"
                className="input mt-1 w-full"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="btn w-full sm:w-auto"
            >
              Actualizează parola
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
