import type { ExchangeId } from "@/lib/exchanges";
import type { Candle, MyTradeRow, SymbolInfo, Ticker24h } from "@/lib/binance";
import type { KlineInterval } from "@/lib/analysisIntervals";

export type KrakenMarketScope = "crypto" | "stocks" | "both";

export type AssetClass = "crypto" | "tokenized_asset";

export type ExitOrderBundle =
  | { kind: "oco"; ocoOrderId: string }
  | { kind: "dual"; orderIds: string[] };

export type BuyFillResult = {
  orderId: string;
  executedQty: number;
  entryPrice: number;
  fills?: { qty: number; price: number; commission: number; commissionAsset: string }[];
};

export type ExitOrdersResult = {
  bundle: ExitOrderBundle;
  tpOrderId?: string;
  slOrderId?: string;
  error?: string;
};

export type PortfolioAssetRow = {
  asset: string;
  qty: number;
  price: number;
  valueUsdc: number;
};

export type PortfolioSnapshot = {
  total: number;
  assets: PortfolioAssetRow[];
  tickerOk: boolean;
};

export interface ExchangeAdapter {
  readonly id: ExchangeId;
  readonly sandbox: boolean;

  baseAssetOf(pair: string): string;
  getSymbolInfo(pair: string, assetClass?: AssetClass): Promise<SymbolInfo>;
  getTradableSymbols(): Promise<Set<string>>;

  fetchPrice(pair: string, assetClass?: AssetClass): Promise<number>;
  fetchCandles(pair: string, interval: KlineInterval, limit: number, assetClass?: AssetClass): Promise<Candle[]>;
  fetch24h(pair: string, assetClass?: AssetClass): Promise<Ticker24h>;
  fetchAll24h(): Promise<Ticker24h[]>;
  topQuotePairs(n: number): Promise<Ticker24h[]>;

  fetchQuoteBalance(): Promise<number>;
  fetchAssetBalance(asset: string): Promise<{ free: number; locked: number; total: number }>;
  fetchFreeBalance(asset: string): Promise<number>;
  fetchPortfolioValue(): Promise<PortfolioSnapshot>;

  marketBuyQuote(
    pair: string,
    quoteQty: number,
    assetClass?: AssetClass
  ): Promise<BuyFillResult>;
  marketSell(pair: string, quantity: number, assetClass?: AssetClass): Promise<{ orderId: string }>;
  placeExitOrders(
    pair: string,
    quantity: number,
    takeProfit: number,
    stopLoss: number,
    assetClass?: AssetClass
  ): Promise<ExitOrdersResult>;
  cancelExitOrders(pair: string, bundle: ExitOrderBundle, assetClass?: AssetClass): Promise<void>;
  queryExitState(
    pair: string,
    bundle: ExitOrderBundle,
    assetClass?: AssetClass
  ): Promise<"EXECUTING" | "ALL_DONE" | "UNKNOWN">;
  filledExitPrice(
    pair: string,
    bundle: ExitOrderBundle,
    assetClass?: AssetClass
  ): Promise<{ exitPrice: number; orderId?: string } | null>;
  fetchMyTrades(
    pair: string,
    opts: { startTime?: number; limit?: number; closedAt?: number },
    assetClass?: AssetClass
  ): Promise<MyTradeRow[]>;
}

export type { Candle, MyTradeRow, SymbolInfo, Ticker24h };
