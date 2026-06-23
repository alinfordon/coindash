"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil } from "lucide-react";

export type EditableUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user" | "vip";
  status: "active" | "pending" | "disabled";
};

type Props = {
  user: EditableUser | null;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function EditUserDialog({ user, isSelf, onOpenChange, onSaved }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "vip">("user");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setRole(user.role === "vip" ? "vip" : "user");
    setStatus(user.status === "disabled" ? "disabled" : "active");
  }, [user]);

  async function save() {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Numele este obligatoriu");
      return;
    }

    const body: Record<string, string> = {};
    if (trimmed !== user.name) body.name = trimmed;
    if (user.role !== "admin" && role !== user.role) body.role = role;
    if (user.status !== "pending" && status !== user.status) body.status = status;

    if (Object.keys(body).length === 0) {
      toast.message("Nicio modificare");
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Salvare eșuată");

      toast.success(
        j.reloginRequired
          ? "Utilizator actualizat — utilizatorul trebuie să se reconecteze pentru noul rol"
          : "Utilizator actualizat"
      );
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  const isAdmin = user?.role === "admin";
  const isPending = user?.status === "pending";

  return (
    <Dialog open={user != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Editează utilizator
          </DialogTitle>
          <DialogDescription>
            Modifică numele, rolul (User/VIP) sau statusul contului.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Email</label>
              <input className="input mt-1 opacity-70" value={user.email} readOnly />
            </div>

            <div>
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Nume afișat</label>
              <input
                className="input mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {!isAdmin && (
              <div>
                <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Rol</label>
                <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value as "user" | "vip")}>
                  <option value="user">User — fără Statistics</option>
                  <option value="vip">VIP — acces /dashboard/stats</option>
                </select>
              </div>
            )}

            {isAdmin && (
              <p className="text-xs text-text-muted border border-border/60 rounded-lg px-3 py-2">
                Rol <strong>admin</strong> — nu poate fi schimbat din interfață.
              </p>
            )}

            {!isPending ? (
              <div>
                <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Status</label>
                <select
                  className="input mt-1"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "active" | "disabled")}
                  disabled={isSelf}
                >
                  <option value="active">Activ</option>
                  <option value="disabled">Dezactivat</option>
                </select>
                {isSelf && (
                  <p className="text-[10px] text-text-muted mt-1">Nu îți poți dezactiva propriul cont.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-warning border border-warning/30 rounded-lg px-3 py-2">
                Cont în așteptare (pending) — poți edita numele și rolul. Statusul se schimbă la acceptarea invitației.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <button type="button" className="btn" onClick={() => onOpenChange(false)} disabled={saving}>
            Anulează
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Se salvează…
              </>
            ) : (
              "Salvează"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
