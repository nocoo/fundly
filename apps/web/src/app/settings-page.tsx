import { Input, LayerCard } from '@nocoo/basalt';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nocoo/basalt/components/tabs';
import { ToggleGroup, ToggleGroupItem } from '@nocoo/basalt/components/toggle-group';
import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '@/components/layout';
import { PanelHeading, ResearchHeader } from '@/components/layout/research-layout';
import { BenchmarkBrowser } from '@/components/settings/benchmark-browser';
import { DataOverview } from '@/components/settings/data-overview';
import { Metric } from '@/components/ui/metric';
import { useChartPrefs } from '@/hooks/use-chart-prefs';
import { useQuoteColor } from '@/hooks/use-quote-color';
import { parseRefRates } from '@/lib/chart-growth';
import { QUOTE_COLOR_OPTIONS, type QuoteColor } from '@/lib/quote-color';

export default function SettingsPage() {
  const { color, setColor } = useQuoteColor();
  const { prefs, setPrefs } = useChartPrefs();
  const [rateDraft, setRateDraft] = useState(
    [prefs.refRates[0], prefs.refRates[1]].map((n) => (n === undefined ? '' : String(n))),
  );
  const commitRates = (next: string[]) => {
    setRateDraft(next);
    setPrefs({ ...prefs, refRates: parseRefRates(next.map((x) => x.trim()).filter(Boolean)) });
  };

  return (
    <AppShell breadcrumbs={[{ label: '设置' }]}>
      <div className="research-page">
        <ResearchHeader
          title="设置"
          icon={Settings2}
          description="调整行情显示与研究基准。偏好会自动保存在当前浏览器。"
        />
        <Tabs defaultValue="display">
          <TabsList aria-label="设置分类">
            <TabsTrigger value="display">显示与图表</TabsTrigger>
            <TabsTrigger value="data">数据状态</TabsTrigger>
          </TabsList>
          <TabsContent value="display">
            <div className="research-settings-grid">
              <div className="research-settings-stack">
                <LayerCard padding="none">
                  <PanelHeading title="涨跌颜色" description="用于行情、K 线和收益数字" />
                  <LayerCard.Body className="space-y-5">
                    <ToggleGroup
                      type="single"
                      value={color}
                      onValueChange={(value) => value && setColor(value as QuoteColor)}
                      aria-label="涨跌颜色"
                    >
                      {QUOTE_COLOR_OPTIONS.map((option) => (
                        <ToggleGroupItem key={option.id} value={option.id} title={option.hint}>
                          {option.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <div className="rounded-lg bg-basalt-muted/55 p-3">
                      <p className="mb-3 text-[11px] text-basalt-muted-foreground">配色预览</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs text-basalt-muted-foreground">上涨</span>
                          <Metric value={1.28} kind="percent" signed className="mt-1 text-xl" />
                        </div>
                        <div>
                          <span className="text-xs text-basalt-muted-foreground">下跌</span>
                          <Metric value={-0.76} kind="percent" signed className="mt-1 text-xl" />
                        </div>
                      </div>
                    </div>
                  </LayerCard.Body>
                </LayerCard>
                <LayerCard padding="none">
                  <PanelHeading title="参考增长线" description="在净值图中叠加年化收益参考线" />
                  <LayerCard.Body className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {[0, 1].map((index) => (
                        <div key={index} className="space-y-2">
                          <label
                            className="text-xs text-basalt-muted-foreground"
                            htmlFor={`rate-draft-${index}`}
                          >
                            参考年化 {index + 1}
                          </label>
                          <div className="relative">
                            <Input
                              id={`rate-draft-${index}`}
                              type="number"
                              step="0.1"
                              className="h-9 pr-7 font-mono"
                              value={rateDraft[index] ?? ''}
                              placeholder="留空关闭"
                              onChange={(e) => {
                                const next = [...rateDraft];
                                next[index] = e.target.value;
                                commitRates(next);
                              }}
                            />
                            <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-basalt-muted-foreground">
                              %
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] leading-relaxed text-basalt-muted-foreground">
                      最多两条，留空后隐藏。参考线按固定年化计算。
                    </p>
                  </LayerCard.Body>
                </LayerCard>
              </div>
              <LayerCard padding="none">
                <PanelHeading
                  title="分类基准"
                  description="选择基金类型，设置净值图中用于比较的基准产品"
                />
                <BenchmarkBrowser
                  benchmarks={prefs.benchmarks}
                  onChange={(type, code) =>
                    setPrefs({ ...prefs, benchmarks: { ...prefs.benchmarks, [type]: code } })
                  }
                />
                <LayerCard.Footer className="justify-start text-[11px] leading-relaxed text-basalt-muted-foreground">
                  默认采用各类代表产品。基准收益率从与研究基金共同的起始日计算。
                </LayerCard.Footer>
              </LayerCard>
            </div>
          </TabsContent>
          <TabsContent value="data">
            <DataOverview />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
