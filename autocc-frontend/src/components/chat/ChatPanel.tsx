import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './ChatPanel.module.css'
import { useAuth } from '../../context/useAuth'
import {
  fetchBotDeudasSinObservaciones,
  fetchBotPendientes,
  patchDocumentObservaciones,
} from '../../api/currentBotApi'
import type {
  BotCurrentDocument,
  BotDeudasClienteGroup,
  ErpSource,
} from '../../api/types'

type ChatMsg = { role: 'bot' | 'user'; text: string }

type Step =
  | 'menu'
  | 'pend_filter'
  | 'pend_pick_client'
  | 'pend_pick'
  | 'pend_obs'
  | 'debt_dias'
  | 'debt_doc'

const MENU_RESET_HINT =
  'Volviste al menú. Elegí otra opción con los botones de arriba o escribí 1–4.'

/** Encabezado cliente/tienda con nombre y localidad si el backend los envía (p. ej. CEOS desde listado ERP). */
function formatClienteHeader(g: {
  nombreCliente: string
  localidad?: string
  clienteId: string
  tienda: string
}): string {
  const name = (g.nombreCliente ?? '').trim()
  const loc = (g.localidad ?? '').trim()
  const idPart = `(${g.clienteId} / ${g.tienda})`
  if (name && loc) return `${name} · ${loc}\n${idPart}`
  if (name) return `${name}\n${idPart}`
  if (loc) return `${loc}\n${idPart}`
  return `Sin datos de razón social en archivo\n${idPart}`
}

/** Una sola línea para mensajes compactos (nombre · localidad o código). */
function formatClienteOneLine(g: {
  nombreCliente: string
  localidad?: string
  clienteId: string
  tienda: string
}): string {
  const parts = [g.nombreCliente?.trim(), g.localidad?.trim()].filter(Boolean)
  if (parts.length > 0) return parts.join(' · ')
  return `(${g.clienteId} / ${g.tienda})`
}

function formatDocLine(d: BotCurrentDocument, i: number): string {
  const fecha = formatDateForChat(d.fechaDoc)
  const saldo = d.saldo ?? 'Error al recuperar saldo.'

  const tipoNorm =
    d.tipoDocumento === 'NF' || d.tipoDocumento === 'F'
      ? 'FC'
      : d.tipoDocumento

  //Normalizar numero de documento a punto de venta-numero de documento
  function normalizarNumeroDocumento(valor: string): string {
    if (!valor) return "";
  
    const partes = valor.split("-");
  
    if (partes.length < 2) return valor;
  
    // Nos aseguramos de que solo queden números
    return partes[1].replace(/\D/g, "");
  }

  //Normalizar saldo a "." para miles y "," para decimales
  function normalizarSaldo(valor: string | number): string {
    if (valor === null || valor === undefined) return "Error al normalizar saldo.";
  
    let limpio = String(valor)
      .replace(/\s/g, "")
      .replace(/\$/g, "");
  
    // Detectar formato
    const tieneComa = limpio.includes(",");
    const tienePunto = limpio.includes(".");
  
    if (tieneComa && tienePunto) {
      // Caso: 1.234.567,89 → formato europeo
      limpio = limpio.replace(/\./g, "").replace(",", ".");
    } else if (tieneComa && !tienePunto) {
      // Caso: 1234567,89
      limpio = limpio.replace(",", ".");
    }
    // Si solo tiene punto → ya está en formato tipo 1234567.89
  
    const numero = parseFloat(limpio);
  
    if (isNaN(numero)) return "0,00";
  
    // Formatear a estilo argentino/español
    return new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numero);
  }

  const locExtra = d.localidad?.trim() ? ` · ${d.localidad.trim()}` : ''
  return `${i + 1}. ${tipoNorm}-${normalizarNumeroDocumento(d.numeroDocumento)} | ${fecha} | Saldo $${normalizarSaldo(saldo)} | Atraso ~${d.atrasoDiasCalculado} días${locExtra}`
}

function formatDateForChat(isoDate: string | null): string {
  if (!isoDate) return '—'
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return isoDate
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Teclado virtual: números en pasos cortos; texto cuando hace falta nombre u observación. */
function composerInputMode(step: Step): 'text' | 'numeric' {
  if (
    step === 'menu' ||
    step === 'pend_pick_client' ||
    step === 'pend_pick' ||
    step === 'debt_dias'
  ) {
    return 'numeric'
  }
  return 'text'
}

function composerRows(step: Step): number {
  if (step === 'pend_obs' || step === 'debt_doc') return 3
  return 2
}

export function ChatPanel({ userName }: { userName: string }) {
  const { token, user } = useAuth()
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      role: 'bot',
      text: `Hola, ${userName}. Elegí una tarea con los botones de arriba o escribí 1–4 abajo. En cualquier momento podés escribir 0 para volver al menú.`,
    },
  ])
  const [step, setStep] = useState<Step>('menu')
  const [pendErp, setPendErp] = useState<ErpSource>('TOTVS')
  const [pendDocs, setPendDocs] = useState<BotCurrentDocument[]>([])
  const [pendClientDocs, setPendClientDocs] = useState<BotCurrentDocument[][]>([])
  const [pendPickDoc, setPendPickDoc] = useState<BotCurrentDocument | null>(
    null,
  )
  const [debtErp, setDebtErp] = useState<ErpSource>('TOTVS')
  const [debtGroups, setDebtGroups] = useState<BotDeudasClienteGroup[]>([])
  const [debtGi, setDebtGi] = useState(0)
  const [debtDi, setDebtDi] = useState(0)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const pushBot = useCallback((text: string) => {
    setMessages((m) => [...m, { role: 'bot', text }])
  }, [])

  const pushUser = useCallback((text: string) => {
    setMessages((m) => [...m, { role: 'user', text }])
  }, [])

  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter') return
      if (e.shiftKey) return
      if (busy) return
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    },
    [busy],
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, step])

  const resetMenu = useCallback(() => {
    setStep('menu')
    setPendDocs([])
    setPendClientDocs([])
    setPendPickDoc(null)
    setDebtGroups([])
    setDebtGi(0)
    setDebtDi(0)
    pushBot(MENU_RESET_HINT)
  }, [pushBot])

  const runPendFetch = async (erp: ErpSource, raw: string) => {
    if (!token) {
      pushBot('No hay sesión. Volvé a iniciar sesión.')
      return
    }
    const t = raw.trim()
    if (!t) {
      pushBot(
        'Tenés que ingresar el código de cliente o parte del nombre; no se admite búsqueda vacía.',
      )
      return
    }
    const isId = /^\d+$/.test(t)
    setBusy(true)
    try {
      const list = await fetchBotPendientes(token, erp, {
        clienteId: isId && t ? t : undefined,
        q: !isId && t ? t : undefined,
      })
      setPendErp(erp)
      if (list.length === 0) {
        pushBot(
          'No hay comprobantes pendientes con esos criterios (solo facturas/ND con saldo pendiente).',
        )
        setStep('menu')
        return
      }
      const head =
        erp === 'TOTVS'
          ? 'Facturas / ND TOTVS pendientes:'
          : 'Documentos CEOS (cuenta remito) pendientes:'
      const groupsMap = new Map<string, BotCurrentDocument[]>()
      for (const doc of list) {
        const key = `${doc.clienteId}|${doc.tienda}`
        const arr = groupsMap.get(key) ?? []
        arr.push(doc)
        groupsMap.set(key, arr)
      }
      const groups = [...groupsMap.values()]
      if (groups.length > 1) {
        setPendClientDocs(groups)
        setStep('pend_pick_client')
        pushBot(
          `Se encontraron ${groups.length} coincidencias para "${t}". Confirmá cuál querés consultar:\n\n${groups
            .slice(0, 30)
            .map((docs, i) => {
              const first = docs[0]
              if (!first) return `${i + 1}. (sin datos)`
              return `${i + 1}. ${formatClienteOneLine(first)} — ${docs.length} documento(s) pendiente(s)`
            })
            .join('\n')}\n\nEscribí el número del ítem.`,
        )
        return
      }

      setPendDocs(list)
      setStep('pend_pick')
      pushBot(
        `${head}\n\n${list
          .slice(0, 80)
          .map((d, i) => formatDocLine(d, i))
          .join('\n')}${list.length > 80 ? `\n… y ${list.length - 80} más.` : ''}\n\nEscribí el número del ítem para cargar una observación.`,
      )
    } catch (e) {
      pushBot(e instanceof Error ? e.message : 'Error al consultar.')
      setStep('menu')
    } finally {
      setBusy(false)
    }
  }

  const applyPendObs = async (text: string) => {
    if (!token || !pendPickDoc) return
    setBusy(true)
    try {
      await patchDocumentObservaciones(
        token,
        pendErp,
        pendPickDoc.documentKey,
        text,
        user?.id,
      )
      pushBot('Observación guardada.')
    } catch (e) {
      pushBot(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setBusy(false)
      setPendPickDoc(null)
      setStep('menu')
    }
  }

  const applyDebtObs = async (text: string) => {
    if (!token) return
    const g = debtGroups[debtGi]
    const doc = g?.documentos[debtDi]
    if (!g || !doc) return
    setBusy(true)
    try {
      await patchDocumentObservaciones(
        token,
        debtErp,
        doc.documentKey,
        text,
        user?.id,
      )
      pushBot('Observación guardada.')
      const nextDi = debtDi + 1
      if (nextDi < g.documentos.length) {
        setDebtDi(nextDi)
        const next = g.documentos[nextDi]
        pushBot(
          `Siguiente documento (${nextDi + 1}/${g.documentos.length}) — ${formatClienteOneLine(g)}\n${formatDocLine(next, nextDi)}`,
        )
      } else {
        const nextGi = debtGi + 1
        if (nextGi < debtGroups.length) {
          setDebtGi(nextGi)
          setDebtDi(0)
          const ng = debtGroups[nextGi]
          const first = ng.documentos[0]
          pushBot(
            `Cliente siguiente (${nextGi + 1}/${debtGroups.length}):\n${formatClienteHeader(ng)}\n\n${formatDocLine(first, 0)}\n\nEscribí la observación para este documento.`,
          )
        } else {
          pushBot(
            'Listo: recorrimos todos los clientes con documentos que cumplían el criterio.',
          )
          setStep('menu')
          setDebtGroups([])
        }
      }
    } catch (e) {
      pushBot(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const raw = input.trim()
    setInput('')
    if (!raw) {
      if (step === 'pend_filter') {
        pushBot(
          'Ingresá el código de cliente o parte del nombre y tocá Enviar (no podés listar todos sin filtro).',
        )
      }
      return
    }
    pushUser(raw)

    if (raw === '0') {
      resetMenu()
      return
    }

    if (step === 'menu') {
      if (raw === '1') {
        setStep('pend_filter')
        setPendErp('TOTVS')
        pushBot(
          'Opción 1 — TOTVS. Escribí el código de cliente (solo números) o parte del nombre.',
        )
        return
      }
      if (raw === '2') {
        setStep('pend_filter')
        setPendErp('CEOS')
        pushBot(
          'Opción 2 — CEOS (cuenta remito). Escribí el código de cliente o parte del nombre.',
        )
        return
      }
      if (raw === '3') {
        setDebtErp('TOTVS')
        setStep('debt_dias')
        pushBot(
          'Listado de deudas TOTVS. ¿Cuántos días de atraso mínimo? (entero ≥ 0; se calcula desde la fecha del documento hasta hoy.)',
        )
        return
      }
      if (raw === '4') {
        setDebtErp('CEOS')
        setStep('debt_dias')
        pushBot(
          'Listado de deudas CEOS. ¿Cuántos días de atraso mínimo? (entero ≥ 0.)',
        )
        return
      }
      pushBot('Opción no reconocida. Escribí 1, 2, 3 o 4, o 0 para el menú.')
      return
    }

    if (step === 'pend_filter') {
      await runPendFetch(pendErp, raw)
      return
    }

    if (step === 'pend_pick_client') {
      const n = Number.parseInt(raw, 10)
      if (!Number.isFinite(n) || n < 1 || n > pendClientDocs.length) {
        pushBot(`Número inválido. Escribí entre 1 y ${pendClientDocs.length}.`)
        return
      }
      const docs = pendClientDocs[n - 1] ?? []
      const first = docs[0]
      setPendDocs(docs)
      setStep('pend_pick')
      pushBot(
        `Cliente confirmado:\n${formatClienteHeader({
          nombreCliente: first?.nombreCliente ?? '',
          localidad: first?.localidad,
          clienteId: first?.clienteId ?? '',
          tienda: first?.tienda ?? '',
        })}\n\n${docs
          .slice(0, 80)
          .map((d, i) => formatDocLine(d, i))
          .join('\n')}\n\nEscribí el número del ítem para cargar una observación.`,
      )
      return
    }

    if (step === 'pend_pick') {
      const n = Number.parseInt(raw, 10)
      if (!Number.isFinite(n) || n < 1 || n > pendDocs.length) {
        pushBot(`Número inválido. Escribí entre 1 y ${pendDocs.length}.`)
        return
      }
      const doc = pendDocs[n - 1]
      setPendPickDoc(doc)
      setStep('pend_obs')
      pushBot(
        `Elegiste:\n${formatDocLine(doc, n - 1)}\n\nEscribí el texto de la observación (columna Observaciones en Excel).`,
      )
      return
    }

    if (step === 'pend_obs') {
      await applyPendObs(raw)
      return
    }

    if (step === 'debt_dias') {
      const d = Number.parseInt(raw, 10)
      if (!Number.isFinite(d) || d < 0) {
        pushBot('Ingresá un número entero ≥ 0.')
        return
      }
      if (!token) return
      setBusy(true)
      try {
        const { clientes } = await fetchBotDeudasSinObservaciones(
          token,
          debtErp,
          d,
        )
        if (clientes.length === 0) {
          pushBot(
            'No hay clientes con documentos que cumplan: pendiente, sin observación, atraso ≥ ' +
              d +
              ' días.',
          )
          setStep('menu')
          return
        }
        setDebtGroups(clientes)
        setDebtGi(0)
        setDebtDi(0)
        setStep('debt_doc')
        const g0 = clientes[0]
        const d0 = g0.documentos[0]
        pushBot(
          `Se encontraron ${clientes.length} cliente(s). Empezamos por:\n\n${formatClienteHeader(g0)}\n\n${formatDocLine(d0, 0)} (${1}/${g0.documentos.length} docs. de este cliente)\n\nEscribí la observación.`,
        )
      } catch (err) {
        pushBot(err instanceof Error ? err.message : 'Error.')
        setStep('menu')
      } finally {
        setBusy(false)
      }
      return
    }

    if (step === 'debt_doc') {
      await applyDebtObs(raw)
      return
    }
  }

  const goMenu1 = () => {
    if (busy || step !== 'menu') return
    pushUser('1')
    setStep('pend_filter')
    setPendErp('TOTVS')
    pushBot(
      'Opción 1 — TOTVS. Escribí el código de cliente (solo números) o parte del nombre.',
    )
  }
  const goMenu2 = () => {
    if (busy || step !== 'menu') return
    pushUser('2')
    setStep('pend_filter')
    setPendErp('CEOS')
    pushBot(
      'Opción 2 — CEOS (cuenta remito). Escribí el código de cliente o parte del nombre.',
    )
  }
  const goMenu3TotvsDeudas = () => {
    if (busy || step !== 'menu') return
    pushUser('Listado de deudas TOTVS')
    setDebtErp('TOTVS')
    setStep('debt_dias')
    pushBot(
      '¿Cuántos días de atraso mínimo? (entero ≥ 0; desde la fecha del documento hasta hoy.)',
    )
  }

  const goMenu4CeosDeudas = () => {
    if (busy || step !== 'menu') return
    pushUser('Listado de deudas CEOS')
    setDebtErp('CEOS')
    setStep('debt_dias')
    pushBot('¿Cuántos días de atraso mínimo? (entero ≥ 0.)')
  }

  return (
    <section className={styles.wrap} aria-label="Chatbot AutoCC">
      <div className={styles.hero}>
        <h1 className={styles.title}>Consultas de cuenta corriente</h1>
        {step === 'menu' ? (
          <div className={styles.quickActions} role="group" aria-label="Opciones principales">
            <button
              type="button"
              className={styles.quickAction}
              disabled={busy}
              onClick={goMenu1}
            >
              <span className={styles.qaMark} aria-hidden>
                1
              </span>
              <span className={styles.qaBody}>
                <span className={styles.qaTitle}>Facturas TOTVS pendientes por cliente</span>
              </span>
            </button>
            <button
              type="button"
              className={styles.quickAction}
              disabled={busy}
              onClick={goMenu2}
            >
              <span className={styles.qaMark} aria-hidden>
                2
              </span>
              <span className={styles.qaBody}>
                <span className={styles.qaTitle}>Remitos CEOS pendientes por cliente</span>
              </span>
            </button>
            <button
              type="button"
              className={styles.quickAction}
              disabled={busy}
              onClick={goMenu3TotvsDeudas}
            >
              <span className={styles.qaMark} aria-hidden>
                3
              </span>
              <span className={styles.qaBody}>
                <span className={styles.qaTitle}>Listado de deudas TOTVS</span>
              </span>
            </button>
            <button
              type="button"
              className={styles.quickAction}
              disabled={busy}
              onClick={goMenu4CeosDeudas}
            >
              <span className={styles.qaMark} aria-hidden>
                4
              </span>
              <span className={styles.qaBody}>
                <span className={styles.qaTitle}>Listado de deudas CEOS</span>
              </span>
            </button>
          </div>
        ) : null}
      </div>

      {step !== 'menu' ? (
        <div
          className={styles.exitFlowBar}
          aria-label="Volver al menú principal"
        >
          <p className={styles.flowHint}>
            Usá el botón o enviá{' '}
            <strong>0</strong> para volver al menú.
          </p>
          <button
            type="button"
            className={`btn btnSecondary ${styles.menuResetBtn}`}
            disabled={busy}
            onClick={resetMenu}
          >
            Menú (0)
          </button>
        </div>
      ) : null}

      <div
        className={styles.transcript}
        role="log"
        aria-live="polite"
        aria-busy={busy}
      >
        {messages.map((m, i) => (
          <article
            key={i}
            className={`${styles.message} ${
              m.role === 'bot' ? styles.messageBot : styles.messageUser
            }`}
          >
            <p className={styles.messageLabel}>
              {m.role === 'bot' ? 'AutoCC' : 'Vos'}
            </p>
            <pre className={styles.messagePre}>{m.text}</pre>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>

      {busy ? (
        <div className={styles.loadingBar} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden />
          Procesando…
        </div>
      ) : null}

      <form
        id="chat-composer-form"
        className={styles.composer}
        onSubmit={handleSubmit}
        aria-label="Entrada"
      >
        <div className={styles.composerRow}>
          <textarea
            id="chat-input"
            className={styles.textarea}
            name="chatMessage"
            rows={composerRows(step)}
            inputMode={composerInputMode(step)}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={step === 'pend_obs' || step === 'debt_doc'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            disabled={busy}
            placeholder={
              step === 'menu'
                ? 'Elige una opción para consultar (1 - 4):'
                : step === 'pend_obs' || step === 'debt_doc'
                  ? 'Observación… Enter envía, Shift+Enter nueva línea'
                  : 'Escribí y Enter para enviar…'
            }
          />
          <button
            type="submit"
            className={`btn ${styles.sendBtn}`}
            disabled={busy}
          >
            {busy ? (
              <>
                <span className={styles.spinnerLight} aria-hidden />
                Enviando…
              </>
            ) : (
              'Enviar'
            )}
          </button>
        </div>
      </form>
    </section>
  )
}
