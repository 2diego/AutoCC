import { type FormEvent, useState } from 'react'
import {
  downloadBackupExcel,
  downloadCurrentExcel,
  runConsolidationRequest,
} from '../../api/consolidationApi'
import type { ConsolidationResponse, ErpSource } from '../../api/types'
import { Modal } from '../../components/ui/Modal'
import { useAuth } from '../../context/useAuth'

type ConsolidationSheetProps = {
  open: boolean
  onClose: () => void
}

export function ConsolidationSheet({ open, onClose }: ConsolidationSheetProps) {
  const { token, logout } = useAuth()
  const [erpSource, setErpSource] = useState<ErpSource>('CEOS')
  const [downloadErpSource, setDownloadErpSource] = useState<ErpSource>('CEOS')
  const [baseFile, setBaseFile] = useState<File | null>(null)
  const [erpFile, setErpFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<ConsolidationResponse | null>(null)
  const [error, setError] = useState('')

  const resetState = () => {
    setResult(null)
    setError('')
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token || !baseFile || !erpFile) {
      setError('Seleccioná ambos archivos CSV.')
      return
    }
    setIsSubmitting(true)
    setError('')
    setResult(null)
    try {
      const data = await runConsolidationRequest(
        token,
        erpSource,
        baseFile,
        erpFile,
      )
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de consolidación')
    } finally {
      setIsSubmitting(false)
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const onDownloadCurrent = async () => {
    if (!token) return
    setError('')
    try {
      const blob = await downloadCurrentExcel(token, downloadErpSource)
      downloadBlob(blob, `${downloadErpSource.toLowerCase()}-current.xlsx`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error descargando Excel'
      setError(message)
      if (message.toLowerCase().includes('sesión')) {
        logout()
      }
    }
  }

  const onDownloadBackup = async () => {
    if (!token) return
    setError('')
    try {
      const blob = await downloadBackupExcel(token, downloadErpSource)
      downloadBlob(blob, `${downloadErpSource.toLowerCase()}-backup.xlsx`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error descargando backup'
      setError(message)
      if (message.toLowerCase().includes('sesión')) {
        logout()
      }
    }
  }

  return (
    <Modal
      open={open}
      title="Consolidación"
      onClose={onClose}
      size="wide"
      footer={
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
          Los archivos deben ser CSV (base + listado ERP). Tras consolidar,
          podés descargar el Excel actual y el backup anterior.
        </p>
      }
    >
      <section className="surfaceSection">
        <h3 className="sectionTitle">Ejecutar consolidación</h3>
        <p className="muted sectionHint">
          Cargá base + ERP y ejecutá la actualización del snapshot actual.
        </p>
        <form className="formGrid" onSubmit={onSubmit}>
          <label className="fieldLabel">
            ERP
            <select
              className="select"
              value={erpSource}
              onChange={(e) => {
                setErpSource(e.target.value as ErpSource)
                resetState()
              }}
            >
              <option value="CEOS">CEOS</option>
              <option value="TOTVS">TOTVS</option>
            </select>
          </label>
          <label className="fieldLabel">
            Archivo base (.csv)
            <input
              className="input"
              type="file"
              accept=".csv"
              onChange={(e) => {
                setBaseFile(e.target.files?.[0] ?? null)
                resetState()
              }}
              required
            />
          </label>
          <label className="fieldLabel">
            Archivo ERP (.csv)
            <input
              className="input"
              type="file"
              accept=".csv"
              onChange={(e) => {
                setErpFile(e.target.files?.[0] ?? null)
                resetState()
              }}
              required
            />
          </label>
          <button
            type="submit"
            className="btn"
            disabled={!token || isSubmitting}
          >
            {isSubmitting ? 'Consolidando…' : 'Ejecutar consolidación'}
          </button>
        </form>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="surfaceSection">
        <h3 className="sectionTitle">Descargas</h3>
        <p className="muted sectionHint">
          Elegí ERP y descargá versión actual o su backup más reciente.
        </p>
        <label className="fieldLabel sectionHint">
          ERP para descarga
          <select
            className="select"
            value={downloadErpSource}
            onChange={(e) => setDownloadErpSource(e.target.value as ErpSource)}
          >
            <option value="CEOS">CEOS</option>
            <option value="TOTVS">TOTVS</option>
          </select>
        </label>

        <div className="inlineActions">
          <button type="button" className="btn" onClick={onDownloadCurrent}>
            Descargar Excel actual
          </button>
          <button
            type="button"
            className="btn btnSecondary"
            onClick={onDownloadBackup}
          >
            Descargar backup
          </button>
        </div>
      </section>

      {result ? (
        <>
          <section className="surfaceSection">
            <h3 className="sectionTitle">Estadísticas</h3>
            <div className="statGrid">
              <p className="statItem">Base: {result.stats.baseDocs}</p>
              <p className="statItem">ERP: {result.stats.erpDocs}</p>
              <p className="statItem">Mantenidos: {result.stats.keptDocs}</p>
              <p className="statItem">Agregados: {result.stats.addedDocs}</p>
              <p className="statItem">Errores: {result.stats.errors}</p>
            </div>
          </section>

          <section className="surfaceSection">
            <h3 className="sectionTitle">Vista previa (documentos agregados)</h3>
            <pre className="preJson">
              {JSON.stringify(result.previewAdded, null, 2)}
            </pre>
          </section>

          <section className="surfaceSection">
            <h3 className="sectionTitle">Vista previa (current, primeros)</h3>
            <pre className="preJson">
              {JSON.stringify(result.previewCurrent, null, 2)}
            </pre>
          </section>

          {result.previewErrors && result.previewErrors.length > 0 ? (
            <section className="surfaceSection">
              <h3 className="sectionTitle">Errores de parseo (muestra)</h3>
              <pre className="preJson">
                {JSON.stringify(result.previewErrors, null, 2)}
              </pre>
            </section>
          ) : null}

        </>
      ) : null}
    </Modal>
  )
}
