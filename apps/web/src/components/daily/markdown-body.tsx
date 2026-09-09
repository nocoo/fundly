import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const components: Components = {
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
      {children}
    </a>
  ),
  table: ({ children, ...props }) => (
    <div className="daily-md-table-wrap">
      <table {...props}>{children}</table>
    </div>
  ),
};

export function MarkdownBody({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={cn('daily-md', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
