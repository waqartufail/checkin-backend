const express = require("express");
const db = require("../config/db"); // Ensure correct DB connection
const router = express.Router();

// ✅ Ensure `isCheckedIn` column exists in `users`
db.run(`ALTER TABLE users ADD COLUMN isCheckedIn INTEGER DEFAULT 0`, (err) => {
  if (err && !err.message.includes("duplicate column")) {
    console.error("Error adding isCheckedIn column:", err.message);
  }
});

// ✅ Check-In API
router.post("/checkin", (req, res) => {
  const { user_id } = req.body; // Changed from userId to user_id

  if (!user_id) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const checkinQuery = `INSERT INTO checkin_out (user_id, action) VALUES (?, 'checkin')`;

  db.run(checkinQuery, [user_id], function (err) {
    if (err) {
      console.error("Check-in error:", err);
      return res.status(500).json({ error: "Check-in failed" });
    }

    // ✅ Update `isCheckedIn` status
    db.run(`UPDATE users SET isCheckedIn = 1 WHERE id = ?`, [user_id], (updateErr) => {
      if (updateErr) {
        return res.status(500).json({ error: "Failed to update user status", details: updateErr.message });
      }

      res.json({ message: "Check-in successful", checkin_id: this.lastID });
    });
  });
});

// ✅ Check-Out API
router.post("/checkout", (req, res) => {
  const { user_id } = req.body; // Changed from userId to user_id

  if (!user_id) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const checkoutQuery = `INSERT INTO checkin_out (user_id, action) VALUES (?, 'checkout')`;

  db.run(checkoutQuery, [user_id], function (err) {
    if (err) {
      console.error("Check-out error:", err);
      return res.status(500).json({ error: "Check-out failed" });
    }

    // ✅ Update `isCheckedIn` status
    db.run(`UPDATE users SET isCheckedIn = 0 WHERE id = ?`, [user_id], (updateErr) => {
      if (updateErr) {
        return res.status(500).json({ error: "Failed to update user status", details: updateErr.message });
      }

      res.json({ message: "Check-out successful", checkout_id: this.lastID });
    });
  });
});

// ✅ Check User Status API
router.get("/check-status/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    // Query to get user check-in status
    db.get("SELECT isCheckedIn FROM users WHERE id = ?", [user_id], (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });

      if (!row) return res.status(404).json({ message: "User not found" });

      res.json({ user_id, isCheckedIn: row.isCheckedIn });
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});


// ✅ Get Check-In/Out History
router.get("/history", (req, res) => {
  const { user_id, start_date, end_date } = req.query;

  let query = "SELECT * FROM checkin_out WHERE 1=1"; // Always true condition
  let params = [];

  // Add optional filters
  if (user_id) {
    query += " AND user_id = ?";
    params.push(user_id);
  }
  if (start_date) {
    query += " AND timestamp >= ?";
    params.push(`${start_date} 00:00:00`); // Ensure full-day coverage
  }
  if (end_date) {
    query += " AND timestamp <= ?";
    params.push(`${end_date} 23:59:59`); // Ensure full-day coverage
  }

  query += " ORDER BY timestamp ASC"; // Sorting by ascending order ensures correct pairing

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("History fetch error:", err);
      return res.status(500).json({ error: "Failed to fetch history" });
    }

    let sessions = [];
    let checkInStack = {}; // Store check-ins by user_id

    for (let record of rows) {
      if (record.action === "checkin") {
        checkInStack[record.user_id] = record; // Store latest check-in
      } else if (record.action === "checkout" && checkInStack[record.user_id]) {
        let checkInRecord = checkInStack[record.user_id];
        let checkInTime = new Date(checkInRecord.timestamp);
        let checkOutTime = new Date(record.timestamp);

        let durationMs = checkOutTime - checkInTime;
        let durationMinutes = Math.floor(durationMs / (1000 * 60)); // Convert to minutes
        let durationHours = (durationMinutes / 60).toFixed(2); // Convert to hours (2 decimals)

        let durationFormatted = durationMinutes < 60 ? `${durationMinutes} min` : `${durationHours} hr`;

        sessions.push({
          user_id: record.user_id,
          checkin_time: checkInRecord.timestamp,
          checkout_time: record.timestamp,
          duration: durationFormatted,
        });

        delete checkInStack[record.user_id]; // Remove matched check-in
      }
    }

    res.json(sessions); // ✅ Return sessions instead of rows
  });
});

module.exports = router;