const express = require("express");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

const SIGNUPS_FILE = "signups.json";

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

app.get("/signups", (req, res) => {
    res.json(loadSignups());
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
