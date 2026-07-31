interface NovaBotProps {
  active?: boolean
  compact?: boolean
  label?: string
}

export function NovaBot({ active = false, compact = false, label = 'NOVA 助手' }: NovaBotProps) {
  return (
    <span
      className={['nova-bot', active ? 'nova-bot--active' : '', compact ? 'nova-bot--compact' : '']
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label={label}
    >
      <span className="nova-bot__orb" aria-hidden="true">
        <span className="nova-bot__eyes">
          {[0, 1].map((eye) => (
            <i key={eye} className="nova-bot__eye" />
          ))}
        </span>
      </span>
      {active ? (
        <span className="nova-bot__ground-shadow" aria-hidden="true">
          <span className="nova-bot__ground-shadow-shape" />
        </span>
      ) : null}
    </span>
  )
}
