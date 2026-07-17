import './TabItem.less'

interface TabItemProps {
  path: string
  title: string
  active: boolean
  isLast: boolean
  onClick: (path: string) => void
  onClose: (path: string) => void
}

export default function TabItem({ title, path, active, onClose, onClick, isLast }: TabItemProps) {
  return (
    <div className={`tab-item${active ? ' tab-item--active' : ''}`} data-path={path}>
      <button className="tab-item__title" onClick={() => onClick(path)}>
        {title}
      </button>
      <button
        className="tab-item__close"
        aria-label={`关闭 ${title}`}
        disabled={isLast}
        onClick={(e) => {
          e.stopPropagation()
          if (!isLast) onClose(path)
        }}
      >
        ×
      </button>
    </div>
  )
}
