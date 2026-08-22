export type CostInput = {
  mgmtFeePct: number | null;
  custodianFeePct: number | null;
  salesServiceFeePct: number | null;
};

export type CostMetrics = {
  all_in_fee_pct: number | null;
  sales_fee_known: 0 | 1;
};

export function computeCostMetrics(input: CostInput): CostMetrics {
  const salesKnown = input.salesServiceFeePct != null && Number.isFinite(input.salesServiceFeePct);
  if (input.mgmtFeePct == null || input.custodianFeePct == null) {
    return { all_in_fee_pct: null, sales_fee_known: salesKnown ? 1 : 0 };
  }
  if (!Number.isFinite(input.mgmtFeePct) || !Number.isFinite(input.custodianFeePct)) {
    return { all_in_fee_pct: null, sales_fee_known: salesKnown ? 1 : 0 };
  }
  if (!salesKnown) {
    return { all_in_fee_pct: null, sales_fee_known: 0 };
  }
  return {
    all_in_fee_pct: input.mgmtFeePct + input.custodianFeePct + (input.salesServiceFeePct as number),
    sales_fee_known: 1,
  };
}
