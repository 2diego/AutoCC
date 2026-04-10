import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

type ModalProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Ancho máximo en desktop (default panel estrecho para formularios) */
  size?: 'default' | 'wide'
  /** Se muestra por encima de otro modal (p. ej. confirmación). */
  stack?: boolean
  /** Si es false, Escape no cierra (útil cuando hay modal apilado). */
  closeOnEscape?: boolean
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'default',
  stack = false,
  closeOnEscape = true,
}: ModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !closeOnEscape) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, closeOnEscape])

  if (!open) return null

  return createPortal(
    <div
      className={stack ? `${styles.backdrop} ${styles.backdropStack}` : styles.backdrop}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={
          size === 'wide' ? `${styles.panel} ${styles.panelWide}` : styles.panel
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
