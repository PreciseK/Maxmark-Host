import React from 'react'

export function ArticleBody({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')
  const elements: React.ReactNode[] = []

  let inList = false
  let listItems: React.ReactNode[] = []

  const renderInline = (text: string): React.ReactNode => {
    // Basic link parsing [label](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index))
      }
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#5c4df0] underline hover:text-[#796ef3]"
        >
          {match[1]}
        </a>
      )
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex))
    }

    return parts.length > 0 ? parts : text
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim()

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true
      listItems.push(<li key={`li-${idx}`}>{renderInline(trimmed.substring(2))}</li>)
      return
    }

    if (inList) {
      elements.push(
        <ul key={`ul-${idx}`} className="list-disc space-y-1 pl-6 my-2">
          {listItems}
        </ul>
      )
      inList = false
      listItems = []
    }

    if (trimmed.startsWith('# ')) {
      elements.push(<h1 key={idx} className="text-2xl font-bold text-white mt-4 mb-2">{renderInline(trimmed.substring(2))}</h1>)
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h2 key={idx} className="text-xl font-semibold text-white mt-4 mb-2">{renderInline(trimmed.substring(3))}</h2>)
    } else if (trimmed.startsWith('### ')) {
      elements.push(<h3 key={idx} className="text-base font-semibold text-white mt-3 mb-1">{renderInline(trimmed.substring(4))}</h3>)
    } else if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote key={idx} className="border-l-2 border-[#5c4df0] pl-4 my-2 text-white/60">
          {renderInline(trimmed.substring(2))}
        </blockquote>
      )
    } else if (trimmed.startsWith('```')) {
      elements.push(
        <pre key={idx} className="overflow-x-auto rounded-lg border border-[#232328] bg-[#121214] p-4 text-xs my-2">
          {trimmed.replace(/```/g, '')}
        </pre>
      )
    } else if (trimmed !== '') {
      elements.push(<p key={idx} className="my-2">{renderInline(line)}</p>)
    }
  })

  if (inList) {
    elements.push(
      <ul key="ul-final" className="list-disc space-y-1 pl-6 my-2">
        {listItems}
      </ul>
    )
  }

  return <div className="space-y-2 text-sm leading-7 text-white/80">{elements}</div>
}
