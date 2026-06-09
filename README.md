# AlfaScan

Aplicacion React Native / Expo orientada a dispositivos Sunmi para busqueda de articulos, escaneo de codigo de barras, consulta de precios, sincronizacion y preparacion de impresiones.

## Flujo principal

- Buscar por codigo de barras, descripcion o codigo interno.
- Escanear con camara o lector.
- Ver descripcion, codigo de barra, precio, stock y ultima sincronizacion.
- Preparar impresiones para los formatos:
  - Gondola
  - Producto
  - Precio Chico
  - Personalizado

## Estructura actual

- `Home`
  - Busqueda rapida y acceso a impresion.
  - Menu lateral con configuracion, sincronizacion, productos, historial y acerca de.
- `Configuracion`
  - SQL Local
  - SQL Online
  - API AlfaNet como alternativa
  - Formatos de impresion
- `Sincronizacion`
  - Sincronizacion del catalogo para SQL Local.
- `Historial de impresiones`
  - Registros locales de los formatos preparados desde la pantalla principal.

## Configuracion SQL Local

Use este modo como configuracion recomendada. La app guarda el catalogo en SQLite local, busca siempre sobre esa base y sincroniza desde el SQL Server del cliente.

Campos:

- Servidor SQL
- Instancia SQL opcional
- Puerto opcional
- Base de datos
- Usuario
- Contrasena
- Tabla o vista de articulos
- Campo codigo de articulo
- Campo codigo de barras
- Campo descripcion
- Campo precio
- Campo stock
- Timeout SQL
- Frecuencia de sincronizacion

Pasos:

1. Abrir `Configuracion`.
2. Seleccionar `SQL Local`.
3. Completar servidor, base, usuario, contrasena y tabla/vista.
4. Verificar el nombre de las columnas configuradas.
5. Probar la conexion desde una development build o APK propia.
6. Guardar la configuracion.
7. Ejecutar `Sincronizar ahora` desde configuracion o entrar en `Sincronizacion`.

## Configuracion SQL Online

Use este modo cuando la app deba consultar directamente el servidor SQL en la misma red. Es una alternativa, no el modo recomendado.

Campos:

- Servidor SQL
- Instancia SQL opcional
- Puerto opcional
- Base de datos
- Usuario
- Contrasena
- Tabla o vista de articulos
- Campo codigo de barra
- Campo descripcion
- Campo precio
- Campo stock opcional
- Timeout SQL

Pasos:

1. Abrir `Configuracion`.
2. Seleccionar `SQL Online`.
3. Completar los campos SQL.
4. Probar la conexion.
5. Guardar la configuracion.

## Formatos de impresion

La pantalla de configuracion permite editar hasta 4 formatos.

Formatos incluidos por defecto:

1. Gondola
2. Producto
3. Precio Chico
4. Personalizado

Cada formato permite ajustar:

- Nombre
- Ancho de papel
- Tamano de fuente de descripcion
- Tamano de fuente de precio
- Mostrar codigo de barra
- Mostrar precio
- Mostrar descripcion
- Mostrar stock
- Mostrar fecha
- Mostrar nombre de empresa
- Mostrar codigo interno
- Cantidad de copias
- Margen superior
- Margen inferior
- Alineacion
- Precio en negrita
- Vista previa antes de imprimir

## Compatibilidad SQL

La capa SQL se mantiene simple para maximizar compatibilidad con:

- SQL Server 2008
- SQL Server 2012
- SQL Server 2016
- SQL Server 2019
- SQL Server 2022
- SQL Server 2026 o superior

La idea es usar consultas simples basadas en `SELECT`, `WHERE` y parametros, sin depender de funciones modernas que rompan compatibilidad con versiones antiguas.

Formatos de servidor soportados:

- `SERVIDOR`
- `IP`
- `SERVIDOR\INSTANCIA`
- `IP\INSTANCIA`
- `IP,PUERTO`
- `SERVIDOR,PUERTO`

## Impresion Sunmi

El proyecto esta preparado para `react-native-sunmi-v2-printer`.

Notas:

- El foco principal es papel de `80 mm`.
- Tambien se contemplan `58 mm` y etiquetas personalizadas.
- Los botones de impresion de la Home dejan registrado el formato elegido y la estructura de datos del articulo para la siguiente etapa de integracion nativa completa.

## Como compilar para Android / Sunmi

Requisitos:

- Node.js instalado
- Android Studio y SDK configurados
- JDK compatible con React Native / Expo
- Dispositivo Sunmi conectado por USB o build instalado en el equipo

Comandos:

```bash
npm install
npm run android
```

Para un build de produccion con EAS:

```bash
eas build -p android
```

Recomendaciones para Sunmi:

- Usar build nativo o development build, no Expo Go para SQL directo.
- Probar la camara, el lector integrado y la impresora interna en el dispositivo real.
- Verificar que la app tenga permisos de camara y red segun el modo de conexion elegido.

## Persistencia local

La configuracion se guarda localmente en la base del proyecto, por lo que no es necesario hardcodear servidores, tablas ni campos.

## Observaciones

- La Home nueva de AlfaScan reemplaza el flujo viejo de deposito en la navegacion principal.
- Las pantallas heredadas que no aplican al nuevo escenario quedaron fuera del menu principal.
