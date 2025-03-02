require("dotenv").config(); // Load environment variables

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const path = require("path"); // <-- Import path module

const app = express();
const PORT = 3000;

// PostgreSQL Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("render.com") ? { rejectUnauthorized: false } : false,
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // <-- Serve static files

// Route to serve GEA.html
app.get("/gea", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "GEA.html"));
});

// Create table if it doesn't exist
const createTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      );
    `);
    console.log("✅ Table ensured.");
  } catch (error) {
    console.error("❌ Error creating table:", error);
  }
};
createTable();

// Handle Signup
app.post("/signup", async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  try {
    await pool.query("INSERT INTO signups (name, email) VALUES ($1, $2)", [name, email]);
    res.status(200).json({ message: "✅ Signup successful" });
  } catch (error) {
    console.error("❌ Signup error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
