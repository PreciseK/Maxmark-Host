import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'

export function SslPage() {
  return (
    <div className="space-y-6 text-left">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-white">SSL Certificates</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Certificates</h1>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white">
          Add Certificate
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Dotted Empty State Container */}
      <div className="border border-dashed border-[#232328] bg-[#161619] rounded-lg p-16 flex flex-col items-center justify-center text-center space-y-6">
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">No certificates found</h3>
          <p className="text-muted-foreground text-xs leading-relaxed max-w-sm">
            Looks like you haven't added any certificates yet
          </p>
        </div>

        <div className="space-y-4">
          <button className="px-5 py-2.5 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] font-semibold text-white transition text-xs">
            Order Certificate
          </button>
          
          <div className="text-[11px] text-muted-foreground">
            Have an existing certificate?{' '}
            <span className="text-[#5c4df0] hover:underline cursor-pointer">
              Import it now
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
