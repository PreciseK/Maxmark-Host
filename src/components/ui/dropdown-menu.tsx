import React, { useState, useRef, useEffect } from 'react'
import { MoreVertical } from 'lucide-react'

export interface DropdownMenuItem {
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  href?: string
}

interface DropdownMenuProps {
  items: DropdownMenuItem[]
  align?: 'left' | 'right'
  triggerIcon?: React.ReactNode
}

export function ActionDropdown({ items, align = 'right', triggerIcon }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        className="p-1.5 rounded-md hover:bg-[#232328] text-muted-foreground hover:text-white transition focus:outline-none select-none"
        title="Options menu"
      >
        {triggerIcon || <MoreVertical className="h-4 w-4" />}
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-1 w-48 rounded-lg bg-[#1a1a1e] border border-[#2d2d34] shadow-xl py-1 z-50 text-xs animate-in fade-in-80 duration-100 select-none`}
        >
          {items.map((item, idx) => {
            const content = (
              <>
                {item.icon && <span className="shrink-0">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </>
            )

            const className = `flex items-center gap-2.5 px-3 py-2 text-left w-full transition ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                : 'text-muted-foreground hover:bg-[#232328] hover:text-white'
            } ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`

            if (item.href) {
              return (
                <a
                  key={idx}
                  href={item.href}
                  className={className}
                  onClick={() => setIsOpen(false)}
                >
                  {content}
                </a>
              )
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.disabled) return
                  setIsOpen(false)
                  item.onClick?.()
                }}
                className={className}
              >
                {content}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
