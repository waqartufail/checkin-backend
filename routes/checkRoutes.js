const express = require("express");
const db = require("../config/db"); // Ensure correct DB connection
module.exports = (io) => {
  const router = express.Router();
// ✅ Ensure `isCheckedIn` column exists in `users`
// db.run(`ALTER TABLE users ADD COLUMN isCheckedIn INTEGER DEFAULT 0`, (err) => {
//   if (err && !err.message.includes("duplicate column")) {
//     console.error("Error adding isCheckedIn column:", err.message);
//   }
// });

// ✅ Check-In API
router.post("/checkin", (req, res) => {
  console.log("➡️ Check-in API hit at:", new Date().toISOString());
  console.log("📥 Received payload:", req.body);
  const checkinTime = new Date().toISOString(); // Current timestamp
  const { user_id } = req.body;
  if (!user_id) {
      console.warn("⚠️ Missing user ID");
      return res.status(400).json({ error: "User ID is required" });
  }

  // Fetch user details for notification
  db.get("SELECT name FROM users WHERE id = ?", [user_id], (err, user) => {
      if (err) {
          console.error("❌ Database error fetching user:", err.message);
          return res.status(500).json({ error: "Database error", details: err.message });
      }

      if (!user) {
          console.warn("⚠️ User not found with ID:", user_id);
          return res.status(404).json({ error: "User not found" });
      }

      // ✅ Update `isCheckedIn` status first
      db.run("UPDATE users SET isCheckedIn = 1 WHERE id = ?", [user_id], function (updateErr) {
          if (updateErr) {
              console.error("❌ Error updating user status:", updateErr.message);
              return res.status(500).json({ error: "Failed to update user status", details: updateErr.message });
          }

          console.log(`✅ User ${user_id} marked as checked in (Rows affected: ${this.changes})`);

          // ✅ Insert into `checkin_out` table
          db.run("INSERT INTO checkin_out (user_id, action,timestamp) VALUES (?, 'checkin',?)", [user_id,checkinTime], function (insertErr) {
              if (insertErr) {
                  console.error("❌ Error inserting check-in record:", insertErr.message);
                  return res.status(500).json({ error: "Check-in failed", details: insertErr.message });
              }

              console.log(`✅ Check-in recorded (ID: ${this.lastID})`);

              // ✅ Emit Notification to Admins
              const notificationMessage = `${user.name || "Unknown User"} has Checked In`;
              console.log("📢 Emitting event:", notificationMessage);
              io.emit("newCheckIn", { message: notificationMessage });

              // ✅ Send response
              res.json({ message: "Check-in successful", checkin_id: this.lastID });
          });
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

  query += " ORDER BY id ASC"; // Sorting by ascending order ensures correct pairing
  let query1 = `SELECT * FROM checkin_out WHERE 1=1 AND user_id =${user_id} AND timestamp >=${start_date} AND timestamp <=${end_date}`;
  db.all(query, params, (err, rows) => {
    console.log(query1);
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
          id : record.id,
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

// ✅ Get Online Users (Checked-In Users)
router.get("/online-users", (req, res) => {
  const query = `
    SELECT u.id, u.name, u.isCheckedIn, 
           (SELECT timestamp FROM checkin_out 
            WHERE checkin_out.user_id = u.id 
            ORDER BY timestamp DESC 
            LIMIT 1) AS checkin_time
    FROM users u
    WHERE u.isCheckedIn = 1
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Error fetching online users:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

// ✅ Update Check Out Time
router.put("/update-checkout/:id", (req, res) => {
  const { checkout_time } = req.body;
  const { id } = req.params;

  console.log("🔹 Received Request:");
  console.log("  ID:", id);
  console.log("  Check-Out Time:", checkout_time);

  if (!checkout_time || !id) {
      console.error("❌ Missing Required Data");
      return res.status(400).json({ error: "Missing check-out time or ID" });
  }

  const query2 = `UPDATE checkin_out SET timestamp = '${checkout_time}' WHERE id = ${id} AND action = 'checkout'`;
  const query = `UPDATE checkin_out SET timestamp = ? WHERE id = ? AND action = 'check-out'`;
  db.run(query2, function (err) {
    console.log(query);
    console.log(query2);
      if (err) {
          console.error("❌ Error updating checkout time:", err);
          return res.status(500).json({ error: "Failed to update checkout time" });
      }

      if (this.changes === 0) {
          console.warn("⚠ No rows updated. Check if ID and action match.");
          return res.status(404).json({ error: "No matching record found to update" });
      }

      console.log("✅ Check-Out Time Updated Successfully!");
      res.json({ message: "✅ Check-Out Time Updated!" });
  });
});

//module.exports = router;
return router;
};