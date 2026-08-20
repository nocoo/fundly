export type BenchmarkPick = { code: string; name: string };

export const DEFAULT_BENCHMARKS: Record<string, BenchmarkPick> = {
  'FOF-均衡型': { code: '006289', name: '华夏养老2040三年持有混合(FOF)A' },
  'FOF-稳健型': { code: '005215', name: '南方全天候策略(FOF)A' },
  'FOF-进取型': { code: '005220', name: '海富通聚优精选混合(FOF)A' },
  'QDII-FOF': { code: '007721', name: '天弘标普500发起(QDII-FOF)A' },
  'QDII-REITs': { code: '070031', name: '嘉实全球房地产(QDII)' },
  'QDII-商品': { code: '003321', name: '易方达原油C类人民币' },
  'QDII-普通股票': { code: '000041', name: '华夏全球股票(QDII)(人民币)' },
  'QDII-混合债': { code: '002391', name: '华安全球美元收益债人民币A' },
  'QDII-混合偏股': { code: '110011', name: '易方达优质精选混合(QDII)' },
  'QDII-混合平衡': { code: '003629', name: '摩根全球多元配置(QDII-FOF)人民币A' },
  'QDII-混合灵活': { code: '001668', name: '汇添富全球移动互联混合(QDII)人民币A' },
  'QDII-纯债': { code: '000103', name: '国泰境外高收益债(QDII)' },
  Reits: { code: '180101', name: '博时蛇口产园REIT' },
  '债券型-中短债': { code: '000128', name: '大成景安短融债券A' },
  '债券型-信用债': { code: '000032', name: '易方达信用债债券A' },
  '债券型-利率债': { code: '006488', name: '富荣富开1-3年国开债纯债A' },
  '债券型-混合一级': { code: '100018', name: '富国天利增长债券A' },
  '债券型-混合二级': { code: '050011', name: '博时信用债券A/B' },
  '债券型-长债': { code: '000015', name: '华夏纯债债券A' },
  其他: { code: '007683', name: '华商转债精选债券A' },
  商品: { code: '161226', name: '国投瑞银白银期货(LOF)A' },
  '指数型-其他': { code: '518880', name: '黄金ETF华安' },
  '指数型-固收': { code: '003376', name: '广发中债7-10年国开债指数A' },
  '指数型-海外股票': { code: '050025', name: '博时标普500ETF联接A' },
  '指数型-股票': { code: '510500', name: '中证500ETF南方' },
  '混合型-偏债': { code: '000121', name: '华夏永福混合A' },
  '混合型-偏股': { code: '161005', name: '富国天惠成长混合(LOF)A' },
  '混合型-平衡': { code: '270002', name: '广发稳健增长混合A' },
  '混合型-灵活': { code: '000001', name: '华夏成长混合' },
  '混合型-绝对收益': { code: '000414', name: '嘉实绝对收益策略定期混合A' },
  股票型: { code: '000082', name: '嘉实研究阿尔法股票A' },
  '货币型-普通货币': { code: '000198', name: '天弘余额宝货币' },
  '货币型-浮动净值': { code: '007696', name: '嘉实融享货币' },
};

export function resolveBenchmark(
  fundType: string,
  overrides: Record<string, string> = {},
): BenchmarkPick | null {
  const code = overrides[fundType]?.trim() || DEFAULT_BENCHMARKS[fundType]?.code;
  if (!code) return null;
  const fallback = DEFAULT_BENCHMARKS[fundType];
  if (fallback && fallback.code === code) return fallback;
  return { code, name: fallback?.name ?? code };
}

export function mergeBenchmarks(overrides: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const type of Object.keys(DEFAULT_BENCHMARKS)) {
    next[type] = overrides[type]?.trim() || DEFAULT_BENCHMARKS[type]?.code || '';
  }
  return next;
}
