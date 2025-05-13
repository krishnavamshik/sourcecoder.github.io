require("dotenv").config(); // Load environment variables

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

const app = express();
const PORT = 3000;

// ─────────────────────────────────────────────────────────────────────────────
// Database connection
// ─────────────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Gemini AI client
// ─────────────────────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// read reusable prompt template (prompts/roadmap_prompt.txt)
const promptTemplate = fs.readFileSync(
  path.join(__dirname, "roadmap_prompt.txt"),
  "utf8"
);

// helper: inject user answers into template
function fillTemplate(tpl, vals) {
  return tpl
    .replace("[goal]", vals.learningGoal)
    .replace("[MATH_PROFICIENCY]", vals.proficiency_math)
    .replace("[CODING_PROFICIENCY]", vals.proficiency_coding)
    .replace("[PURPOSE]", vals.purpose)
    .replace("[TIME_INVESTMENT]", vals.timeInvestment);
}

// call Gemini and return clean mermaid text
async function askGemini(promptStr) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(promptStr);
  const rawText = result.response.text();
  console.log(rawText)

  // Clean up the Mermaid syntax
  let mermaidText = rawText;

  // Remove markdown code fences if present
  mermaidText = mermaidText.replace(/```mermaid\s*/g, '').replace(/```\s*$/g, '');

  // Ensure it starts with "graph"
  if (!mermaidText.trim().startsWith('graph')) {
    mermaidText = 'graph TD\n' + mermaidText;
  }

  // Basic validation - make sure it has nodes
  if (!mermaidText.includes('-->') && !mermaidText.includes('---')) {
    mermaidText = `graph TD
    A[Start: ${promptStr.substring(0, 20)}...] --> B[Core Concepts]
    B --> C[Practice & Application]
    C --> D[Mastery]`;
  }

  // Make sure there's no HTML or other non-mermaid content
  mermaidText = mermaidText.split('\n')
    .filter(line => !line.trim().startsWith('<'))
    .join('\n');

  // Remove parentheses
  mermaidText = mermaidText.replace(/[()]/g, '');
  mermaidText = ensureHasEdges(mermaidText);

  console.log("Cleaned Mermaid diagram:", mermaidText);
  return mermaidText;
}

function ensureHasEdges(src) {
  const edgeCount = (src.match(/-->/g) || []).length;
  if (edgeCount >= 3) return src;                      // looks fine already

  // Collect every node id “[id[” (before first “[”)
  const nodeLines = src.split("\n").filter(l => /\[/.test(l));
  const ids = nodeLines.map(l => l.match(/^(\w+)/)?.[1]).filter(Boolean);
  if (!ids.length) return src; // nothing we can do

  let repaired = "graph LR\n";
  nodeLines.forEach((ln, i) => {
    repaired += ln + "\n";
    if (i < ids.length - 1) repaired += `${ids[i]} --> ${ids[i + 1]}\n`;
  });
  return repaired;
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: "*",
    methods: "GET,POST",
    allowedHeaders: "Content-Type",
  })
);
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query('SELECT current_database(), current_schema()');
  console.log('🔍 Connected to:', res.rows);
  await client.end();
})();

// ─────────────────────────────────────────────────────────────────────────────
// Ensure tables exist
// ─────────────────────────────────────────────────────────────────────────────
async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      topic_vote TEXT NOT NULL,
      feedback TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS roadmaps (
      id SERIAL PRIMARY KEY,
      learning_goal TEXT NOT NULL,
      math_proficiency TEXT NOT NULL,
      coding_proficiency TEXT NOT NULL,
      purpose TEXT NOT NULL,
      time_investment TEXT NOT NULL,
      roadmap TEXT NOT NULL        -- stores pure Mermaid
    );
  `);

  console.log("✅ Tables ensured.");
}
createTables();

// ─────────────────────────────────────────────────────────────────────────────
// /generate-roadmap  ➜  reuse‑or‑create‑and‑cache
// ─────────────────────────────────────────────────────────────────────────────
app.post("/generate-roadmap", async (req, res) => {
  const {
    learningGoal,
    proficiency_math,
    proficiency_coding,
    purpose,
    timeInvestment,
  } = req.body;

  if (
    !learningGoal ||
    !proficiency_math ||
    !proficiency_coding ||
    !purpose ||
    !timeInvestment
  ) {
    return res
      .status(400)
      .json({ success: false, error: "All fields are required" });
  }

  try {
    // 1️⃣  look for an existing roadmap with identical parameters
    const { rows } = await pool.query(
      `SELECT roadmap FROM roadmaps
       WHERE learning_goal=$1
         AND math_proficiency=$2
         AND coding_proficiency=$3
         AND purpose=$4
         AND time_investment=$5
       LIMIT 1`,
      [
        learningGoal,
        proficiency_math,
        proficiency_coding,
        purpose,
        timeInvestment,
      ]
    );

    if (rows.length) {
      console.log("♻️  Reusing cached roadmap");
      // Return the raw mermaid text directly from the database
      return res.json({ success: true, roadmap: rows[0].roadmap });
    }

    // 2️⃣  build Gemini prompt and request a new roadmap
    const prompt = fillTemplate(promptTemplate, {
      learningGoal,
      proficiency_math,
      proficiency_coding,
      purpose,
      timeInvestment,
    });

    console.log("📨 Prompt sent to Gemini");
    const mermaid = await askGemini(prompt);

    // 3️⃣  store raw mermaid text in DB for future reuse
    const insertQuery = `
    INSERT INTO roadmaps
    (learning_goal, math_proficiency, coding_proficiency, purpose, time_investment, roadmap)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;

    await pool.query(insertQuery, [
      learningGoal,
      proficiency_math,
      proficiency_coding,
      purpose,
      timeInvestment,
      mermaid
    ]);

    console.log("✅ New roadmap cached");
    res.json({ success: true, roadmap: mermaid });
  } catch (err) {
    console.error("❌ Roadmap generation error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Other existing routes (signup, feedback, etc.)
// ─────────────────────────────────────────────────────────────────────────────
app.post("/signup", async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }
  try {
    await pool.query(
      "INSERT INTO signups (name, email) VALUES ($1,$2)",
      [name, email]
    );
    res.json({ message: "✅ Signup successful" });
  } catch (e) {
    console.error("Signup error:", e);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/feedback", async (req, res) => {
  const { email, topic_vote, feedback } = req.body;
  if (!email || !topic_vote || !feedback) {
    return res
      .status(400)
      .json({ error: "Email, topic vote, and feedback are required" });
  }
  try {
    await pool.query(
      "INSERT INTO feedback (email, topic_vote, feedback) VALUES ($1,$2,$3)",
      [email, topic_vote, feedback]
    );
    res.json({ message: "✅ Feedback submitted successfully" });
  } catch (e) {
    console.error("Feedback error:", e);
    res.status(500).json({ error: "Database error" });
  }
});

// default route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// ─────────────────────────────────────────────────────────────────────────────
// start server
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Server running on port ${PORT}`);
});