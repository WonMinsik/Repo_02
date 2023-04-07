// -----------------------------------------
// var sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: 'mariadb',
  user: 'node',
  password: 'mirsystem',
  database: 'node',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// -----------------------------------------
//const db = new sqlite3.Database('./VNumRecog.db', (err) => {
// const db = new sqlite3.Database('../db/VNumRecog.db', (err) => {
//   if (err) {
//     logger.error("Error opening database " + err.message);
//     throw(err);
//   } else {
//     db.run('\
//       CREATE TABLE IF NOT EXISTS vnumdb (\
//       _ID INTEGER PRIMARY KEY, \
//       _DATE DATETIME DEFAULT CURRENT_TIMESTAMP, \
//       _ADDR_L INT, \
//       _ADDR_S TEXT, \
//       _V_TYPE INT, \
//       _V_NUM TEXT, \
//       _V_IMAGE_SIZE INT DEFAULT 0, \
//       _V_IMAGE_PATH TEXT DEFAULT NULL, \
//       _V_IMAGE_DATA BLOB DEFAULT NULL \
//     )', (_err) => {
//       if (_err) {
//         logger.log("Table already exists." + _err.message);
//       }
//     });
//   }
// });

module.exports = db;
