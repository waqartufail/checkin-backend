const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
require("dotenv").config();

const router = express.Router();

// 🟢 Register User & Send Email
router.post("/register", async (req, res) => {
    try {
      const { name, email } = req.body;
      if (!name || !email) {
        return res.status(400).json({ error: "Name and Email are required!" });
      }
  
      // Check if user already exists
      db.get("SELECT * FROM users WHERE email = ?", [email], async (err, existingUser) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (existingUser) return res.status(400).json({ error: "User already exists!" });
  
        // Generate Random Password
        const password = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(password, 10);
  
        // Insert User into DB
        db.run(
          "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
          [name, email, hashedPassword],
          function (insertErr) {
            if (insertErr) {
              return res.status(500).json({ error: "Error inserting user" });
            }
  
            // ✅ Return Generated Password in Response (No Email Sent)
            res.status(201).json({ 
              message: "User registered successfully!",
              email: email,
              generatedPassword: password 
            });
          }
        );
      });
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
  

// ✅ User Login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
            if (err) return res.status(500).json({ error: "Database error" });
            if (!user) return res.status(401).json({ message: "User not found" });

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) return res.status(401).json({ message: "Invalid password" });

            const token = jwt.sign({ id: user.id, name: user.name }, process.env.JWT_SECRET, { expiresIn: "1h" });

            res.json({
                message: "Login successful",
                id: user.id,
                name: user.name,
                email: user.email,
                token: token
            });
        });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Fetch All Users (excluding "mdhassan.qa90@gmail.com")
router.get("/users", (req, res) => {
    const excludedEmail = "mdhassan.qa90@gmail.com".trim().toLowerCase();

    db.all("SELECT id, name, email FROM users WHERE email <> ?", [excludedEmail], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Failed to fetch users" });
        }
        res.json(rows);
    });
});


module.exports = router;