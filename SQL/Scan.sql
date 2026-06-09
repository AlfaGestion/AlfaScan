
IF OBJECT_ID('dbo.Scan_ReporteDetalle', 'U') IS NOT NULL
    DROP TABLE dbo.Scan_ReporteDetalle;

IF OBJECT_ID('dbo.Scan_Reporte', 'U') IS NOT NULL
    DROP TABLE dbo.Scan_Reporte;
GO

CREATE TABLE dbo.Scan_Reporte (
    IdReporte INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Codigo NVARCHAR(50) NOT NULL UNIQUE,
    Nombre NVARCHAR(100) NOT NULL,
    Descripcion NVARCHAR(250) NULL,
    AnchoPapelMm INT NOT NULL DEFAULT 80,
    AltoMm INT NULL,
    Activo BIT NOT NULL DEFAULT 1,
    EsPredeterminado BIT NOT NULL DEFAULT 0,
    FechaAlta DATETIME NOT NULL DEFAULT GETDATE(),
    FechaModificacion DATETIME NULL
);
GO

CREATE TABLE dbo.Scan_ReporteDetalle (
    IdDetalle INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    IdReporte INT NOT NULL,
    TipoElemento NVARCHAR(30) NOT NULL,
    Campo NVARCHAR(50) NULL,
    TextoFijo NVARCHAR(250) NULL,
    X INT NOT NULL DEFAULT 0,
    Y INT NOT NULL DEFAULT 0,
    Ancho INT NOT NULL DEFAULT 100,
    Alto INT NOT NULL DEFAULT 30,
    TamanoFuente INT NOT NULL DEFAULT 18,
    Negrita BIT NOT NULL DEFAULT 0,
    Alineacion NVARCHAR(20) NOT NULL DEFAULT 'center',
    Visible BIT NOT NULL DEFAULT 1,
    Orden INT NOT NULL DEFAULT 0,
    MaxLineas INT NOT NULL DEFAULT 1,
    Mayuscula BIT NOT NULL DEFAULT 0,
    FechaModificacion DATETIME NULL,
    CONSTRAINT FK_Scan_ReporteDetalle_Reporte
        FOREIGN KEY (IdReporte)
        REFERENCES dbo.Scan_Reporte(IdReporte)
);
GO

INSERT INTO dbo.Scan_Reporte
(Codigo, Nombre, Descripcion, AnchoPapelMm, AltoMm, Activo, EsPredeterminado)
VALUES
('gondola', 'Góndola', 'Etiqueta grande para góndola 80mm', 80, NULL, 1, 1),
('product', 'Producto', 'Etiqueta de producto 80mm', 80, NULL, 1, 0),
('small', 'Chico', 'Etiqueta chica 80mm', 80, NULL, 1, 0),
('custom', 'Personalizado', 'Formato personalizado 80mm', 80, NULL, 1, 0);
GO

DECLARE @Gondola INT = (SELECT IdReporte FROM dbo.Scan_Reporte WHERE Codigo = 'gondola');
DECLARE @Product INT = (SELECT IdReporte FROM dbo.Scan_Reporte WHERE Codigo = 'product');
DECLARE @Small INT = (SELECT IdReporte FROM dbo.Scan_Reporte WHERE Codigo = 'small');
DECLARE @Custom INT = (SELECT IdReporte FROM dbo.Scan_Reporte WHERE Codigo = 'custom');

INSERT INTO dbo.Scan_ReporteDetalle
(IdReporte, TipoElemento, Campo, TextoFijo, X, Y, Ancho, Alto, TamanoFuente, Negrita, Alineacion, Visible, Orden, MaxLineas, Mayuscula)
VALUES
-- GÓNDOLA 80mm
(@Gondola, 'texto', 'Empresa', NULL, 10, 8, 300, 28, 18, 1, 'center', 1, 1, 1, 1),
(@Gondola, 'texto', 'Descripcion', NULL, 10, 42, 300, 64, 24, 1, 'center', 1, 2, 2, 1),
(@Gondola, 'precio', 'Precio', NULL, 10, 112, 300, 74, 38, 1, 'center', 1, 3, 1, 0),
(@Gondola, 'texto', 'CodigoArticulo', 'Cod: {CodigoArticulo}', 10, 194, 300, 28, 18, 0, 'center', 1, 4, 1, 0),
(@Gondola, 'texto', 'Fecha', NULL, 10, 228, 300, 24, 14, 0, 'right', 1, 5, 1, 0),

-- PRODUCTO 80mm
(@Product, 'texto', 'Empresa', NULL, 10, 8, 300, 26, 16, 1, 'center', 1, 1, 1, 1),
(@Product, 'texto', 'Descripcion', NULL, 10, 40, 300, 58, 20, 1, 'center', 1, 2, 2, 0),
(@Product, 'precio', 'Precio', NULL, 10, 104, 300, 64, 32, 1, 'center', 1, 3, 1, 0),
(@Product, 'texto', 'CodigoBarra', 'Barra: {CodigoBarra}', 10, 176, 300, 26, 16, 0, 'center', 1, 4, 1, 0),
(@Product, 'texto', 'CodigoArticulo', 'Cod: {CodigoArticulo}', 10, 206, 300, 26, 16, 0, 'center', 1, 5, 1, 0),

-- CHICO 80mm
(@Small, 'texto', 'Descripcion', NULL, 10, 10, 300, 44, 16, 1, 'center', 1, 1, 2, 0),
(@Small, 'precio', 'Precio', NULL, 10, 58, 300, 54, 30, 1, 'center', 1, 2, 1, 0),
(@Small, 'texto', 'CodigoArticulo', 'Cod: {CodigoArticulo}', 10, 118, 300, 24, 14, 0, 'center', 1, 3, 1, 0),

-- PERSONALIZADO 80mm
(@Custom, 'texto', 'Empresa', NULL, 10, 8, 300, 26, 16, 1, 'center', 1, 1, 1, 1),
(@Custom, 'texto', 'Descripcion', NULL, 10, 40, 300, 58, 20, 1, 'center', 1, 2, 2, 0),
(@Custom, 'precio', 'Precio', NULL, 10, 104, 300, 64, 32, 1, 'center', 1, 3, 1, 0),
(@Custom, 'texto', 'CodigoArticulo', 'Cod: {CodigoArticulo}', 10, 174, 145, 26, 15, 0, 'left', 1, 4, 1, 0),
(@Custom, 'texto', 'Stock', 'Stock: {Stock}', 165, 174, 145, 26, 15, 0, 'right', 1, 5, 1, 0),
(@Custom, 'texto', 'CodigoBarra', 'Barra: {CodigoBarra}', 10, 204, 300, 26, 15, 0, 'center', 1, 6, 1, 0),
(@Custom, 'texto', 'Fecha', NULL, 10, 234, 300, 22, 13, 0, 'right', 1, 7, 1, 0);
GO

SELECT *
FROM dbo.Scan_Reporte
ORDER BY IdReporte;

SELECT R.Codigo, R.Nombre, D.*
FROM dbo.Scan_Reporte R
INNER JOIN dbo.Scan_ReporteDetalle D ON D.IdReporte = R.IdReporte
ORDER BY R.Codigo, D.Orden;
GO

