const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sqlite3 = require("sqlite3").verbose();

// ✅ Load environment variables
dotenv.config();

// ✅ Check if JWT_SECRET is defined
if (!process.env.JWT_SECRET) {
    console.error("❌ ERROR: JWT_SECRET is not defined in .env file!");
    process.exit(1); // Stop the server if secret key is missing
}

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Database setup
const db = new sqlite3.Database("./checkin.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error("❌ Database Connection Error:", err.message);
        process.exit(1);
    }
    console.log("✅ Connected to SQLite database.");
});

// ✅ Create Tables if they don’t exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        name TEXT, 
        email TEXT UNIQUE, 
        password TEXT,
        isCheckedIn INTEGER DEFAULT 0  -- ✅ Added for check-in tracking
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        name TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS checkin_out (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        user_id INTEGER, 
        resource_id INTEGER, 
        action TEXT, 
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (resource_id) REFERENCES resources(id)
    )`);
});

// ✅ Import Routes
const authRoutes = require("./routes/authRoutes");  // Authentication routes
const checkRoutes = require("./routes/checkRoutes"); // Check-In/Out routes

// ✅ Register Routes
app.use("/auth", authRoutes);   // All auth-related routes
app.use("/check", checkRoutes); // All check-in/check-out related routes

// ✅ Test Route
app.get("/", (req, res) => res.send("✅ API Running"));

// ✅ Clear Database Endpoint
app.delete("/admin/clear-db", (req, res) => {
    db.serialize(() => {
        db.run("DELETE FROM users", (err) => {
            if (err) {
                console.error("❌ Error clearing users table:", err.message);
                return res.status(500).json({ error: "Failed to clear users table" });
            }
        });

        db.run("DELETE FROM resources", (err) => {
            if (err) {
                console.error("❌ Error clearing resources table:", err.message);
                return res.status(500).json({ error: "Failed to clear resources table" });
            }
        });

        db.run("DELETE FROM checkin_out", (err) => {
            if (err) {
                console.error("❌ Error clearing checkin_out table:", err.message);
                return res.status(500).json({ error: "Failed to clear check-in/out table" });
            }
        });

        res.json({ message: "✅ Database cleared successfully!" });
    });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));