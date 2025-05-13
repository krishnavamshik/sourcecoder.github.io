require("dotenv").config(); // Load environment variables

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const path = require("path");

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

    // Add a new table for feedback
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        topic_vote TEXT NOT NULL,
        feedback TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Tables ensured.");
  } catch (error) {
    console.error("❌ Error creating tables:", error);
  }
};
createTable();

// Signup endpoint
app.post("/signup", async (req, res) => {
  console.log("📩 Received signup request:", req.body);

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
    console.log("✅ Inserted into DB:", result.rows[0]);
    res.status(200).json({ message: "✅ Signup successful" });
  } catch (error) {
    console.error("❌ Signup error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// Feedback endpoint
app.post("/feedback", async (req, res) => {
  console.log("📩 Received feedback request:", req.body);

  const { email, topic_vote, feedback } = req.body;

  if (!email || !topic_vote || !feedback) {
    console.log("❌ Missing required fields");
    return res.status(400).json({ error: "Email, topic vote, and feedback are required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO feedback (email, topic_vote, feedback) VALUES ($1, $2, $3) RETURNING *",
      [email, topic_vote, feedback]
    );

    console.log("✅ Feedback inserted into DB:", result.rows[0]);
    res.status(200).json({ message: "✅ Feedback submitted successfully" });
  } catch (error) {
    console.error("❌ Feedback submission error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// Default route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀  Server running on port ${PORT}`);
});