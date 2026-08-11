import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Elements an article may render. Anything outside this list degrades to its
 * text content via unwrapDisallowed.
 */
const ALLOWED = [
  'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em',
  'code', 'pre', 'blockquote', 'hr', 'br',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

/**
 * Renders an admin-authored markdown article.
 *
 * Safety here is structural rather than filtered: rehype-raw is deliberately
 * not installed, so raw HTML inside a body is rendered as inert text and a
 * stored <script> or <img onerror> cannot execute. react-markdown's default
 * urlTransform additionally strips javascript: and other unsafe protocols
 * from hrefs.
 */
export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4 text-sm leading-7 text-white/80">
      <Markdown
        allowedElements={ALLOWED}
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-bold text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold text-white pt-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold text-white pt-2">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-6">{children}</ol>,
          a: ({ children, href }) => (
            <a
              className="text-[#5c4df0] underline hover:text-[#796ef3]"
              href={href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[#121214] px-1.5 py-0.5 font-mono text-xs text-white">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg border border-[#232328] bg-[#121214] p-4 text-xs">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#5c4df0] pl-4 text-white/60">
              {children}
            </blockquote>
          ),
        }}
        remarkPlugins={[remarkGfm]}
        unwrapDisallowed
      >
        {markdown}
      </Markdown>
    </div>
  )
}
