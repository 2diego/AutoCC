# Consolidación de cuenta corriente (CEOS y TOTVS)

Este documento describe el comportamiento del sistema al **agregar** o **eliminar** documentos en el snapshot de cuenta corriente, para los orígenes **CEOS** y **TOTVS**: qué archivos intervienen, cómo se interpretan las fechas y cómo funcionan los algoritmos.

---

## 1. Visión general

Hay dos operaciones distintas, ambas con **dos archivos CSV** y el mismo tipo de “listado ERP” en el segundo archivo:

| Operación | Archivo 1 | Archivo 2 |
|-----------|-----------|-----------|
| **Agregar documentos** | Cuenta corriente **base** (snapshot completo o export de CC) | Listado ERP **actualizado** desde la fecha de actualizacion de la cuenta corriente a fecha actual (incremental / novedades) |
| **Eliminar documentos** | Mismo concepto de **base** | Listado ERP **actualizado** historico a fecha de actualizacion de cuenta corriente|

En ambos casos el backend identifica cada comprobante con una **clave lógica** y normaliza textos (mayúsculas, espacios, reglas propias de TOTVS para el número de documento).

Además, en la **interfaz** el usuario informa:

- **Fecha de actualización del archivo base** (`baseActualizacionDate`, formato `YYYY-MM-DD` en el formulario).
- **Fecha de emisión del archivo ERP** (`erpEmisionDate`, mismo formato).

Esas fechas se validan en el servidor. La **fecha de emisión** del formulario es la que define el **corte** al eliminar documentos (no se toma del texto del CSV como única fuente de verdad). Si el CSV declara otra fecha que la del usuario en los puntos usados para validación (CEOS: `FECHA :`; TOTVS: **`Pregunta 01 : Fecha Desde?`**, no la fecha de impresión `Fch.Ref` / `Emision` del encabezado), el sistema puede **exigir confirmación** si no coincide con lo ingresado.

---

## 2. Reglas de fechas

### 2.1 Fechas ingresadas por el usuario

- Formato en API / formulario: **`YYYY-MM-DD`** (input tipo fecha del navegador).
- Se convierten a medianoche **UTC** para comparar con las fechas de comprobantes (también tratadas en UTC de forma consistente).

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

### 2.3 Fecha declarada en cabecera del CSV ERP (solo validación cruzada)

- **CEOS:** primera coincidencia de `FECHA : d/m/y` (misma regla flexible de dígitos).
- **TOTVS:** la línea **`Pregunta 01 : Fecha Desde? … d/m/y`** (parámetro del listado SIGA / SSRCC001). Esa es la fecha de criterio del extracto. Las líneas `Fch.Ref:` y `Emision:` del encabezado suelen ser la **fecha de generación del reporte** (p. ej. el día de la corrida) y **no** se usan para esta validación. Si el archivo no trae el bloque de preguntas, se usa `Fch.Ref:` solo como respaldo.

Si existe y **no coincide** con `erpEmisionDate` del usuario, la API responde con error `ERP_FILE_DATE_MISMATCH` hasta que el usuario confirma continuar (`confirmFileDateMismatch`).

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
- Documento: token TOTVS (NF, REC/RA, NCE, prefijos tipo `A06-…`, etc.) con reglas de **tipo** interno (`RA`, `NF`, `NCE`, `NCC`, …).
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
2. **Corte:** fecha `erpEmisionDate` ingresada por el usuario (medianoche UTC).
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

## 7. Endpoints HTTP (referencia)

- `POST /api/consolidations/add-documents-from-erp` — multipart: `baseFile`, `erpFile`, `erpSource`, `baseActualizacionDate`, `erpEmisionDate`, opcional `confirmFileDateMismatch`.
- `POST /api/consolidations/remove-documents-from-erp` — mismos campos; el segundo archivo se envía como `erpFile`.

---

## 8. Resumen práctico para operadores

1. Garantizar en los CSV que todas las **fechas de comprobante** (y vencimiento en listados ERP) estén en **día/mes/año** con año de 2 o 4 cifras.
2. Revisar tras cada corrida la **muestra de errores**: líneas con `INVALID_*` o `MISSING_DOCUMENT_DATE` deben corregirse en el archivo y volver a procesar si es necesario.
3. La **fecha de emisión** del formulario debe reflejar el criterio de negocio al **eliminar**; si el archivo declara otra fecha en cabecera, el sistema advertirá antes de forzar la operación.
