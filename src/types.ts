export type Signal = 'buy' | 'watch' | 'avoid';

export interface ETF {
  id: string;
  isin: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  peaEligible: boolean;
  active: boolean;
  boursoIdentifier: string | null;
  dataProviderSymbol: string | null;
}

export interface PricePoint {
  id?: string;
  etfId: string;
  pricedAt: string;
  openPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  closePrice: number;
  adjustedClosePrice: number | null;
  volume: number | null;
  source: string;
}

export interface MomentumSnapshot {
  id?: string;
  etfId: string;
  computedAt: string;
  strategyCode: 'momentum_v1';
  score: number;
  performance1Month: number | null;
  performance3Months: number | null;
  performance6Months: number | null;
  performance12Months: number | null;
  volatilityAnnualized: number | null;
  maxDrawdown: number | null;
  movingAverage50: number | null;
  movingAverage200: number | null;
  distanceToMovingAverage200: number | null;
  atr14: number | null;
  signal: Signal;
  details: MomentumDetails;
}

export interface MomentumDetails {
  latest_close: number;
  latest_metric_close: number;
  latest_priced_at: string;
  price_basis: 'adjusted_close_when_available';
  price_points: number;
  enough_history: boolean;
  score_profile: 'hybrid_momentum_3_to_6_months';
  weights: Record<string, number>;
  components: Record<string, number | null>;
}

export interface TrailingStopCandidate {
  percentage: number;
  stopPrice: number;
  trades: number;
  averageReturn: number;
  worstReturn: number;
  bestReturn: number;
  winRate: number;
  stopHitRate: number;
  riskAdjustedScore: number;
}

export interface TrailingStopResult {
  available: boolean;
  message?: string;
  latestClose?: number;
  recommended?: TrailingStopCandidate;
  candidates: TrailingStopCandidate[];
}

export interface BacktestSettings {
  period: '1y' | '6m' | '3m';
  stopLossPercent: number;
  initialCapital: number;
}

export interface BacktestTrade {
  etfId: string;
  symbol: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  stopPrice: number;
  entryScore: number;
  returnPercent: number;
  capitalAfterExit: number;
}

export interface EquityPoint {
  date: string;
  value: number;
}

export interface OpenPosition {
  etfId: string;
  symbol: string;
  entryDate: string;
  entryPrice: number;
  quantity: number;
  stopPrice: number;
  entryScore: number;
  currentValue: number;
}

export interface BacktestResult {
  settings: BacktestSettings;
  summary: {
    finalValue: number;
    returnPercent: number;
    tradeCount: number;
    winRate: number;
    averageTradeReturn: number;
    maxDrawdown: number;
  };
  trades: BacktestTrade[];
  openPosition: OpenPosition | null;
  equityCurve: EquityPoint[];
}

export interface EtfWithData {
  etf: ETF;
  prices: PricePoint[];
  snapshot: MomentumSnapshot | null;
  trailingStop: TrailingStopResult;
}
