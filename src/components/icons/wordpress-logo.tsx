import type { SVGProps } from 'react'

export function WordPressLogo({ className = 'h-4 w-4', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.65 6.09l-3.37 8.91h-2.56l-2.73-7.55 1.54-4.25c2.47.45 4.38 2.37 4.56 2.89zM12 20c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.68-4.91l3.36 9.31c.97.22 1.99.34 3.04.34.82 0 1.61-.07 2.38-.21l-3.23 8.78c-3.15-.36-5.69-2.75-6.24-5.81l5.22-14.21C9.69 3.19 10.82 3 12 3c4.42 0 8 3.58 8 8 0 3.73-2.55 6.87-6 7.77l-2.07-5.64 4.5-12.26C18.66 5.86 20 8.78 20 12c0 4.42-3.58 8-8 8z" />
    </svg>
  )
}
