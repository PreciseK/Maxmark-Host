interface SettingToggleProps {
  /** Null while the setting row is still loading or absent. */
  enabled: boolean | null | undefined
  label: string
  size?: 'sm' | 'md'
}

/**
 * Read-only reflection of a boolean column on site_settings. Writing these
 * back is not wired yet, so the control renders disabled rather than
 * pretending a click took effect.
 */
export function SettingToggle({ enabled, label, size = 'md' }: SettingToggleProps) {
  const on = enabled === true
  const track = size === 'md' ? 'w-10 h-6 px-1' : 'w-8 h-5 px-0.5'
  const knob = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'
  const shift = size === 'md' ? 'translate-x-4' : 'translate-x-3.5'

  return (
    <button
      aria-label={label}
      aria-pressed={on}
      className={`${track} rounded-full relative flex items-center transition disabled:cursor-not-allowed ${
        on ? 'bg-[#5c4df0]' : 'bg-[#2d2d34]'
      }`}
      disabled
      type="button"
    >
      <span
        className={`${knob} bg-white rounded-full transition-transform duration-200 ${
          on ? shift : 'translate-x-0'
        }`}
      ></span>
    </button>
  )
}
