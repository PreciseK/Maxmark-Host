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
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm7.14 7.22l-3.32 8.84-2.22-5.91 1.76-4.68-4.22 11.23-1.61-4.28 2.06-5.48-1.55-4.12c2.72-.61 5.62-.2 7.73 1.74l.35.31zM6.91 7.22l2.36 6.27-2.61-6.94c-.45.21-.88.46-1.28.75L6.91 7.22zm-1.07 1.48l1.37 3.65-2.06 5.48c-1.32-1.78-1.84-4.04-1.37-6.22l2.06-2.91zm.74 7.42l2.22-5.91 1.76 4.68-3.98 1.23z" />
    </svg>
  )
}
