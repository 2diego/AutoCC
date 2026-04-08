import styles from './ChatPanel.module.css'

type ChatPanelProps = {
  userName: string
}

export function ChatPanel({ userName }: ChatPanelProps) {
  return (
    <section className={styles.wrap} aria-label="Asistente">
      <div className={styles.hero}>
        <p className={styles.eyebrow}>Panel principal</p>
        <h1 className={styles.title}>Hola, {userName}</h1>
        <p className={styles.subtitle}>
          Consultá tus cuentas corrientes desde una experiencia guiada. El chat
          conversacional se habilitará en una próxima iteración.
        </p>
        <div className={styles.quickActions}>
          <button type="button" className={styles.quickAction} disabled>
            Resumen de atrasos
          </button>
          <button type="button" className={styles.quickAction} disabled>
            Estado por cliente
          </button>
          <button type="button" className={styles.quickAction} disabled>
            Última consolidación
          </button>
        </div>
      </div>

      <div className={styles.transcript} role="log" aria-live="polite">
        <div className={styles.emptyStateBadge} aria-hidden>
          <span>💬</span>
        </div>
        <article className={`${styles.message} ${styles.messageBot}`}>
          <p className={styles.messageLabel}>Asistente</p>
          <p className={styles.messageText}>
            Cuando el chat esté habilitado, vas a poder consultar por cliente,
            comprobante, atraso y estado de cobro usando lenguaje natural.
          </p>
        </article>
        <article className={`${styles.message} ${styles.messageUser}`}>
          <p className={styles.messageLabel}>Vos</p>
          <p className={styles.messageText}>Ejemplo: "Mostrame los vencidos de hoy".</p>
        </article>
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => e.preventDefault()}
        aria-label="Enviar mensaje"
      >
        <label className="fieldLabel" htmlFor="chat-input">
          Mensaje
        </label>
        <textarea
          id="chat-input"
          className={styles.textarea}
          rows={2}
          placeholder="Escribí tu consulta…"
          disabled
          readOnly
        />
        <div className={styles.composerActions}>
          <button type="button" className="btn" disabled>
            Enviar
          </button>
          <span className="muted">Disponible próximamente</span>
        </div>
      </form>
    </section>
  )
}
