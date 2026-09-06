/**
 * 宏观与跨资产领域模型与类型定义
 */

export type AssetClass =
  | 'index'
  | 'industry'
  | 'etf'
  | 'commodity'
  | 'fx'
  | 'rate'
  | 'stock'
  | 'risk'
  | 'global_index';

export interface MarketInstrument {
  instrumentId: string;
  assetClass: AssetClass;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  unit: string;
  tradingCalendar?: string;
  isActive?: boolean;
}

export interface MarketQuote {
  instrumentId: string;
  source: string;
  tradeDate: string;
  quoteAt?: number | null;
  isInferredDate?: boolean;
  price?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  prevClose?: number | null;
  changePct?: number | null;
  volume?: number | null;
  turnover?: number | null; // 统一单位：元
  settlementPrice?: number | null;
  prevSettlement?: number | null;
  openInterest?: number | null;
  sourceTimestamp?: number | null;
  collectedAt: number;
  batchId?: string | null;
  rawJson?: string | null;
}

export interface MarketDailyBar {
  instrumentId: string;
  tradeDate: string;
  source: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  turnover?: number | null; // 统一单位：元
  collectedAt?: number;
}

export interface MarketSeriesObservation {
  instrumentId: string;
  observationDate: string;
  source: string;
  value: number;
  unit?: string | null;
  periodEnd?: string | null;
  publishedAt?: string | null;
  collectedAt: number;
  changeBp?: number | null;
}

export interface MarketBreadth {
  tradeDate: string;
  scope: string;
  upCount: number;
  downCount: number;
  flatCount: number;
  totalValidCount: number;
  totalCatalogCount: number;
  medianChangePct?: number | null;
  validTurnoverSum?: number | null;
  limitUpCount?: number | null;
  limitDownCount?: number | null;
  limitBreakCount?: number | null;
  collectedAt: number;
  batchId?: string | null;
}

export interface MarketIndexMember {
  indexId: string;
  stockCode: string;
  stockName: string;
  weight?: number | null;
  rankOrder?: number;
}

export interface MarketInstrumentRelation {
  sourceId: string;
  targetId: string;
  relationType: 'tracks_index' | 'theme_associated';
  confidence: 'verified';
  description?: string;
}

export interface MarketSourceStatus {
  sourceKey: string;
  lastSuccessAt?: number | null;
  lastTradeDate?: string | null;
  lastStatusCode?: number | null;
  lastErrorMessage?: string | null;
  expectedItems?: number | null;
  actualItems?: number | null;
  batchId?: string | null;
  collectionMode?: 'live' | 'evidence';
  startedAt?: number | null;
}

export interface MarketEtfProfile {
  instrumentId: string;
  establishedDate: string | null;
  fundScale: number | null;
  fundManager: string | null;
  managementCompany: string | null;
  source: string;
  collectedAt: number;
  rawJson: string;
}

export interface MarketEtfHolding {
  instrumentId: string;
  reportDate: string;
  stockCode: string;
  stockName: string;
  assetType: string;
  holdPct: number | null;
  /** Ten thousand shares, matching the existing fund portfolio convention. */
  holdShares: number | null;
  holdValueWan: number | null;
  publishedAt: string | null;
  source: string;
  collectedAt: number;
}
