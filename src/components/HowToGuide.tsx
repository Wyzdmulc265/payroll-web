'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  ChevronDown,
  Download,
  Loader2,
  LockKeyhole,
  Printer,
} from 'lucide-react';
import { useCurrentUser } from '@/components/UserContext';
import { JumpToButton } from '@/components/JumpToButton';
import {
  getVisibleHowToItems,
  type HowToSectionId,
} from '@/lib/how-to-nav';

interface ParsedManual {
  introduction: string;
  sections: Array<{ title: string; body: string }>;
}

function textFromNode(children: ReactNode): string {
  return ReactNodeToString(children);
}

function ReactNodeToString(children: ReactNode): string {
  return ReactNodeToArray(children)
    .map((child) => (typeof child === 'string' ? child : ''))
    .join('');
}

function ReactNodeToArray(children: ReactNode): ReactNode[] {
  return Array.isArray(children)
    ? children.flatMap((child) => ReactNodeToArray(child))
    : children == null
      ? []
      : [children];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\d+(?:\.\d+)*\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function parseManual(markdown: string): ParsedManual {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const introduction: string[] = [];
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1].trim(), body: [] };
      continue;
    }

    if (current) {
      current.body.push(line);
    } else {
      introduction.push(line);
    }
  }

  if (current) sections.push(current);

  return {
    introduction: introduction.join('\n').trim(),
    sections: sections.map((section) => ({
      title: section.title,
      body: section.body.join('\n').trim(),
    })),
  };
}

function scrollToSection(id: HowToSectionId) {
  const element = document.getElementById(id);
  if (!element) return;

  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  element.focus({ preventScroll: true });
  const url = new URL(window.location.href);
  url.hash = id;
  window.history.replaceState(null, '', url.toString());
}

const markdownComponents = {
  a: ({ href, children, ...props }: { href?: string; children?: ReactNode; [key: string]: unknown }) => {
    if (href?.startsWith('#')) {
      return (
        <a
          {...props}
          href={href}
          onClick={(event) => {
            event.preventDefault();
            const element = document.getElementById(href.slice(1));
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
              element.focus({ preventScroll: true });
              const url = new URL(window.location.href);
              url.hash = href.slice(1);
              window.history.replaceState(null, '', url.toString());
            }
          }}
        >
          {children}
        </a>
      );
    }

    return <a {...props} href={href} target="_blank" rel="noreferrer" />;
  },
  h3: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <h3 {...props} id={slugify(textFromNode(children))} className="scroll-mt-28 text-lg font-semibold text-gray-900">
      {children}
    </h3>
  ),
  p: ({ ...props }: { [key: string]: unknown }) => <p {...props} className="text-sm leading-6 text-gray-700" />,
  ul: ({ ...props }: { [key: string]: unknown }) => <ul {...props} className="mt-3 space-y-2 text-sm text-gray-700" />,
  ol: ({ ...props }: { [key: string]: unknown }) => <ol {...props} className="mt-3 space-y-2 text-sm text-gray-700" />,
  li: ({ ...props }: { [key: string]: unknown }) => <li {...props} className="ml-5 list-disc" />,
  code: ({ className, ...props }: { className?: string; [key: string]: unknown }) =>
    className?.includes('language-') ? (
      <code {...props} className={`${className} block overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100`} />
    ) : (
      <code {...props} className="rounded bg-gray-100 px-1 py-0.5 text-sm text-gray-900" />
    ),
  pre: ({ ...props }: { [key: string]: unknown }) => <pre {...props} className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100" />,
  table: ({ ...props }: { [key: string]: unknown }) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
      <table {...props} className="min-w-full divide-y divide-gray-200" />
    </div>
  ),
  th: ({ ...props }: { [key: string]: unknown }) => <th {...props} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 bg-gray-50" />,
  td: ({ ...props }: { [key: string]: unknown }) => <td {...props} className="px-3 py-2 text-sm text-gray-700 border-t border-gray-200" />,
};

export function HowToGuide({
  markdown,
  embedded = false,
}: {
  markdown?: string;
  embedded?: boolean;
}) {
  const user = useCurrentUser();
  const [manualMarkdown, setManualMarkdown] = useState(markdown ?? '');
  const [manualLoading, setManualLoading] = useState(!markdown);
  const [manualError, setManualError] = useState<string | null>(null);
  const visibleItems = useMemo(() => getVisibleHowToItems(user?.role), [user?.role]);

  useEffect(() => {
    if (markdown) return;

    let active = true;
    fetch('/api/how-to-manual', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Unable to load the how-to manual');
        }
        return payload.data.markdown as string;
      })
      .then((content) => {
        if (!active) return;
        setManualMarkdown(content);
        setManualLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setManualError(error instanceof Error ? error.message : 'Unable to load the how-to manual');
        setManualLoading(false);
      });

    return () => {
      active = false;
    };
  }, [markdown]);

  useEffect(() => {
    if (manualLoading) return;

    const scrollToHash = () => {
      const id = window.location.hash.slice(1) as HowToSectionId;
      if (!id) return;
      requestAnimationFrame(() => scrollToSection(id));
    };

    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, [manualLoading, visibleItems]);

  const parsedManual = useMemo(() => parseManual(manualMarkdown), [manualMarkdown]);
  const sectionsByItem = useMemo(() => {
    const sections = new Map(
      parsedManual.sections.map((section) => [slugify(section.title), section]),
    );

    return visibleItems
      .map((item) => {
        const section = sections.get(item.id);
        return section ? { item, title: section.title, body: section.body } : null;
      })
      .filter((section): section is { item: typeof visibleItems[0]; title: string; body: string } => section !== null);
  }, [parsedManual.sections, visibleItems]);

  if (user === undefined || manualLoading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span>Loading guide...</span>
        </div>
      </div>
    );
  }

  if (!user || visibleItems.length === 0) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 text-center text-gray-500">
        <LockKeyhole className="h-8 w-8 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">Guide not available</h2>
        <p className="max-w-md text-sm">Your current role does not have access to the how-to manual.</p>
      </div>
    );
  }

  if (manualError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
        {manualError}
      </div>
    );
  }

  const handleJumpToSection = (item: { id: HowToSectionId }) => {
    scrollToSection(item.id);
  };

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="font-medium text-gray-900">Know Your App</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Know Your App</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
          Step-by-step guidance for the areas available to your role. Expand a section to view instructions, or use Jump To to move directly to a topic.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className="btn-secondary print:hidden">
          <Printer className="h-4 w-4" />
          Print / Save PDF
        </button>
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([manualMarkdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'how-to-manual.md';
            link.click();
            URL.revokeObjectURL(url);
          }}
          className="btn-secondary print:hidden"
          aria-describedby="manual-download-description"
        >
          <Download className="h-4 w-4" />
          Download Manual
        </button>
        <span id="manual-download-description" className="sr-only">Download the how-to manual as a Markdown file.</span>
        <JumpToButton onSelect={handleJumpToSection} />
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-5">
        {header}
        {parsedManual.introduction && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as unknown as Components}>
              {parsedManual.introduction}
            </ReactMarkdown>
          </div>
        )}
        <div className="space-y-4">
          {sectionsByItem.map((section) => (
            <details key={section.item.id} id={section.item.id} open className="scroll-mt-28 rounded-xl border border-gray-200 bg-white outline-none">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-left font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span>{section.title}</span>
                <ChevronDown className="how-to-chevron h-5 w-5 shrink-0 text-gray-500 transition-transform" />
              </summary>
              <div className="border-t border-gray-200 px-4 py-4">
                <h2 id={`${section.item.id}-heading`} tabIndex={-1} className="sr-only">
                  {section.title}
                </h2>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as unknown as Components}>
                  {section.body}
                </ReactMarkdown>
              </div>
            </details>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm text-gray-500">WizTech Payroll / Know Your App</p>
              <h1 className="text-xl font-bold text-gray-900">Know Your App</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="btn-secondary print:hidden">
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([manualMarkdown], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'how-to-manual.md';
                link.click();
                URL.revokeObjectURL(url);
              }}
              className="btn-secondary print:hidden"
            >
              <Download className="h-4 w-4" />
              Download Manual
            </button>
            <JumpToButton onSelect={({ id }) => scrollToSection(id)} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {parsedManual.introduction && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as unknown as Components}>
              {parsedManual.introduction}
            </ReactMarkdown>
          </div>
        )}
        <div className="space-y-4 print:space-y-2">
          {sectionsByItem.map((section) => (
            <details key={section.item.id} id={section.item.id} open className="scroll-mt-24 rounded-xl border border-gray-200 bg-white outline-none print:break-inside-avoid">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-left font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary print:pointer-events-none">
                <span>{section.title}</span>
                <ChevronDown className="how-to-chevron h-5 w-5 shrink-0 text-gray-500 transition-transform print:hidden" />
              </summary>
              <div className="border-t border-gray-200 px-4 py-4 print:px-0">
                <h2 id={`${section.item.id}-heading`} tabIndex={-1} className="sr-only">
                  {section.title}
                </h2>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as unknown as Components}>
                  {section.body}
                </ReactMarkdown>
              </div>
            </details>
          ))}
        </div>
      </main>
    </div>
  );
}