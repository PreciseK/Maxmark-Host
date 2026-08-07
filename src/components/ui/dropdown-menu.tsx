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
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number; isUp?: boolean }>({ top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const isUp = spaceBelow < 220 && spaceAbove > spaceBelow

      setCoords({
        top: isUp ? rect.top - 8 : rect.bottom + 4,
        right: align === 'right' ? window.innerWidth - rect.right : undefined,
        left: align === 'left' ? rect.left : undefined,
        isUp,
      })
    }
    setIsOpen((prev) => !prev)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    function handleScroll() {
      if (isOpen) setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      window.addEventListener('scroll', handleScroll, true)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen])

  return (
    <div className="inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="p-1.5 rounded-md hover:bg-[#232328] text-muted-foreground hover:text-white transition focus:outline-none select-none"
        title="Options menu"
      >
        {triggerIcon || <MoreVertical className="h-4 w-4" />}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.isUp ? undefined : coords.top,
            bottom: coords.isUp ? window.innerHeight - coords.top : undefined,
            left: coords.left !== undefined ? `${coords.left}px` : undefined,
            right: coords.right !== undefined ? `${coords.right}px` : undefined,
            zIndex: 9999,
          }}
          className="w-48 rounded-lg bg-[#1a1a1e] border border-[#2d2d34] shadow-2xl py-1 text-xs animate-in fade-in-80 duration-100 select-none"
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
