// server.js
const express = require("express");
const { runScan } = require("./scannerService");

const app = express();
app.use(express.json());

app.get("/api/scan", async (req, res) => {
  try {
    const accountSize = Number(req.query.accountSize || 10000);
    const riskPct = Number(req.query.riskPct || 0.02);
    const result = await runScan(accountSize, riskPct);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scan failed", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Scanner API running on port ${PORT}`);
});