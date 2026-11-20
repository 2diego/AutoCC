import { type FormEvent, useEffect, useState } from 'react'
import {
  downloadBase64File,
  facturasSamsengRequest,
} from '../../api/rendicionCcApi'
import type { ErpSource, FacturasSamsengResponse } from '../../api/types'
import { Modal } from '../../components/ui/Modal'
import { useAuth } from '../../context/useAuth'

type RendicionCcSheetProps = {
  open: boolean
  onClose: () => void
}

type RendicionSheetStep = 'menu' | 'facturas-samseng'

const MODAL_TITLE: Record<RendicionSheetStep, string> = {
  menu: 'Rendición CC',
  'facturas-samseng': 'Rendición facturas samseng',
}

const MODAL_FOOTER: Record<RendicionSheetStep, string> = {
  menu: 'Operaciones de rendición de cuenta corriente. Más opciones se irán sumando.',
  'facturas-samseng':
    'Archivos CSV: casa central + planilla facturas. El resultado se descarga en Excel (.xlsx).',
}

export function RendicionCcSheet({ open, onClose }: RendicionCcSheetProps) {
  const { token, logout } = useAuth()
  const [step, setStep] = useState<RendicionSheetStep>('menu')
  const [erpSource, setErpSource] = useState<ErpSource>('CEOS')
  const [casaCentralFile, setCasaCentralFile] = useState<File | null>(null)
  const [planillaFacturasFile, setPlanillaFacturasFile] = useState<File | null>(
    null,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<FacturasSamsengResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setStep('menu')
      setError('')
      setResult(null)
    }
  }, [open])

  const resetOperationResults = () => {
    setResult(null)
    setError('')
  }

  const handleSessionError = (message: string) => {
    if (message.toLowerCase().includes('sesión')) {
      logout()
    }
  }

  const onSubmitFacturasSamseng = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!token || !casaCentralFile || !planillaFacturasFile) {
      setError('Seleccioná ambos archivos CSV.')
      return
    }
    setIsSubmitting(true)
    setError('')
    setResult(null)
    try {
      const data = await facturasSamsengRequest(
        token,
        erpSource,
        casaCentralFile,
        planillaFacturasFile,
      )
      setResult(data)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Error en la rendición de facturas Samseng',
      )
      handleSessionError(e instanceof Error ? e.message : '')
    } finally {
      setIsSubmitting(false)
    }
  }

  const downloadResultFile = () => {
    if (!result) return
    downloadBase64File(result.fileBase64, result.fileName, result.mimeType)
  }

  return (
    <Modal
      open={open}
      title={MODAL_TITLE[step]}
      onClose={onClose}
      size="wide"
      closeOnEscape
      footer={
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
          {MODAL_FOOTER[step]}
        </p>
      }
    >
      {step === 'menu' ? (
        <div
          className="documentHub"
          role="navigation"
          aria-label="Acciones de rendición CC"
        >
          <button
            type="button"
            className="documentHubCard"
            onClick={() => setStep('facturas-samseng')}
          >
            <p className="documentHubCardTitle">Rendición facturas samseng</p>
            <p className="documentHubCardDesc">
              Casa central + planilla facturas (CSV). TOTVS (FC) o CEOS (NV):
              recibos en observaciones y colores I/J/K. Descarga en Excel.
            </p>
          </button>
        </div>
      ) : null}

      {step !== 'menu' ? (
        <div className="sheetBackRow">
          <button
            type="button"
            className="btn btnSecondary"
            onClick={() => {
              setStep('menu')
              setError('')
              resetOperationResults()
            }}
          >
            ← Volver al menú
          </button>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      {step === 'facturas-samseng' ? (
        <>
          <section className="surfaceSection">
            <h3 className="sectionTitle">Cargar archivos</h3>
            <p className="muted sectionHint">
              {erpSource === 'CEOS'
                ? 'CEOS (NV): cruza nrofac (col. E) del base con el comprobante de la planilla (col. B, sin prefijo F/D). Completa observaciones (H). Colores: I pago, J amarillo (fecha factura ≤ 5 días) y K naranja si no aplica.'
                : 'TOTVS (FC): cruza comprobantes (col. B). Completa observaciones (H). Colores: I pago, J amarillo (< 30 días desde col. C) y K naranja si no aplica.'}
            </p>
            <form className="formGrid" onSubmit={onSubmitFacturasSamseng}>
              <label className="fieldLabel">
                ERP
                <select
                  className="select"
                  value={erpSource}
                  onChange={(e) => {
                    setErpSource(e.target.value as ErpSource)
                    resetOperationResults()
                  }}
                >
                  <option value="CEOS">CEOS</option>
                  <option value="TOTVS">TOTVS</option>
                </select>
              </label>
              <label className="fieldLabel">
                Archivo casa central (.csv)
                <input
                  className="input"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    setCasaCentralFile(e.target.files?.[0] ?? null)
                    resetOperationResults()
                  }}
                  required
                />
              </label>
              <label className="fieldLabel">
                Planilla facturas (.csv)
                <input
                  className="input"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    setPlanillaFacturasFile(e.target.files?.[0] ?? null)
                    resetOperationResults()
                  }}
                  required
                />
              </label>
              <button
                type="submit"
                className="btn"
                disabled={!token || isSubmitting}
              >
                {isSubmitting ? 'Procesando…' : 'Ejecutar rendición'}
              </button>
            </form>
          </section>

          {result ? (
            <>
              <section className="surfaceSection">
                <h3 className="sectionTitle">Resultado rendición</h3>
                <p className="muted sectionHint">
                  ERP aplicado: <strong>{result.erpSource}</strong>
                  {result.erpSource === 'CEOS' ? ' (planilla NV)' : ' (planilla FC)'}
                </p>
                <div className="statGrid">
                  <p className="statItem">
                    Casa central: {result.stats.baseDocs}
                  </p>
                  <p className="statItem">
                    Planilla facturas: {result.stats.facturasDocs}
                  </p>
                  <p className="statItem">
                    Coincidencias: {result.stats.matchedDocs}
                  </p>
                  <p className="statItem">
                    Filas actualizadas: {result.stats.updatedRows}
                  </p>
                </div>
                {result.stats.updatedRows === 0 ? (
                  <p className="error">
                    No se actualizó ninguna fila. Para CEOS usá la planilla NV
                    (columnas codcli/nrofac) + SAMSENG NV; para TOTVS la FC +
                    SAMSENG FACTURA.
                  </p>
                ) : null}
              </section>

              <section className="surfaceSection">
                <h3 className="sectionTitle">Descargar archivo</h3>
                <p className="muted sectionHint">
                  Planilla de casa central en Excel (.xlsx): recibos en
                  observaciones; I pago, J reciente (CEOS ≤ 5 días / TOTVS &lt;
                  30) y K naranja si no hubo azul/rojo/amarillo.
                </p>
                <div className="inlineActions">
                  <button
                    type="button"
                    className="btn"
                    onClick={downloadResultFile}
                  >
                    Descargar archivo base (.xlsx)
                  </button>
                </div>
              </section>

              <section className="surfaceSection">
                <details>
                  <summary className="sectionTitle">
                    Vista previa coincidencias
                  </summary>
                  <pre className="preJson">
                    {JSON.stringify(result.previewMatched, null, 2)}
                  </pre>
                </details>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </Modal>
  )
}
