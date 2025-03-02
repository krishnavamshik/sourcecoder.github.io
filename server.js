const express = require("express");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const PORT = 3000;
const SIGNUPS_FILE = "signups.json";

app.use(cors());
app.use(bodyParser.json());

// Serve static files from the current directory
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "GEA.html"));
});

// Load existing signups
const loadSignups = () => {
  try {
    return JSON.parse(fs.readFileSync(SIGNUPS_FILE));
  } catch (error) {
    return [];
  }
};

// Save new signup
const saveSignup = (signup) => {
  const signups = loadSignups();
  signups.push(signup);
  fs.writeFileSync(SIGNUPS_FILE, JSON.stringify(signups, null, 2));
};

app.post("/signup", (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }
  saveSignup({ name, email });
  res.status(200).json({ message: "Signup successful" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
