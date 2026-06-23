"use client";

import useSWR from "swr";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Users, UserPlus, Mail, Shield, Ban, Trash2, RefreshCw, Crown, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditUserDialog, type EditableUser } from "@/components/admin/EditUserDialog";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user" | "vip";
  status: "active" | "pending" | "disabled";
  createdAt: string;
  lastLoginAt: string | null;
};

const statusStyle: Record<string, string> = {
  active: "border-success/40 text-success bg-success/10",
  pending: "border-warning/40 text-warning bg-warning/10",
  disabled: "border-danger/40 text-danger bg-danger/10",
};

export default function AdminPage() {
  const { data: session } = useSession();
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; users: UserRow[] }>("/api/admin/users");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviteRole, setInviteRole] = useState<"user" | "vip">("user");
  const [inviting, setInviting] = useState(false);
  const [editUser, setEditUser] = useState<EditableUser | null>(null);

  const users = data?.users ?? [];

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role: inviteRole }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success(`Invitație trimisă la ${email}`);
      setEmail("");
      setName("");
      mutate();
    } catch (err: any) {
      toast.error(err.message || "Eroare");
    } finally {
      setInviting(false);
    }
  }

  async function patchUser(id: string, body: object) {
    const r = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    mutate();
    return j;
  }

  async function removeUser(id: string) {
    if (!confirm("Ștergi acest utilizator?")) return;
    const r = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    toast.success("Utilizator șters");
    mutate();
  }

  return (
    <div className="space-y-6 max-w-9xl">
      <div>
        <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
          <Users className="h-8 w-8 text-primary" />
          Administrare utilizatori
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Doar administratorii pot invita utilizatori noi. Fiecare utilizator are propriile setări, poziții și istoric (izolate în baza de date).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4 text-primary" />
            Invită utilizator nou
          </CardTitle>
        </CardHeader>
        <form onSubmit={sendInvite} className="px-5 pb-5 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Email</label>
            <input
              type="email"
              className="input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="utilizator@exemplu.com"
              required
            />
          </div>
          <div>
            <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Nume afișat</label>
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ion Popescu"
              required
            />
          </div>
          <div>
            <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Tip cont</label>
            <select
              className="input mt-1"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "user" | "vip")}
            >
              <option value="user">User — fără Statistics</option>
              <option value="vip">VIP — acces /dashboard/stats</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={inviting} className="btn-primary">
              <Mail className="h-4 w-4" />
              {inviting ? "Se trimite…" : "Trimite invitația pe email"}
            </button>
            <p className="text-[10px] text-text-muted mt-2">
              Necesită EMAIL_USER / EMAIL_PASS în .env.local (Gmail + parolă de aplicație).
            </p>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilizatori ({users.length})</CardTitle>
        </CardHeader>
        <div className="px-5 pb-5 overflow-x-auto">
          {isLoading && <p className="text-sm text-text-muted">Se încarcă…</p>}
          {!isLoading && users.length === 0 && (
            <p className="text-sm text-text-muted">Niciun utilizator în baza de date.</p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] mono uppercase tracking-widest text-text-muted border-b border-border">
                <th className="py-2 pr-3">Utilizator</th>
                <th className="py-2 pr-3">Rol</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === session?.user?.id;
                return (
                  <tr key={u.id} className="border-b border-border/50">
                    <td className="py-3 pr-3">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-text-muted mono">{u.email}</div>
                    </td>
                    <td className="py-3 pr-3">
                      {u.role === "admin" ? (
                        <span className="chip border-primary/40 text-primary inline-flex items-center gap-1">
                          <Shield className="h-3 w-3" /> admin
                        </span>
                      ) : u.role === "vip" ? (
                        <span className="chip border-secondary/40 text-secondary inline-flex items-center gap-1">
                          <Crown className="h-3 w-3" /> VIP
                        </span>
                      ) : (
                        <span className="text-text-muted">User</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={cn("chip text-[10px] uppercase", statusStyle[u.status])}>
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <button
                          type="button"
                          className="btn-ghost text-xs py-1 px-2"
                          title="Editează utilizator"
                          onClick={() => setEditUser(u)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {u.status === "pending" && (
                          <button
                            type="button"
                            className="btn-ghost text-xs py-1 px-2"
                            title="Retrimite invitația"
                            onClick={async () => {
                              try {
                                await patchUser(u.id, { action: "resend-invite" });
                                toast.success("Invitație retrimisă");
                              } catch (e: any) {
                                toast.error(e.message);
                              }
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {u.status === "active" && !isSelf && u.role !== "admin" && (
                          <button
                            type="button"
                            className="btn-ghost text-xs py-1 px-2 text-warning"
                            onClick={async () => {
                              try {
                                await patchUser(u.id, { status: "disabled" });
                                toast.success("Utilizator dezactivat");
                              } catch (e: any) {
                                toast.error(e.message);
                              }
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {u.status === "disabled" && (
                          <button
                            type="button"
                            className="btn-ghost text-xs py-1 px-2"
                            onClick={async () => {
                              try {
                                await patchUser(u.id, { status: "active" });
                                toast.success("Utilizator reactivat");
                              } catch (e: any) {
                                toast.error(e.message);
                              }
                            }}
                          >
                            Activează
                          </button>
                        )}
                        {u.status === "pending" && (
                          <button
                            type="button"
                            className="btn-ghost text-xs py-1 px-2 text-danger"
                            onClick={() => removeUser(u.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <EditUserDialog
        user={editUser}
        isSelf={editUser?.id === session?.user?.id}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
        onSaved={() => mutate()}
      />
    </div>
  );
}
