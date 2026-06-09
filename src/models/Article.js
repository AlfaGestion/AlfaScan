export default class Article {
  constructor({
    codigoBarra = "",
    codigoInterno = "",
    descripcion = "",
    precio = 0,
    stock = null,
    fechaActualizacion = "",
  } = {}) {
    this.codigoBarra = String(codigoBarra ?? "").trim();
    this.codigoInterno = String(codigoInterno ?? "").trim();
    this.descripcion = String(descripcion ?? "").trim();
    this.precio = Number(precio ?? 0) || 0;
    this.stock = stock === null || stock === undefined || stock === "" ? null : Number(stock);
    this.fechaActualizacion = String(fechaActualizacion ?? "").trim();
  }

  static fromRow(row = {}) {
    return new Article({
      codigoBarra:
        row.codigoBarra ??
        row.codigoBarras ??
        row.CodigoBarra ??
        row.CodigoBarras ??
        row.code ??
        row.codigoInterno ??
        "",
      codigoInterno:
        row.codigoInterno ??
        row.codigoArticulo ??
        row.code ??
        row.codigo ??
        row.CodigoArticulo ??
        "",
      descripcion:
        row.descripcion ??
        row.Descripcion ??
        row.name ??
        row.nombre ??
        "",
      precio:
        row.precio ??
        row.Precio ??
        row.price1 ??
        row.price ??
        row.precio1 ??
        row.priceSelected ??
        0,
      stock:
        row.stock ??
        row.Stock ??
        row.cant_propuesta ??
        row.cantPropuesta ??
        row.qty ??
        row.quantity ??
        null,
      fechaActualizacion:
        row.fechaActualizacion ??
        row.FechaActualizacion ??
        row.updated_at ??
        row.updatedAt ??
        row.fecha_actualizacion ??
        "",
    });
  }
}
