/**
 * Short Chinese blurbs for daily StatTile labels (STAT_ALIASES in daily-md).
 * Keep to 1–2 sentences; shown on hover/focus via Tooltip.
 */
export const DAILY_STAT_INFO: Record<string, string> = {
  'S&P 500':
    '标普 500 指数，美股大盘核心基准，跟踪约 500 家大型上市公司，常用来概括美股整体风险偏好。',
  VIX: '芝加哥期权交易所波动率指数（VIX），反映市场对未来约 30 天波动的预期；升高通常对应避险与不确定性上升。',
  'US 10Y':
    '美国十年期国债收益率，全球无风险利率的重要锚点，影响股债估值、资金成本与跨资产相对吸引力。',
  DXY: '美元指数（DXY），衡量美元相对一篮子主要货币的强弱，常与大宗商品与新兴市场风险资产联动。',
  Gold: '黄金（期货或现货代理），典型避险与实际利率敏感资产，常在美元走弱或避险升温时受到关注。',
};

export function dailyStatInfo(label: string): string | undefined {
  const text = DAILY_STAT_INFO[label];
  return text?.trim() ? text : undefined;
}
