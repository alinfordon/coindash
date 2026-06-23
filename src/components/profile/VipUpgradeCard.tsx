"use client";

import useSWR from "swr";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Crown, Copy, CheckCircle2, Wallet, Hash, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type DonationConfig = {
  enabled: boolean;
  amountUsdc: number;
  network: string;
  depositAddress: string | null;
  disabledReason?: string;
};

export function VipUpgradeCard({ onUpgraded }: { onUpgraded?: () => void }) {
  const { update: updateSession } = useSession();
  const { data, isLoading } = useSWR<{ ok: boolean; config: DonationConfig }>(
    "/api/profile/vip-donation"
  );
  const config = data?.config;

  const [txId, setTxId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!config?.depositAddress) return;
    await navigator.clipboard.writeText(config.depositAddress);
    setCopied(true);
    toast.success("Adresă copiată");
    setTimeout(() => setCopied(false), 2000);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!txId.trim()) {
      toast.error("Introdu TxID-ul tranzacției");
      return;
    }
    setVerifying(true);
    try {
      const r = await fetch("/api/profile/vip-donation/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId: txId.trim() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success("Felicitări! Contul tău este acum VIP — reconectare…");
      await updateSession({});
      setTxId("");
      onUpgraded?.();
    } catch (err: any) {
      toast.error(err.message || "Verificare eșuată");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Card className="border-secondary/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-secondary">
          <Crown className="h-4 w-4" />
          Upgrade VIP
        </CardTitle>
      </CardHeader>

      <div className="space-y-4 text-sm">
        <p className="text-text-muted leading-relaxed">
          Accesul <span className="text-secondary font-medium">VIP</span> se obține în două moduri:
        </p>
        <ul className="space-y-2 text-text-muted">
          <li className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              Setat manual de <span className="text-text-primary">administrator</span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Wallet className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
            <span>
              Donație de{" "}
              <span className="text-text-primary mono">
                {config?.amountUsdc ?? 5} USDC
              </span>{" "}
              
            </span>
          </li>
        </ul>

        {isLoading ? (
          <p className="text-text-muted text-xs">Se încarcă datele portofelului…</p>
        ) : config?.enabled && config.depositAddress ? (
          <>
            <div className="rounded-lg border border-border/70 bg-surface-2/50 p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[10px] mono uppercase tracking-widest">
                <span className="text-text-muted">Rețea</span>
                <span className="rounded border border-secondary/40 text-secondary px-2 py-0.5">
                  {config.network}
                </span>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted">Minim</span>
                <span className="text-text-primary">{config.amountUsdc} USDC</span>
              </div>

              <div>
                <label className="text-[10px] mono uppercase tracking-widest text-text-muted">
                  Adresă portofel
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    className="input flex-1 mono text-xs"
                    value={config.depositAddress}
                    readOnly
                  />
                  <button
                    type="button"
                    className="btn shrink-0 px-3"
                    onClick={copyAddress}
                    title="Copiază adresa"
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <ol className="text-xs text-text-muted space-y-1 list-decimal list-inside">
                <li>Trimite {config.amountUsdc} USDC (sau mai mult) pe rețeaua {config.network}</li>
                <li>Așteaptă confirmarea depozitului în Binance (1–15 min)</li>
                <li>Introdu TxID-ul (hash blockchain) mai jos</li>
              </ol>
            </div>

            <form onSubmit={verify} className="space-y-3">
              <div>
                <label className="text-[10px] mono uppercase tracking-widest text-text-muted">
                  TxID tranzacție
                </label>
                <div className="relative mt-1">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                  <input
                    className="input pl-9 w-full mono text-xs"
                    value={txId}
                    onChange={(e) => setTxId(e.target.value)}
                    placeholder="0x… sau hash-ul depozitului"
                    autoComplete="off"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={verifying || !txId.trim()}
                className={cn("btn-primary w-full sm:w-auto", verifying && "opacity-70")}
              >
                <Crown className="h-4 w-4" />
                Verifică donația și activează VIP
              </button>
            </form>
          </>
        ) : (
          <div className="rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2 text-xs text-text-muted">
            {config?.disabledReason ||
              "Donația automată nu este disponibilă — contactează administratorul pentru upgrade VIP."}
          </div>
        )}
      </div>
    </Card>
  );
}
