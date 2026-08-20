import { describe, expect, it } from 'bun:test';
import { mapFundDetail } from './fund-detail';

describe('mapFundDetail', () => {
  it('marks schema-null fields as empty and keeps filled ones', () => {
    const fields = mapFundDetail({
      fund_code: '000001',
      fund_name: '华夏成长混合',
      fund_type: '混合型-灵活',
      fund_manager: null,
      return_1y: 44.06,
      rank_pct_1y: null,
    });
    const manager = fields.find((f) => f.key === 'fund_manager');
    const rank = fields.find((f) => f.key === 'rank_pct_1y');
    const ret = fields.find((f) => f.key === 'return_1y');
    expect(manager?.empty).toBe(true);
    expect(manager?.value).toBeNull();
    expect(rank?.empty).toBe(true);
    expect(ret?.empty).toBe(false);
    expect(ret?.value).toBe(44.06);
    expect(fields.some((f) => f.key === 'pinyin_abbr' || f.key === 'pinyin_full')).toBe(false);
  });
});
