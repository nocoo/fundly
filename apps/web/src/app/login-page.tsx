import { Button, LayerCard, ThemeToggle } from '@nocoo/basalt';
import { ChartCandlestick, Globe2, LockKeyhole, Search } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router';
import { Github } from '@/components/icons/github';
import LoadingScreen from '@/components/loading-screen';
import { useMe } from '@/hooks/use-me';
import { googleStartUrl, loginErrorMessage } from '@/lib/login-vm';

const APP_VERSION = '0.6.5';
const FEATURES = [
  { icon: Globe2, title: '市场全景', text: '沪深指数与跨资产环境，观察市场大势。' },
  { icon: ChartCandlestick, title: '行业观察', text: '从行业走势进入 ETF，沿真实 K 线深入。' },
  { icon: Search, title: '基金研究', text: '对比收益、风险与成本，了解每一只产品。' },
];

export default function LoginPage() {
  const [params] = useSearchParams();
  const { data: user, isLoading } = useMe();
  const error = loginErrorMessage(params.get('error'));
  const startUrl = googleStartUrl(params.get('from'));
  if (isLoading) return <LoadingScreen />;
  if (user?.authenticated) return <Navigate to="/" replace />;

  return (
    <div className="research-login">
      <header className="flex items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2.5 text-base font-semibold">
          <img src="/logo.svg" alt="" width={28} height={28} />
          Fundly
        </a>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <a
              href="https://github.com/nocoo/fundly"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
            >
              <Github className="size-[18px]" strokeWidth={1.5} />
            </a>
          </Button>
          <ThemeToggle aria-label="切换主题" />
        </div>
      </header>
      <main className="research-login-body">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-basalt-primary">
            FUNDLY · MARKET RESEARCH
          </p>
          <h1 className="mt-5 text-3xl font-semibold leading-snug tracking-tight sm:text-4xl">
            看清市场全景
            <br />
            深入基金细节
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-basalt-muted-foreground">
            将宏观行情、行业观察与基金研究放在一起，让每次分析都有完整的视野。
          </p>
          <div className="mt-8 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-basalt-primary/8 text-basalt-primary">
                  <Icon className="size-[18px]" strokeWidth={1.5} />
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-basalt-muted-foreground">
                    {text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          data-basalt-surface-root=""
          className="rounded-2xl bg-basalt-card p-2 ring-1 ring-basalt-border/65"
        >
          <LayerCard padding="none">
            <LayerCard.Body className="space-y-7 p-7 sm:p-8">
              <div>
                <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-basalt-primary/10 text-basalt-primary">
                  <LockKeyhole className="size-5" strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-semibold">登录研究工作台</h2>
                <p className="mt-2 text-xs leading-relaxed text-basalt-muted-foreground">
                  使用已授权的 Google 账号继续。
                </p>
              </div>
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-basalt-danger/10 p-3 text-xs leading-relaxed text-basalt-danger"
                >
                  {error}
                </p>
              ) : null}
              <Button variant="outline" asChild className="h-11 w-full gap-3">
                <a href={startUrl}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  使用 Google 登录
                </a>
              </Button>
              <p className="text-[11px] leading-relaxed text-basalt-muted-foreground">
                Fundly 为私人研究空间，仅对已授权的账号开放。
              </p>
            </LayerCard.Body>
            <LayerCard.Footer className="justify-between px-7 text-[11px] text-basalt-muted-foreground">
              <span>基金与宏观研究</span>
              <span className="font-mono">v{APP_VERSION}</span>
            </LayerCard.Footer>
          </LayerCard>
        </div>
      </main>
      <footer className="flex items-center justify-between gap-4 text-[11px] text-basalt-muted-foreground">
        <span>© {new Date().getFullYear()} Fundly</span>
        <span>市场 · 行业 · 基金</span>
      </footer>
    </div>
  );
}
