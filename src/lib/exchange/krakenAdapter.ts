import {
  detectKrakenAssetClass,
  fetchKrakenUsdcBalance,
  getKrakenBalance,
  krakenBaseAsset,
  krakenCancelOrder,
  krakenFetch24h,
  krakenFetchAll24h,
  krakenFetchCandles,
  krakenFetchMyTrades,
  krakenFetchPortfolioValue,
  krakenFetchPrice,
  krakenMarketBuyQuote,
  krakenMarketSell,
  krakenPairToSymbolInfo,
  krakenPlaceExitOrders,
  krakenQueryOrders,
  krakenTopPairs,
  loadKrakenPairs,
  resolveKrakenPair,
} from "@/lib/kraken";
import type {
  AssetClass,
  ExchangeAdapter,
  ExitOrderBundle,
  ExitOrdersResult,
  KrakenMarketScope,
  PortfolioSnapshot,
} from "./types";

export class KrakenAdapter implements ExchangeAdapter {
  readonly id = "kraken" as const;
  readonly sandbox = false;

  constructor(
    private apiKey: string,
    private apiSecret: string,
    private scope: KrakenMarketScope = "both"
  ) {}

  baseAssetOf(pair: string): string {
    return krakenBaseAsset(pair);
  }

  private ac(pair: string, assetClass?: AssetClass): AssetClass {
    return assetClass ?? detectKrakenAssetClass(pair, this.scope);
  }

  async getSymbolInfo(pair: string, assetClass?: AssetClass) {
    const meta = await resolveKrakenPair(pair, this.scope, this.ac(pair, assetClass));
    return krakenPairToSymbolInfo(meta);
  }

  async getTradableSymbols(): Promise<Set<string>> {
    const map = await loadKrakenPairs(this.scope);
    return new Set([...map.keys()]);
  }

  fetchPrice(pair: string, assetClass?: AssetClass) {
    return krakenFetchPrice(pair, this.scope, this.ac(pair, assetClass));
  }

  fetchCandles(pair: string, interval: Parameters<typeof krakenFetchCandles>[1], limit: number, assetClass?: AssetClass) {
    return krakenFetchCandles(pair, interval, limit, this.scope, this.ac(pair, assetClass));
  }

  fetch24h(pair: string, assetClass?: AssetClass) {
    return krakenFetch24h(pair, this.scope, this.ac(pair, assetClass));
  }

  fetchAll24h() {
    return krakenFetchAll24h(this.scope);
  }

  topQuotePairs(n: number) {
    return krakenTopPairs(n, this.scope);
  }

  fetchQuoteBalance() {
    return fetchKrakenUsdcBalance(this.apiKey, this.apiSecret);
  }

  async fetchAssetBalance(asset: string) {
    const rows = await getKrakenBalance(this.apiKey, this.apiSecret);
    const hit = rows.find((r) => r.asset === asset);
    const total = hit?.qty ?? 0;
    return { free: total, locked: 0, total };
  }

  async fetchFreeBalance(asset: string) {
    const b = await this.fetchAssetBalance(asset);
    return b.free;
  }

  async fetchPortfolioValue(): Promise<PortfolioSnapshot> {
    const pv = await krakenFetchPortfolioValue(this.apiKey, this.apiSecret, this.scope);
    return { total: pv.total, assets: pv.assets, tickerOk: pv.tickerOk };
  }

  async marketBuyQuote(pair: string, quoteQty: number, assetClass?: AssetClass) {
    const ac = this.ac(pair, assetClass);
    const res = await krakenMarketBuyQuote(this.apiKey, this.apiSecret, pair, quoteQty, this.scope, ac);
    return {
      orderId: res.txid[0] || "",
      executedQty: res.executedQty,
      entryPrice: res.entryPrice,
    };
  }

  async marketSell(pair: string, quantity: number, assetClass?: AssetClass) {
    const orderId = await krakenMarketSell(
      this.apiKey,
      this.apiSecret,
      pair,
      quantity,
      this.scope,
      this.ac(pair, assetClass)
    );
    return { orderId };
  }

  async placeExitOrders(
    pair: string,
    quantity: number,
    takeProfit: number,
    stopLoss: number,
    assetClass?: AssetClass
  ): Promise<ExitOrdersResult> {
    const res = await krakenPlaceExitOrders(
      this.apiKey,
      this.apiSecret,
      pair,
      quantity,
      takeProfit,
      stopLoss,
      this.scope,
      this.ac(pair, assetClass)
    );
    return {
      bundle: { kind: "dual", orderIds: res.orderIds },
      tpOrderId: res.tpOrderId,
      slOrderId: res.slOrderId,
      error: res.error,
    };
  }

  async cancelExitOrders(pair: string, bundle: ExitOrderBundle, assetClass?: AssetClass) {
    const ac = this.ac(pair, assetClass);
    if (bundle.kind === "dual") {
      for (const id of bundle.orderIds) {
        try {
          await krakenCancelOrder(this.apiKey, this.apiSecret, id, ac);
        } catch {
          /* already gone */
        }
      }
    }
  }

  async queryExitState(
    pair: string,
    bundle: ExitOrderBundle,
    assetClass?: AssetClass
  ): Promise<"EXECUTING" | "ALL_DONE" | "UNKNOWN"> {
    if (bundle.kind !== "dual" || !bundle.orderIds.length) return "UNKNOWN";
    try {
      const orders = await krakenQueryOrders(this.apiKey, this.apiSecret, bundle.orderIds);
      const rows = Object.values(orders || {});
      if (!rows.length) return "UNKNOWN";
      const open = rows.some((o) => o.status === "open" || o.status === "pending");
      const filled = rows.some((o) => o.status === "closed" && +o.vol_exec > 0);
      if (open) return "EXECUTING";
      if (filled) return "ALL_DONE";
      return "UNKNOWN";
    } catch {
      return "UNKNOWN";
    }
  }

  async filledExitPrice(pair: string, bundle: ExitOrderBundle, assetClass?: AssetClass) {
    if (bundle.kind !== "dual" || !bundle.orderIds.length) return null;
    try {
      const orders = await krakenQueryOrders(this.apiKey, this.apiSecret, bundle.orderIds);
      for (const o of Object.values(orders || {})) {
        if (o.status === "closed" && +o.vol_exec > 0) {
          const executedQty = +o.vol_exec;
          const cost = +o.cost || 0;
          const exitPrice = executedQty > 0 ? cost / executedQty : +o.price || 0;
          if (exitPrice > 0) return { exitPrice, orderId: o.txid || undefined };
        }
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  fetchMyTrades(
    pair: string,
    opts: { startTime?: number; limit?: number; closedAt?: number },
    assetClass?: AssetClass
  ) {
    return krakenFetchMyTrades(
      this.apiKey,
      this.apiSecret,
      pair,
      this.scope,
      { startTime: opts.startTime, limit: opts.limit },
      this.ac(pair, assetClass)
    );
  }
}
