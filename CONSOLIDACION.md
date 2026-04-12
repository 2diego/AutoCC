# Consolidación de cuenta corriente (CEOS y TOTVS)

Este documento describe el comportamiento del sistema al **agregar** o **eliminar** documentos en el snapshot de cuenta corriente, para los orígenes **CEOS** y **TOTVS**: qué archivos intervienen, cómo se interpretan las fechas y cómo funcionan los algoritmos.

---

## 1. Visión general

Hay dos operaciones distintas, ambas con **dos archivos CSV** y el mismo tipo de “listado ERP” en el segundo archivo:

| Operación | Archivo 1 | Archivo 2 |
|-----------|-----------|-----------|
| **Agregar documentos** | Cuenta corriente **base** (snapshot completo o export de CC) | Listado ERP **incremental** (novedades: comprobantes que aún no estaban en el base). |
| **Eliminar documentos** | Mismo concepto de **base** | Listado ERP **mismo formato incremental**; las claves que figuren indican qué comprobantes “siguen vigentes” bajo el corte. |
| **Consolidación completa** | **Base** | **Un solo** listado ERP (p. ej. histórico con todos los pendientes); en un paso se agrega y luego se elimina por fecha de corte |

En ambos casos el backend identifica cada comprobante con una **clave lógica** y normaliza textos (mayúsculas, espacios, reglas propias de TOTVS para el número de documento).

**Fechas que el usuario ingresa en la interfaz**

- **Agregar:** solo se eligen ERP y archivos; no hay fechas de formulario (las fechas de comprobantes vienen de los CSV).
- **Eliminar y consolidación completa:** además de los archivos, una **`fechaCorteEliminacion`** (`YYYY-MM-DD`) para la regla de eliminación (medianoche UTC al comparar con `fechaDoc`).

**Replay del Excel (export)**

- El texto del archivo **base** queda guardado en la consolidación (`baseFileText`). La exportación a Excel **reproduce** ese contenido (incluida la línea de actualización u otras cabeceras que traiga el archivo), sin depender de campos de fecha enviados aparte en el formulario.
- **Solo en el Excel descargable** (no afecta consolidación ni base de datos): para **facturas y notas de débito** (CEOS: tipos `F` y `D`; TOTVS: `NF`, `ND`, y comprobantes **YD1-…** que en el parser figuran como tipo `NCE`), el **texto del monto en Saldo** (columna **E**) puede llevar color de fuente según recibos en **G** e importes de recibo en **H**:
  1. Si **G** (Recibo) está vacía → no se aplica color.
  2. Si en **G** aparece la palabra `anulada` (sin distinguir mayúsculas) → monto de **Saldo** en azul **`#0000FF`** (cancelado / anulado).
  3. Si **G** contiene números de recibo (pueden ir separados por `/`, `-` o `+`) y **H** (importe(s) de recibo) está vacía → monto de **Saldo** en azul **`#0000FF`** (se asume cancelación total sin desglose de importes).
  4. Si **H** tiene uno o más importes separados por `+` (cada tramo corresponde a un recibo): se suman esos importes (cada tramo en formato moneda AR: con o sin miles con `.`, con o sin `,xx` decimales) y se toma como referencia el **Importe** del documento (**D**), o si **D** está vacío el **Saldo** (**E**). Constante **2000** en la misma moneda que los importes del layout:
     - Si la suma de importes de recibo es **≥ referencia − 2000** → monto de **Saldo** en azul **`#0000FF`** (considerado pagado en su totalidad).
     - Si la suma es **&lt; referencia − 2000** → monto de **Saldo** en rojo **`#A20000`** (pago parcial).
  5. En cualquier otro caso (p. ej. sin recibos numéricos en **G** y sin `anulada`) → no se cambia el color del texto de **Saldo** (equivalente a “debe todo” o sin regla aplicable).

---

## 2. Reglas de fechas

### 2.1 Fecha de corte para eliminación

- Formato en API / formulario: **`YYYY-MM-DD`** (input tipo fecha del navegador).
- Se convierte a medianoche **UTC** para comparar con las fechas de comprobantes del base (también tratadas en UTC de forma consistente).

### 2.2 Fechas de comprobantes dentro de los CSV (regla de negocio **día / mes / año**)

En columnas donde el sistema **espera** una fecha de comprobante (emisión en líneas de detalle, vencimiento en listados ERP donde aplica, etc.):

- Orden fijo: **día / mes / año** (no mes/día).
- Día y mes: **1 o 2 dígitos** (no es obligatorio rellenar con cero).
- Año: **2 dígitos** (se interpretan como **20xx**, p. ej. `26` → 2026) o **4 dígitos**.
- Se permiten **espacios opcionales** alrededor de las barras (`5 / 3 / 2026` se normaliza como `5/3/2026`).

Funciones expuestas en el parser (referencia de implementación):

- `parseDocumentDateDmY`: obtiene un `Date` válido o `null`.
- `documentDateMatchesDmYPattern`: indica si el texto tiene la **forma** d/m/y (sin garantizar calendario válido).

Si en una **línea de documento** la fecha esperada **falta** o **no cumple** (formato incorrecto o día/mes/año imposible), se genera un registro en la lista de **errores de parseo** y **esa línea no se incorpora** como documento válido. Códigos típicos:

| Código | Significado |
|--------|-------------|
| `MISSING_DOCUMENT_DATE` | Campo de fecha vacío donde es obligatorio. |
| `INVALID_DOCUMENT_DATE_FORMAT` | Texto presente pero no coincide con el patrón d/m/y (p. ej. `2026/03/30`). |
| `INVALID_DOCUMENT_DATE_CALENDAR` | Encaja en el patrón pero no es una fecha de calendario válida (p. ej. 31/02/2026). |

Los errores se persisten en la consolidación y se muestran en la **vista previa de errores** en el frontend.

### 2.3 Cabeceras del CSV ERP (solo informativo)

Muchos extractos traen en el encabezado una **fecha de criterio del listado** (p. ej. CEOS `FECHA : d/m/y`, TOTVS **`Pregunta 01 : Fecha Desde?`** frente a `Fch.Ref` / `Emision` como fecha de impresión del reporte). Eso ayuda a interpretar el archivo a mano; **el backend no usa esas líneas** para validar ni para el corte: el corte de eliminación es solo **`fechaCorteEliminacion`** y las fechas que importan al algoritmo son las de **cada comprobante** en las filas de detalle.

---

## 3. CEOS

### 3.1 Archivo base

- Filas de **cliente / tienda** a partir de texto tipo “Cliente …” con código numérico y tienda.
- Filas de **documento**: se detecta el token del comprobante (factura, recibo `REC…`, etc.) y se toma la **fecha del comprobante** de la columna correspondiente (tras separar por `;` o CSV).
- Tipos: p. ej. recibos se normalizan a tipo **`R`**; facturas **`F`**, etc.

### 3.2 Listado ERP incremental (agregar / eliminar)

- Líneas con cliente numérico al inicio y un **patrón de cola** con: fecha emisión, fecha vencimiento, tipo (`F`/`C`/`D`/`R`), número, importe/saldo.
- **Ambas fechas** (emisión y vencimiento) deben cumplir la regla d/m/y; si alguna falla, se registra error y la línea no entra como documento.
- La **tienda** en este listado se fija en **`01`** para la clave del documento.

---

## 4. TOTVS

### 4.1 Archivo base

- Similar estructura por **cliente y tienda** (encabezados).
- Documento: token TOTVS (NF, REC/RA, NCE, prefijos tipo `A06-…`, etc.) con reglas de **tipo** interno (`RA`, `NF`, `ND`, `NCE`, `NCC`, …). Los comprobantes con número **`AC` + dígitos + `-…`** (p. ej. `AC1-002100029354`) se tratan como **nota de crédito** (`NCC`); los que siguen **`AD` + dígitos + `-…`** (p. ej. `AD4-001400000862`) como **nota de débito** (`ND`), también cuando el extracto lista la columna tipo como `NF`.
- La **fecha del comprobante** está en la columna de emisión del layout base (separado por `;` o CSV). Si no cumple d/m/y, error y la fila no se cuenta como documento.

### 4.2 Listado ERP incremental

- Líneas bajo encabezado de cliente/tienda con patrón: **tipo**, **número**, **fecha emisión**, **fecha vencimiento**, valor, saldo.
- **Ambas fechas** deben ser válidas en formato d/m/y.
- Cliente y tienda se heredan del último encabezado leído (incluye continuidad tras saltos de página en exports reales).

La clave de documento **canoniza** el número en TOTVS (p. ej. ceros a la izquierda en ciertos formatos) para evitar duplicados lógicos.

---

## 5. Algoritmo: agregar documentos

1. Se parsean **base** y **ERP** según el origen (CEOS o TOTVS).
2. Se normalizan importes: si falta valor o saldo, se **replica** el otro para mantener coherencia en export.
3. Se construye un mapa de claves de todos los documentos del **base**.
4. Cada documento del **ERP** cuya clave **no** está en el base se considera **agregado**.
5. El resultado final es **base ∪ agregados**, deduplicado por clave (una sola fila por clave).
6. Los errores de parseo de ambos archivos se acumulan y se guardan; la operación puede completarse con documentos válidos aunque existan líneas con error.

**Importante:** no se eliminan documentos del base en esta operación ni se actualizan montos de comprobantes ya existentes por clave.

---

## 6. Algoritmo: eliminar documentos

1. Se parsean **base** y **listado ERP** (mismo parser incremental que en “agregar”).
2. **Corte:** fecha `fechaCorteEliminacion` ingresada por el usuario (medianoche UTC).
3. Se construye un **conjunto de claves** presentes en el listado ERP.
4. Para cada documento del **base**:
   - Si **no tiene** `fechaDoc` → **se mantiene** (no aplica corte).
   - Si `fechaDoc` **≥ corte** → **se mantiene**.
   - Si `fechaDoc` **< corte**:
     - Si la clave **está** en el listado ERP → **se mantiene** (el ERP aún lo lista).
     - Si la clave **no está** → **se elimina** del resultado.

5. El resultado reemplaza el snapshot actual en base de datos; el estado anterior queda en **backup** vinculado a la consolidación.

**Importante:** la decisión no compara importes ni saldos; solo fecha de comprobante, corte y presencia en el ERP.

---

## 7. Consolidación completa (un solo paso)

Misma pareja de archivos (**cuenta corriente base** + **un listado ERP** que puede ser histórico, con todos los comprobantes pendientes). No se agregan parsers nuevos: se encadenan los algoritmos de las secciones **5** y **6** sobre el mismo parseo.

1. **Fase agregar:** se calcula `base ∪ agregados` como en la sección 5 (claves del ERP que no estaban en el base).
2. **Fase eliminar:** sobre ese conjunto unido, se aplican las reglas de la sección 6, con **fecha de corte** = `fechaCorteEliminacion` (YYYY-MM-DD) y el **mismo** listado ERP para el conjunto de claves “presentes”.

Campos en el formulario / multipart: `erpSource`, `baseFile`, `erpFile`, **`fechaCorteEliminacion`**.

---

## 8. Endpoints HTTP (referencia)

- `POST /api/consolidations/add-documents-from-erp` — multipart: `baseFile`, `erpFile`, `erpSource`.
- `POST /api/consolidations/remove-documents-from-erp` — multipart: `baseFile`, `erpFile`, `erpSource`, `fechaCorteEliminacion`.
- `POST /api/consolidations/full-consolidation-from-erp` — igual que remove: `fechaCorteEliminacion` para la fase eliminar tras el agregar.

---

## 9. Resumen práctico para operadores

1. Garantizar en los CSV que todas las **fechas de comprobante** (y vencimiento en listados ERP) estén en **día/mes/año** con año de 2 o 4 cifras.
2. Revisar tras cada corrida la **muestra de errores**: líneas con `INVALID_*` o `MISSING_DOCUMENT_DATE` deben corregirse en el archivo y volver a procesar si es necesario.
3. En **eliminar** y **consolidación completa**, elegir la **fecha de corte** acorde al criterio de negocio (comprobantes anteriores al corte sin clave en el ERP se excluyen del resultado).
