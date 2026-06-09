import SQLite from "@db/SQLiteCompat";
import { BaseModel, types } from "expo-sqlite-orm";

export default class Configuration extends BaseModel {
  constructor(obj) {
    super(obj);
  }

  static get database() {
    return async () => SQLite.openDatabase("AlfaScan.db");
  }

  static get tableName() {
    return "config";
  }

  static get columnMapping() {
    return {
      id: { type: types.INTEGER, primary_key: true },
      key: { type: types.TEXT },
      value: { type: types.TEXT },
    };
  }

  static async getConfig(key) {
    const sql = `SELECT value from config where key=? ORDER BY id DESC`;
    return await this.repository.databaseLayer
      .executeSql(sql, [key])
      .then(({ rows }) => rows);
  }

  static async getConfigValue(key) {
    const sql = `SELECT value from config where key=? ORDER BY id DESC LIMIT 1`;
    const data = await this.repository.databaseLayer
      .executeSql(sql, [key])
      .then(({ rows }) => rows);
    try {
      return data[0].value;
    } catch (e) {
      return "";
    }
  }

  static async setConfigValue(key, value) {
    const sqlExists = `SELECT 1 from config where key=? LIMIT 1`;
    const exists = await this.repository.databaseLayer
      .executeSql(sqlExists, [key])
      .then(({ rows }) => rows);
    if (!exists || exists.length === 0) {
      const sqlInsert = `INSERT INTO config (key,value) values(?, ?)`;
      return await this.repository.databaseLayer
        .executeSql(sqlInsert, [key, value])
        .then(({ rows }) => rows);
    }
    const sqlUpdate = `UPDATE config set value=? WHERE key=?`;
    return await this.repository.databaseLayer
      .executeSql(sqlUpdate, [value, key])
      .then(({ rows }) => rows);
  }

  static async getConfigAPI() {
    const sql = `SELECT * from config where key='API_URI' or key='ALFA_ACCOUNT' or key='PASSWORD_SYNC' or key='USERNAME_SYNC' or key='ALFA_DATABASE_ID'`;
    return await this.repository.databaseLayer
      .executeSql(sql, [])
      .then(({ rows }) => rows);
  }

  static isTruthyConfigValue(value) {
    const normalized = String(value ?? "")
      .trim()
      .toUpperCase();
    if (normalized === "") {
      return false;
    }
    if (["0", "NO", "N", "FALSE", "OFF"].includes(normalized)) {
      return false;
    }
    return true;
  }
}
