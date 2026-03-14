// index.js
const express = require("express");
const mongoose = require("mongoose");
const User = require("./models/User"); // Make sure this is a valid Mongoose model
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");
const pm2 = require("pm2");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const secretkey =env.secret;

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// ---------------- Mongoose Connection ----------------
async function conn() {
  try {
    await mongoose.connect(
      "env.url"
    );
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
  }
}
conn();

// ---------------- JWT Middleware ----------------
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ valid: false });

  const token = authHeader.split(" ")[1]; // Bearer <token>
  try {
    const decoded = jwt.verify(token, secretkey);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ valid: false });
  }
};

app.get('/protected', (req, res) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ valid: false });

  const token = authHeader.split(" ")[1]; // Bearer <token>
  try {
    const decoded = jwt.verify(token, secretkey);
    if (!decoded) return res.status(401).json({ valid: false });

    // Only send validation result
    res.json({ valid: true });
  } catch (err) {
    res.status(401).json({ valid: false });
  }
});

// ---------------- User Routes ----------------
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const user = new User({ name, email, password });
    await user.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: "Error registering user" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email, password });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, secretkey, { expiresIn: "1h" });
    res.json({ token });
  } catch {
    res.status(500).json({ error: "Error logging in" });
  }
});

// ---------------- Deployment Schema ----------------
const deploymentSchema = new mongoose.Schema({
  deploymentId: String,
  repoUrl: String,
  repoName: String,
  folderName: String,
  port: Number,
  status: String,
});

const Deployment = mongoose.model("Deployment", deploymentSchema);

// ---------------- Helpers ----------------
function generateId(length = 10) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < length; i++)
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

async function getFreePort() {
  const last = await Deployment.findOne().sort({ port: -1 });
  return last ? last.port + 1 : 5000;
}

function getRepoName(repoUrl) {
  return repoUrl.split("/").pop().replace(".git", "");
}

// ---------------- Clone Repo ----------------
function cloneRepo(repoUrl, id) {
  const folderName = `deploy_${id}`;
  const folderPath = path.join(os.homedir(), "Pictures", folderName);

  if (!fs.existsSync(path.join(os.homedir(), "Pictures"))) {
    fs.mkdirSync(path.join(os.homedir(), "Pictures"));
  }

  return new Promise((resolve, reject) => {
    console.log(`Cloning repo into ${folderPath}...`);
    const git = spawn("git", ["clone", repoUrl, folderPath], {
      shell: true,
      stdio: "inherit",
    });

    git.on("close", (code) => {
      if (code !== 0) return reject(new Error(`git clone failed with code ${code}`));
      resolve({ folderPath, folderName });
    });

    git.on("error", (err) => reject(err));
  });
}

// ---------------- Install Dependencies ----------------
function installDependencies(folderPath) {
  return new Promise((resolve, reject) => {
    console.log(`Installing dependencies in ${folderPath}...`);
    const npm = spawn("npm", ["install"], { cwd: folderPath, shell: true, stdio: "inherit" });

    npm.on("close", (code) => {
      if (code !== 0) return reject(new Error(`npm install failed with code ${code}`));
      resolve();
    });

    npm.on("error", (err) => reject(err));
  });
}

// ---------------- Start App with PM2 ----------------
function startApp(folderPath, port, id) {
  if (!folderPath) {
    console.error("Error: folderPath is undefined");
    return;
  }

  const packageJsonPath = path.join(folderPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.error("Error: package.json not found in", folderPath);
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
  const mainScript = packageJson.main || "server.js";

  pm2.connect((err) => {
    if (err) {
      console.error("PM2 connect error:", err);
      return;
    }

    pm2.start(
      {
        name: `deploy_${id}`,
        script: path.join(folderPath, mainScript),
        cwd: folderPath,
        env: { PORT: port },
      },
      (err) => {
        if (err) console.error("PM2 start error:", err);
        else console.log(`App deploy_${id} started on port ${port}`);
        pm2.disconnect();
      }
    );
  });
}

// ---------------- Deploy API ----------------
app.post("/deploy", authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "repoUrl required" });

    const id = generateId();
    const port = await getFreePort();
    const { folderPath, folderName } = await cloneRepo(url, id);

    await installDependencies(folderPath);
    startApp(folderPath, port, id);

    await Deployment.create({
      deploymentId: id,
      repoUrl: url,
      repoName: getRepoName(url),
      folderName,
      port,
      status: "running",
    });

    res.json({
      success: true,
      id,
      port,
      url: `http://localhost:${3000}/${id}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Proxy Router ----------------
app.use("/:id", async (req, res, next) => {
  const deployment = await Deployment.findOne({ deploymentId: req.params.id });
  if (!deployment) return res.status(404).send("Deployment not found");

  const proxy = createProxyMiddleware({
    target: `http://localhost:${deployment.port}`,
    changeOrigin: true,
  });

  proxy(req, res, next);
});

// ---------------- Start Express ----------------
app.listen(3000, () => console.log("Server running on port 3000"));
