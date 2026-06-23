import { connectDB } from "./db";
import { fetchDepositAddress, findDepositByTxId } from "./binance";
import { User } from "@/models/User";
import { VipDonation } from "@/models/VipDonation";
import { normalizeRole } from "./roles";

export type VipDonationConfig = {
  enabled: boolean;
  amountUsdc: number;
  network: string;
  depositAddress: string | null;
  disabledReason?: string;
};

const DEFAULT_AMOUNT = 5;
const DEFAULT_NETWORK = "BSC";

function adminBinanceCreds(): { apiKey: string; apiSecret: string } | null {
  const apiKey =
    process.env.VIP_DONATION_BINANCE_API_KEY?.trim() || process.env.BINANCE_API_KEY?.trim() || "";
  const apiSecret =
    process.env.VIP_DONATION_BINANCE_API_SECRET?.trim() ||
    process.env.BINANCE_API_SECRET?.trim() ||
    "";
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

function donationEnabledFlag(): boolean {
  return (process.env.VIP_DONATION_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

export function vipDonationAmount(): number {
  const raw = parseFloat(process.env.VIP_DONATION_USDC_AMOUNT || String(DEFAULT_AMOUNT));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AMOUNT;
}

export function vipDonationNetwork(): string {
  return (process.env.VIP_DONATION_NETWORK || DEFAULT_NETWORK).trim().toUpperCase();
}

export async function getVipDonationConfig(): Promise<VipDonationConfig> {
  const amountUsdc = vipDonationAmount();
  const network = vipDonationNetwork();

  if (!donationEnabledFlag()) {
    return {
      enabled: false,
      amountUsdc,
      network,
      depositAddress: null,
      disabledReason: "Donațiile VIP sunt dezactivate momentan.",
    };
  }

  const staticAddress = process.env.VIP_USDC_DEPOSIT_ADDRESS?.trim();
  if (staticAddress) {
    return { enabled: true, amountUsdc, network, depositAddress: staticAddress };
  }

  const creds = adminBinanceCreds();
  if (!creds) {
    return {
      enabled: false,
      amountUsdc,
      network,
      depositAddress: null,
      disabledReason: "Portofelul administratorului nu este configurat.",
    };
  }

  try {
    const depositAddress = await fetchDepositAddress("USDC", network, {
      ...creds,
      testnet: false,
    });
    return { enabled: true, amountUsdc, network, depositAddress };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare Binance";
    return {
      enabled: false,
      amountUsdc,
      network,
      depositAddress: null,
      disabledReason: msg.slice(0, 200),
    };
  }
}

export async function verifyVipDonation(userId: string, txId: string): Promise<{ reloginRequired: true }> {
  await connectDB();

  const user = await User.findById(userId);
  if (!user) throw new Error("Utilizator negăsit");
  if (user.status !== "active") throw new Error("Contul nu este activ");

  const role = normalizeRole(user.role);
  if (role === "admin") throw new Error("Administratorii au deja acces complet");
  if (role === "vip") throw new Error("Contul tău este deja VIP");

  const trimmedTx = txId.trim();
  if (!trimmedTx || trimmedTx.length < 8) throw new Error("TxID invalid");

  const config = await getVipDonationConfig();
  if (!config.enabled) {
    throw new Error(config.disabledReason || "Verificarea donației nu este disponibilă");
  }

  const existing = await VipDonation.findOne({ txId: trimmedTx.toLowerCase() });
  if (existing) {
    if (String(existing.userId) === userId) {
      throw new Error("Această tranzacție a fost deja folosită pentru contul tău");
    }
    throw new Error("Această tranzacție a fost deja folosită de alt utilizator");
  }

  const creds = adminBinanceCreds();
  if (!creds) throw new Error("Verificarea donației nu este configurată");

  const deposit = await findDepositByTxId(trimmedTx, {
    ...creds,
    testnet: false,
    coin: "USDC",
    network: config.network,
  });

  if (!deposit) {
    throw new Error(
      "Tranzacția nu a fost găsită în portofelul administratorului. Verifică rețeaua, suma și așteaptă confirmarea on-chain (1–15 min)."
    );
  }

  const amount = parseFloat(deposit.amount);
  if (!Number.isFinite(amount) || amount + 1e-8 < config.amountUsdc) {
    throw new Error(
      `Suma primită (${amount} USDC) este sub minimul de ${config.amountUsdc} USDC`
    );
  }

  user.role = "vip";
  await user.save();

  await VipDonation.create({
    txId: trimmedTx.toLowerCase(),
    userId: user._id,
    amount,
    coin: deposit.coin || "USDC",
    network: deposit.network || config.network,
  });

  return { reloginRequired: true };
}
