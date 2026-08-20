export interface FieldView {
  key: string;
  label: string;
  group: string;
  value: string | number | null;
  empty: boolean;
}

export function presentField(
  key: string,
  label: string,
  group: string,
  value: string | number | null | undefined,
): FieldView {
  const empty = value === null || value === undefined || value === '';
  return { key, label, group, value: empty ? null : value, empty };
}

export function mapFundDetail(row: Record<string, unknown> | null): FieldView[] {
  if (!row) return [];
  const num = (k: string) => {
    const v = row[k];
    return typeof v === 'number' ? v : v === null || v === undefined ? null : Number(v);
  };
  const str = (k: string) => {
    const v = row[k];
    return typeof v === 'string' ? v : v === null || v === undefined ? null : String(v);
  };
  return [
    presentField('fund_code', '基金代码', '基本信息', str('fund_code')),
    presentField('fund_name', '基金名称', '基本信息', str('fund_name')),
    presentField('fund_type', '基金类型', '基本信息', str('fund_type')),
    presentField('established_date', '成立日期', '基本信息', str('established_date')),
    presentField('fund_manager', '基金经理', '基本信息', str('fund_manager')),
    presentField('fund_company', '基金公司', '基本信息', str('fund_company')),
    presentField('fund_scale', '规模（亿元）', '基本信息', num('fund_scale')),
    presentField('scale_date', '规模日期', '基本信息', str('scale_date')),
    presentField('fee_rate', '管理费率', '基本信息', num('fee_rate')),
    presentField('return_1m', '近1月收益%', '业绩', num('return_1m')),
    presentField('return_3m', '近3月收益%', '业绩', num('return_3m')),
    presentField('return_6m', '近6月收益%', '业绩', num('return_6m')),
    presentField('return_1y', '近1年收益%', '业绩', num('return_1y')),
    presentField('return_2y', '近2年收益%', '业绩', num('return_2y')),
    presentField('return_3y', '近3年收益%', '业绩', num('return_3y')),
    presentField('return_5y', '近5年收益%', '业绩', num('return_5y')),
    presentField('return_ytd', '今年以来%', '业绩', num('return_ytd')),
    presentField('return_since_start', '成立以来%', '业绩', num('return_since_start')),
    presentField('rank_pct_1m', '近1月同类排名', '排名', num('rank_pct_1m')),
    presentField('rank_pct_3m', '近3月同类排名', '排名', num('rank_pct_3m')),
    presentField('rank_pct_6m', '近6月同类排名', '排名', num('rank_pct_6m')),
    presentField('rank_pct_1y', '近1年同类排名', '排名', num('rank_pct_1y')),
    presentField('rank_pct_2y', '近2年同类排名', '排名', num('rank_pct_2y')),
    presentField('rank_pct_3y', '近3年同类排名', '排名', num('rank_pct_3y')),
    presentField('rank_pct_5y', '近5年同类排名', '排名', num('rank_pct_5y')),
    presentField('pass_4433', '4433', '排名', num('pass_4433')),
    presentField('data_date', '业绩日期', '业绩', str('data_date')),
  ];
}
