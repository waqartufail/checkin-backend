const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./checkin.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) console.error(err.message);
    console.log("✅ Connected to SQLite database.");
});

// Create Tables
db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS resources (id INTEGER PRIMARY KEY, name TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS checkin_out (id INTEGER PRIMARY KEY, user_id INTEGER, resource_id INTEGER, action TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);

module.exports = db;
