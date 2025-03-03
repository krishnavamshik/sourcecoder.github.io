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

app.use(cors({
    origin: "*", // Allow all origins
    methods: "GET,POST",
    allowedHeaders: "Content-Type",
  }));
  
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
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

app.post("/signup", async (req, res) => {
    console.log("📩 Received signup request:", req.body); // Log the request
    
    const { name, email } = req.body;
    if (!name || !email) {
      console.log("❌ Missing name or email");
      return res.status(400).json({ error: "Name and email are required" });
    }
  
    try {
      const result = await pool.query(
        "INSERT INTO signups (name, email) VALUES ($1, $2) RETURNING *",
        [name, email]
      );
      console.log("✅ Inserted into DB:", result.rows[0]); // Log inserted data
      res.status(200).json({ message: "✅ Signup successful" });
    } catch (error) {
      console.error("❌ Signup error:", error);
      res.status(500).json({ error: "Database error" });
    }
  });

app.get("/", (req, res) => {
    res.send("Backend is running!");
});


// Start Server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
