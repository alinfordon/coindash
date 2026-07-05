import {
  baseAssetOf,
  cancelOco,
  fetch24h,
  fetchAll24h,
  fetchAssetBalance,
  fetchCandles,
  fetchFreeBalance,
  fetchMyTrades,
  fetchPortfolioValueUsdc,
  fetchPrice,
  fetchUsdcBalance,
  floorToStep,
  floorToTick,
  formatNum,
  getAccount,
  getOcoOrderList,
  getOrder,
  getSpotUsdcTradableSymbols,
  getSymbolInfo,
  marketBuyQuote,
  marketSell,
  placeOco,
  topUsdcPairs,
} from "@/lib/binance";
import type {
  AssetClass,
  ExchangeAdapter,
  ExitOrderBundle,
  ExitOrdersResult,
  PortfolioSnapshot,
} from "./types";

export class BinanceAdapter implements ExchangeAdapter {
  readonly id = "binance" as const;

  constructor(
    private apiKey: string,
    private apiSecret: string,
    readonly sandbox: boolean
  ) {}

  baseAssetOf(pair: string): string {
    return baseAssetOf(pair);
  }

  async getSymbolInfo(pair: string): Promise<Awaited<ReturnType<typeof getSymbolInfo>>> {
    return getSymbolInfo(pair, this.sandbox);
  }

  async getTradableSymbols(): Promise<Set<string>> {
    return getSpotUsdcTradableSymbols(this.sandbox);
  }

  fetchPrice(pair: string): Promise<number> {
    return fetchPrice(pair, this.sandbox);
  }

  fetchCandles(pair: string, interval: Parameters<typeof fetchCandles>[1], limit: number, _assetClass?: import("./types").AssetClass) {
    return fetchCandles(pair, interval, limit, this.sandbox);
  }

  fetch24h(pair: string, _assetClass?: import("./types").AssetClass) {
    return fetch24h(pair, this.sandbox);
  }

  fetchAll24h() {
    return fetchAll24h(this.sandbox);
  }

  topQuotePairs(n: number) {
    return topUsdcPairs(n, this.sandbox);
  }

  fetchQuoteBalance() {
    return fetchUsdcBalance(this.sandbox);
  }

  fetchAssetBalance(asset: string) {
    return fetchAssetBalance(asset, this.sandbox);
  }

  fetchFreeBalance(asset: string) {
    return fetchFreeBalance(asset, this.sandbox);
  }

  async fetchPortfolioValue(): Promise<PortfolioSnapshot> {
    const pv = await fetchPortfolioValueUsdc(this.sandbox);
    return { total: pv.total, assets: pv.assets, tickerOk: pv.tickerOk };
  }

  async marketBuyQuote(pair: string, quoteQty: number, _assetClass?: AssetClass) {
    const buyOrder = await marketBuyQuote(pair, quoteQty, this.sandbox);
    const fills = buyOrder?.fills as { qty: string; price: string; commission: string; commissionAsset: string }[] | undefined;
    const base = baseAssetOf(pair);
    let executedQty = +buyOrder.executedQty || 0;
    let entryPrice = +buyOrder.price || 0;
    let entryFee = 0;
    let feeCurrency = "USDC";
    if (fills?.length) {
      const agg = fills.reduce(
        (a, f) => {
          const q = +f.qty;
          const px = +f.price;
          const fee = +f.commission || 0;
          const feeBase = f.commissionAsset === base ? fee : 0;
          return { qty: a.qty + q, netQty: a.netQty + (q - feeBase), notional: a.notional + q * px, fee: a.fee + fee };
        },
        { qty: 0, netQty: 0, notional: 0, fee: 0 }
      );
      if (agg.qty > 0) entryPrice = agg.notional / agg.qty;
      if (agg.netQty > 0) executedQty = agg.netQty;
      entryFee = agg.fee;
      feeCurrency = fills[0]?.commissionAsset || "USDC";
    }
    return {
      orderId: buyOrder?.orderId?.toString() || "",
      executedQty,
      entryPrice,
      entryFee,
      feeCurrency,
      fills: fills?.map((f) => ({
        qty: +f.qty,
        price: +f.price,
        commission: +f.commission,
        commissionAsset: f.commissionAsset,
      })),
    };
  }

  async marketSell(pair: string, quantity: number, _assetClass?: AssetClass) {
    const res = await marketSell(pair, quantity, this.sandbox);
    return { orderId: res?.orderId?.toString() || "" };
  }

  async placeExitOrders(
    pair: string,
    quantity: number,
    takeProfit: number,
    stopLoss: number,
    _assetClass?: AssetClass
  ): Promise<ExitOrdersResult> {
    try {
      const oco = await placeOco(pair, quantity, takeProfit, stopLoss, this.sandbox);
      const ocoOrderId = oco?.orderListId?.toString() || "";
      return {
        bundle: { kind: "oco", ocoOrderId },
        tpOrderId: undefined,
        slOrderId: undefined,
      };
    } catch (e: any) {
      return {
        bundle: { kind: "oco", ocoOrderId: "" },
        error: e.message?.slice(0, 300),
      };
    }
  }

  async cancelExitOrders(pair: string, bundle: ExitOrderBundle) {
    if (bundle.kind !== "oco" || !bundle.ocoOrderId) return;
    await cancelOco(pair, bundle.ocoOrderId, this.sandbox);
  }

  async queryExitState(pair: string, bundle: ExitOrderBundle): Promise<"EXECUTING" | "ALL_DONE" | "UNKNOWN"> {
    if (bundle.kind !== "oco" || !bundle.ocoOrderId) return "UNKNOWN";
    try {
      const list = await getOcoOrderList(pair, bundle.ocoOrderId, this.sandbox);
      const s = list.listOrderStatus as string;
      if (s === "EXECUTING") return "EXECUTING";
      if (s === "ALL_DONE") return "ALL_DONE";
      return "UNKNOWN";
    } catch {
      return "UNKNOWN";
    }
  }

  async filledExitPrice(pair: string, bundle: ExitOrderBundle) {
    if (bundle.kind !== "oco" || !bundle.ocoOrderId) return null;
    try {
      const list = await getOcoOrderList(pair, bundle.ocoOrderId, this.sandbox);
      const legs = (list.orders || []) as { orderId: number }[];
      for (const leg of legs) {
        try {
          const order = await getOrder(pair, leg.orderId, this.sandbox);
          if (order.status === "FILLED" && +order.executedQty > 0) {
            const executedQty = +order.executedQty;
            const quote = +order.cummulativeQuoteQty || +order.cumulativeQuoteQty || 0;
            const exitPrice = quote > 0 ? quote / executedQty : +order.price;
            if (exitPrice > 0) return { exitPrice, orderId: String(leg.orderId) };
          }
        } catch {
          /* next */
        }
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  fetchMyTrades(pair: string, opts: { startTime?: number; limit?: number; closedAt?: number }) {
    return fetchMyTrades(pair, { startTime: opts.startTime, limit: opts.limit, testnet: this.sandbox });
  }

  async testConnection() {
    const acc = await getAccount(this.sandbox, this.apiKey, this.apiSecret);
    const balances = (acc.balances || [])
      .filter((b: { free: string; locked: string }) => +b.free > 0 || +b.locked > 0)
      .map((b: { asset: string; free: string; locked: string }) => ({
        asset: b.asset,
        free: +b.free,
        locked: +b.locked,
      }));
    return { canTrade: acc.canTrade !== false, balances };
  }
}

export { floorToStep, floorToTick, formatNum };
