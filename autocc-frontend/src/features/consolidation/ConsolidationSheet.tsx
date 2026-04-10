import { type FormEvent, useEffect, useState } from 'react'
import {
  addDocumentsFromErpRequest,
  ConsolidationRequestError,
  downloadBackupExcel,
  downloadCurrentExcel,
  removeDocumentsFromErpRequest,
} from '../../api/consolidationApi'
import type {
  AddDocumentsFromErpResponse,
  ErpSource,
  RemoveDocumentsFromErpResponse,
} from '../../api/types'
import { Modal } from '../../components/ui/Modal'
import { useAuth } from '../../context/useAuth'

type ConsolidationSheetProps = {
  open: boolean
  onClose: () => void
}

type DocumentsSheetStep = 'menu' | 'add' | 'remove' | 'download'

const MODAL_TITLE: Record<DocumentsSheetStep, string> = {
  menu: 'Consolidar',
  add: 'Agregar documentos',
  remove: 'Eliminar documentos',
  download: 'Descargar documentos',
}

const MODAL_FOOTER: Record<DocumentsSheetStep, string> = {
  menu:
    'Elegí una opción: incorporar o eliminar documentos de la cuenta corriente, o descargar Excel.',
  add: 'Archivos CSV: cuenta corriente + archivo actualizado del ERP (CEOS o TOTVS).',
  remove:
    'Archivos CSV: cuenta corriente + archivo actualizado del ERP (CEOS o TOTVS).',
  download:
    'Elegí el ERP y descargá el Excel del snapshot actual o el backup del estado previo.',
}

export function ConsolidationSheet({ open, onClose }: ConsolidationSheetProps) {
  const { token, logout } = useAuth()
  const [step, setStep] = useState<DocumentsSheetStep>('menu')
  const [erpSource, setErpSource] = useState<ErpSource>('CEOS')
  const [downloadErpSource, setDownloadErpSource] = useState<ErpSource>('CEOS')
  const todayIso = () => new Date().toISOString().slice(0, 10)
  const [addBaseActualizacionDate, setAddBaseActualizacionDate] =
    useState(todayIso)
  const [addErpEmisionDate, setAddErpEmisionDate] = useState(todayIso)
  const [removeBaseActualizacionDate, setRemoveBaseActualizacionDate] =
    useState(todayIso)
  const [removeErpEmisionDate, setRemoveErpEmisionDate] = useState(todayIso)
  const [baseFile, setBaseFile] = useState<File | null>(null)
  const [erpFile, setErpFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<AddDocumentsFromErpResponse | null>(null)
  const [removeBaseFile, setRemoveBaseFile] = useState<File | null>(null)
  const [removeErpFile, setRemoveErpFile] = useState<File | null>(null)
  const [isRemoveSubmitting, setIsRemoveSubmitting] = useState(false)
  const [removeResult, setRemoveResult] =
    useState<RemoveDocumentsFromErpResponse | null>(null)
  const [error, setError] = useState('')
  const [excelDownloadKind, setExcelDownloadKind] = useState<
    null | 'current' | 'backup'
  >(null)

  useEffect(() => {
    if (open) {
      setStep('menu')
      setError('')
      setExcelDownloadKind(null)
      setResult(null)
      setRemoveResult(null)
    }
  }, [open])

  const resetOperationResults = () => {
    setResult(null)
    setRemoveResult(null)
    setError('')
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

  const handleSessionError = (message: string) => {
    if (message.toLowerCase().includes('sesión')) {
      logout()
    }
  }

  const downloadCurrent = async (source: ErpSource) => {
    if (!token) return
    setExcelDownloadKind('current')
    setError('')
    try {
      const blob = await downloadCurrentExcel(token, source)
      downloadBlob(blob, `${source.toLowerCase()}-current.xlsx`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error descargando Excel'
      setError(message)
      handleSessionError(message)
    } finally {
      setExcelDownloadKind(null)
    }
  }

  const downloadBackup = async (source: ErpSource) => {
    if (!token) return
    setExcelDownloadKind('backup')
    setError('')
    try {
      const blob = await downloadBackupExcel(token, source)
      downloadBlob(blob, `${source.toLowerCase()}-backup.xlsx`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error descargando backup'
      setError(message)
      handleSessionError(message)
    } finally {
      setExcelDownloadKind(null)
    }
  }

  const excelDownloadBusy = excelDownloadKind !== null

  const postOpDownloadSection = (source: ErpSource) => (
    <section className="surfaceSection">
      <h3 className="sectionTitle">Descargar Excel</h3>
      <p className="muted sectionHint">
        El snapshot en base ya quedó actualizado. Podés bajar el Excel del estado
        actual o el backup del conjunto anterior a esta operación.
      </p>
      <div className="inlineActions">
        <button
          type="button"
          className="btn"
          disabled={!token || excelDownloadBusy}
          onClick={() => void downloadCurrent(source)}
        >
          {excelDownloadKind === 'current'
            ? 'Descargando…'
            : 'Excel actual (.xlsx)'}
        </button>
        <button
          type="button"
          className="btn btnSecondary"
          disabled={!token || excelDownloadBusy}
          onClick={() => void downloadBackup(source)}
        >
          {excelDownloadKind === 'backup'
            ? 'Descargando…'
            : 'Backup anterior (.xlsx)'}
        </button>
      </div>
    </section>
  )

  const runAddDocuments = async (confirmFileDateMismatch: boolean) => {
    if (!token || !baseFile || !erpFile) return
    const data = await addDocumentsFromErpRequest(
      token,
      erpSource,
      addBaseActualizacionDate,
      addErpEmisionDate,
      baseFile,
      erpFile,
      confirmFileDateMismatch,
    )
    setResult(data)
  }

  const onSubmitAddDocumentsFromErp = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!token || !baseFile || !erpFile) {
      setError('Seleccioná ambos archivos CSV y las fechas.')
      return
    }
    setIsSubmitting(true)
    setError('')
    setResult(null)
    try {
      await runAddDocuments(false)
    } catch (e) {
      if (
        e instanceof ConsolidationRequestError &&
        e.payload?.code === 'ERP_FILE_DATE_MISMATCH'
      ) {
        const parsed = e.payload.parsedDateFromFile
        const user = e.payload.userDate
        const ok = window.confirm(
          `El archivo ERP declara fecha ${parsed ?? '(desconocida)'} y vos ingresaste ${user ?? addErpEmisionDate}. ¿Continuar de todos modos?`,
        )
        if (ok) {
          try {
            await runAddDocuments(true)
          } catch (e2) {
            setError(
              e2 instanceof Error
                ? e2.message
                : 'Error al agregar documentos desde el ERP',
            )
            handleSessionError(
              e2 instanceof Error ? e2.message : '',
            )
          }
        }
      } else {
        setError(
          e instanceof Error ? e.message : 'Error al agregar documentos desde el ERP',
        )
        handleSessionError(e instanceof Error ? e.message : '')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const runRemoveDocuments = async (confirmFileDateMismatch: boolean) => {
    if (!token || !removeBaseFile || !removeErpFile) return
    const data = await removeDocumentsFromErpRequest(
      token,
      erpSource,
      removeBaseActualizacionDate,
      removeErpEmisionDate,
      removeBaseFile,
      removeErpFile,
      confirmFileDateMismatch,
    )
    setRemoveResult(data)
  }

  const onSubmitRemoveDocumentsFromErp = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!token || !removeBaseFile || !removeErpFile) {
      setError('Seleccioná ambos archivos CSV y las fechas.')
      return
    }
    setIsRemoveSubmitting(true)
    setError('')
    setRemoveResult(null)
    try {
      await runRemoveDocuments(false)
    } catch (e) {
      if (
        e instanceof ConsolidationRequestError &&
        e.payload?.code === 'ERP_FILE_DATE_MISMATCH'
      ) {
        const parsed = e.payload.parsedDateFromFile
        const user = e.payload.userDate
        const ok = window.confirm(
          `El archivo ERP declara fecha ${parsed ?? '(desconocida)'} y vos ingresaste ${user ?? removeErpEmisionDate}. ¿Continuar de todos modos?`,
        )
        if (ok) {
          try {
            await runRemoveDocuments(true)
          } catch (e2) {
            setError(
              e2 instanceof Error
                ? e2.message
                : 'Error al eliminar documentos desde el ERP',
            )
            handleSessionError(
              e2 instanceof Error ? e2.message : '',
            )
          }
        }
      } else {
        setError(
          e instanceof Error
            ? e.message
            : 'Error al eliminar documentos desde el ERP',
        )
        handleSessionError(e instanceof Error ? e.message : '')
      }
    } finally {
      setIsRemoveSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={MODAL_TITLE[step]}
      onClose={onClose}
      size="wide"
      footer={
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
          {MODAL_FOOTER[step]}
        </p>
      }
    >
      {step === 'menu' ? (
        <div className="documentHub" role="navigation" aria-label="Acciones de consolidación">
          <button
            type="button"
            className="documentHubCard"
            onClick={() => setStep('add')}
          >
            <p className="documentHubCardTitle">Agregar documentos</p>
            <p className="documentHubCardDesc">
              Cuenta corriente + Archivo actualizado: incorporá documentos al snapshot de la cuenta corriente (CEOS o TOTVS).
            </p>
          </button>
          <button
            type="button"
            className="documentHubCard"
            onClick={() => setStep('remove')}
          >
            <p className="documentHubCardTitle">Eliminar documentos</p>
            <p className="documentHubCardDesc">
              Cuenta corriente + Archivo actualizado: quitá documentos del snapshot según fecha de corte y presencia (CEOS o TOTVS).
            </p>
          </button>
          <button
            type="button"
            className="documentHubCard"
            onClick={() => setStep('download')}
          >
            <p className="documentHubCardTitle">Descargar documentos</p>
            <p className="documentHubCardDesc">
              Bajar el Excel del snapshot actual o el backup del estado previo,
              sin modificar la base.
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
              setExcelDownloadKind(null)
              resetOperationResults()
            }}
          >
            ← Volver al menú
          </button>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      {step === 'add' ? (
        <>
          <section className="surfaceSection">
            <h3 className="sectionTitle">Cargar archivos</h3>
            <p className="muted sectionHint">
              Base + listado ERP (CEOS o TOTVS): se incorporan al snapshot solo los
              comprobantes que aún no estaban.
            </p>
            <form className="formGrid" onSubmit={onSubmitAddDocumentsFromErp}>
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
                Archivo base (.csv)
                <input
                  className="input"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    setBaseFile(e.target.files?.[0] ?? null)
                    resetOperationResults()
                  }}
                  required
                />
              </label>
              <label className="fieldLabel">
                Fecha de actualización del archivo base
                <input
                  className="input"
                  type="date"
                  value={addBaseActualizacionDate}
                  onChange={(e) => {
                    setAddBaseActualizacionDate(e.target.value)
                    resetOperationResults()
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
                    resetOperationResults()
                  }}
                  required
                />
              </label>
              <label className="fieldLabel">
                Fecha de emisión del archivo ERP
                <input
                  className="input"
                  type="date"
                  value={addErpEmisionDate}
                  onChange={(e) => {
                    setAddErpEmisionDate(e.target.value)
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
                {isSubmitting ? 'Agregando…' : 'Agregar documentos'}
              </button>
            </form>
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
                  <p className="statItem">
                    Eliminados: {result.stats.removedDocs ?? 0}
                  </p>
                  <p className="statItem">Errores: {result.stats.errors}</p>
                </div>
              </section>

              {postOpDownloadSection(erpSource)}

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

              {result.previewRemoved && result.previewRemoved.length > 0 ? (
                <section className="surfaceSection">
                  <h3 className="sectionTitle">
                    Vista previa (documentos eliminados)
                  </h3>
                  <pre className="preJson">
                    {JSON.stringify(result.previewRemoved, null, 2)}
                  </pre>
                </section>
              ) : null}

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
        </>
      ) : null}

      {step === 'remove' ? (
        <>
          <section className="surfaceSection">
            <h3 className="sectionTitle">Cargar archivos</h3>
            <p className="muted sectionHint">
              Quita del base los documentos anteriores a la fecha de corte de matriz
              que no figuren en el listado de casa matriz (CEOS o TOTVS).
            </p>
            <form className="formGrid" onSubmit={onSubmitRemoveDocumentsFromErp}>
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
                Archivo base (.csv)
                <input
                  className="input"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    setRemoveBaseFile(e.target.files?.[0] ?? null)
                    resetOperationResults()
                  }}
                  required
                />
              </label>
              <label className="fieldLabel">
                Fecha de actualización del archivo base
                <input
                  className="input"
                  type="date"
                  value={removeBaseActualizacionDate}
                  onChange={(e) => {
                    setRemoveBaseActualizacionDate(e.target.value)
                    resetOperationResults()
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
                    setRemoveErpFile(e.target.files?.[0] ?? null)
                    resetOperationResults()
                  }}
                  required
                />
              </label>
              <label className="fieldLabel">
                Fecha de emisión del archivo ERP (corte para eliminar)
                <input
                  className="input"
                  type="date"
                  value={removeErpEmisionDate}
                  onChange={(e) => {
                    setRemoveErpEmisionDate(e.target.value)
                    resetOperationResults()
                  }}
                  required
                />
              </label>
              <button
                type="submit"
                className="btn"
                disabled={!token || isRemoveSubmitting}
              >
                {isRemoveSubmitting
                  ? 'Eliminando…'
                  : 'Eliminar documentos'}
              </button>
            </form>
          </section>

          {removeResult ? (
            <>
              <section className="surfaceSection">
                <h3 className="sectionTitle">Resultado eliminación</h3>
                <p className="muted">
                  Fecha de emisión usada como corte:{' '}
                  <strong>{removeResult.erpEmisionDate}</strong>
                </p>
                <div className="statGrid">
                  <p className="statItem">Base: {removeResult.stats.baseDocs}</p>
                  <p className="statItem">ERP: {removeResult.stats.erpDocs}</p>
                  <p className="statItem">
                    Mantenidos: {removeResult.stats.keptDocs}
                  </p>
                  <p className="statItem">
                    Eliminados: {removeResult.stats.removedDocs}
                  </p>
                  <p className="statItem">Errores: {removeResult.stats.errors}</p>
                </div>
              </section>

              {postOpDownloadSection(erpSource)}

              <section className="surfaceSection">
                <h3 className="sectionTitle">Vista previa (documentos eliminados)</h3>
                <pre className="preJson">
                  {JSON.stringify(removeResult.previewRemoved, null, 2)}
                </pre>
              </section>

              {removeResult.previewErrors &&
              removeResult.previewErrors.length > 0 ? (
                <section className="surfaceSection">
                  <h3 className="sectionTitle">Errores de parseo ERP (muestra)</h3>
                  <pre className="preJson">
                    {JSON.stringify(removeResult.previewErrors, null, 2)}
                  </pre>
                </section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {step === 'download' ? (
        <section className="surfaceSection">
          <h3 className="sectionTitle">Descargas</h3>
          <p className="muted sectionHint">
            Elegí ERP y descargá la versión actual del snapshot o el backup más
            reciente.
          </p>
          <label className="fieldLabel sectionHint">
            ERP
            <select
              className="select"
              value={downloadErpSource}
              onChange={(e) =>
                setDownloadErpSource(e.target.value as ErpSource)
              }
            >
              <option value="CEOS">CEOS</option>
              <option value="TOTVS">TOTVS</option>
            </select>
          </label>

          <div className="inlineActions">
            <button
              type="button"
              className="btn"
              disabled={!token || excelDownloadBusy}
              onClick={() => void downloadCurrent(downloadErpSource)}
            >
              {excelDownloadKind === 'current'
                ? 'Descargando…'
                : 'Descargar Excel actual'}
            </button>
            <button
              type="button"
              className="btn btnSecondary"
              disabled={!token || excelDownloadBusy}
              onClick={() => void downloadBackup(downloadErpSource)}
            >
              {excelDownloadKind === 'backup'
                ? 'Descargando…'
                : 'Descargar backup'}
            </button>
          </div>
        </section>
      ) : null}
    </Modal>
  )
}
