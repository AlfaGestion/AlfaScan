# AlfaLector

App React Native para lector Sunmi con impresora interna de 80 mm.

## Objetivo

Esta base toma la estructura de `AlfaDepositos` y la adapta para lectura de artículos/precios con:

- Modo `SQL Online`
- Modo `SQL Local`
- Sincronización local reutilizable
- Impresión interna Sunmi

## Requisitos

- Android con Sunmi y impresora interna
- Build nativo de Expo/React Native, no Expo Go
- Servidor SQL Server accesible desde el dispositivo

## Configuración SQL

La configuración está en la pantalla `Configuración`.

### Campos principales

- `SQL_MODE`
  - `ONLINE`: consulta directa al servidor
  - `LOCAL`: sincroniza y luego usa SQLite local
- `SQL_CONNECTION_MODE`
  - `AUTO`
  - `SERVER`
  - `IP`
  - `INSTANCE`
  - `PORT`
  - `CUSTOM`
- `SQL_SERVER`
  - Acepta `NOMBRE_SERVIDOR`, `IP`, `IP\\INSTANCIA`, `NOMBRE\\INSTANCIA` o `NOMBRE,PUERTO`
- `SQL_INSTANCE`
- `SQL_PORT`
- `SQL_USER`
- `SQL_PASSWORD`
- `SQL_DATABASE`
- `SQL_TABLE_VIEW`
  - Ejemplos: `dbo.Articulos`, `dbo.vw_Articulos`, `dbo.Precios`

### Sincronización local

Cuando `SQL_MODE = LOCAL`, la app puede sincronizar el catálogo con el botón:

- `Sincronizar catálogo SQL local`

La sincronización usa una tabla staging para no borrar el catálogo local hasta terminar la descarga correctamente.

## Impresión Sunmi

La app mantiene impresión con `react-native-sunmi-v2-printer` para el hardware integrado Sunmi.

### Notas

- La impresión está pensada para papel de 80 mm.
- El proyecto requiere un build nativo con la dependencia de Sunmi instalada.
- La impresión actual usa texto monoespaciado y separadores simples, compatible con tickets/etiquetas básicos.

## Cómo cambiar la configuración

1. Abrir `Configuración`.
2. Completar:
   - `Modo SQL`
   - `Servidor SQL`
   - `Usuario SQL`
   - `Contraseña SQL`
   - `Base de datos SQL`
   - `Tabla o vista de artículos`
   - `Modo de conexión`
3. Guardar con `Grabar`.
4. Si se usa `SQL Local`, ejecutar `Sincronizar catálogo SQL local`.

## Compatibilidad SQL Server

La capa de consulta evita depender de funciones modernas innecesarias y apunta a sintaxis compatible con versiones antiguas y nuevas de SQL Server.

## Observaciones

- El proyecto usa la tabla local `products` como cache del catálogo.
- Para que `SQL Online` funcione directamente desde el dispositivo, la app usa un módulo nativo Android (`react-native-mssql`).
- Si el servidor expone una vista con nombres de columnas estándar, la integración es más simple y estable.
