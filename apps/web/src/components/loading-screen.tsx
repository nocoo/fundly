import { LoadingScreen as BasaltLoadingScreen } from '@nocoo/basalt/components/loading-screen';

export default function LoadingScreen({ label = '正在加载' }: { label?: string }) {
  return (
    <BasaltLoadingScreen
      label={label}
      mark={<img src="/logo.svg" alt="Fundly" width={40} height={40} className="h-10 w-10" />}
    />
  );
}
