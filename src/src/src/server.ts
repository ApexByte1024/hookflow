import express from "express";

const app = express();

const PORT = 3000;

app.get("/", (_req, res) => {
  res.json({
    message: "HookFlow API is running",
  });
});

app.listen(PORT, () => {
  console.log(`HookFlow API running on http://localhost:${PORT}`);
});