import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

// Capture actual GG Analytics screens against a disposable local Git fixture.
// No external repository or remote is contacted; all data is synthetic.
const root = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gg-screenshots-"));
const repository = path.join(fixtureRoot, "repository");
const base = "http://127.0.0.1:4443";
const app = "http://127.0.0.1:4444";
const year = new Date().getFullYear();
const now = new Date();
const months = Array.from({ length: 8 }, (_, index) =>
  new Date(year, 0, 2 + Math.floor(index * (Math.max(2, now.getTime() -
    new Date(year, 0, 1).getTime()) / (8 * 86_400_000))))
);

function git(args, author) {
  execFileSync("git", ["-C", repository, ...args], {
    stdio: "pipe",
    env: author ? { ...process.env,
      GIT_AUTHOR_DATE: author.date, GIT_COMMITTER_DATE: author.date } : process.env
  });
}
function authorCommit(name, email, subject, date) {
  git(["add", "-A"]);
  git(["-c", "user.name=" + name, "-c", "user.email=" + email, "commit", "-m", subject],
    { date: date.toISOString() });
}
async function json(url, init) {
  const response = await fetch(base + url, {
    ...init, headers: init?.body ? { "content-type": "application/json" } : undefined
  });
  if (!response.ok) throw new Error(url + " returned " + response.status + ": " +
    (await response.text()).slice(0, 500));
  return response.json();
}
async function waitReady() {
  for (let n = 0; n < 150; n++) {
    try { const response = await fetch(base + "/api/health"); if (response.ok) return; }
    catch { /* The API is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("GG Analytics API did not start");
}
async function waitRun(id) {
  for (let n = 0; n < 150; n++) {
    const run = await json("/api/refresh-runs/" + id);
    if (run.status === "succeeded") return;
    if (run.status === "failed") throw new Error(run.errorMessage || "Refresh failed");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Timed out waiting for analytics refresh");
}
let browser;
try {
  fs.mkdirSync(repository, { recursive: true });
  git(["init", "--initial-branch=main"]);
  const changes = [
    ["Avery Chen","avery@example.test","src/dashboard.ts","Dashboard visualization","typescript"],
    ["Jordan Lee","jordan@example.test","src/metrics.ts","Contributor statistics","typescript"],
    ["Morgan Patel","morgan@example.test","tests/metrics.test.ts","Metrics coverage","typescript"],
    ["Avery Chen","avery@example.test","src/dashboard.ts","Improve dashboard filtering","typescript"],
    ["Jordan Lee","jordan@example.test","docs/metrics.md","Document contribution metrics","markdown"],
    ["Morgan Patel","morgan@example.test","src/identity.ts","Identity matching","typescript"],
    ["Avery Chen","avery@example.test","src/metrics.ts","Improve analysis accuracy","typescript"],
    ["Jordan Lee","jordan@example.test","tests/dashboard.test.ts","Add regression checks","typescript"]
  ];
  for (const [i, entry] of changes.entries()) {
    const [name, email, relative, subject, kind] = entry;
    const target = path.join(repository, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target,
      kind === "markdown" ? "# " + subject + "\n" :
      "// " + subject + "\nexport const metric" + i + " = " + (i + 1) + ";\n");
    authorCommit(name,email,subject,months[i]);
  }

  await waitReady();
  const project = await json("/api/projects", {method:"POST", body:JSON.stringify({
    name:"GG Analytics Demo", description:"Local, synthetic sample data for documentation"
  })});
  const added = await json("/api/projects/" + project.id + "/repositories", {
    method:"POST",body:JSON.stringify({input:repository,name:"sample-repository"})
  });
  if (!added.id) throw new Error("Screenshot fixture repository was not registered");
  const refresh = await json("/api/projects/" + project.id + "/refresh", { method:"POST" });
  await waitRun(refresh.id);
  const annual = await json("/api/projects/" + project.id + "/annual/reindex", { method:"POST" });
  await waitRun(annual.id);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: {width:1440,height:900},
    deviceScaleFactor: 1, colorScheme:"dark", reducedMotion:"reduce" });
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push("Uncaught: " + error.message));
  page.on("console", message => {
    if (message.type() === "error") browserErrors.push("Console: " + message.text());
  });
  async function capture(name) {
    await page.evaluate(async () => { await document.fonts.ready; });
    if (await page.locator("nextjs-portal").count()) {
      throw new Error("Next.js development overlay detected: use a production web server");
    }
    if (browserErrors.length) {
      throw new Error("Browser errors prevented clean screenshots:\n" + browserErrors.join("\n"));
    }
    await page.screenshot({path:path.join(root,"assets",name+".png"),animations:"disabled"});
  }
  await page.goto(app, { waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", {name:"GG Analytics"})).toBeVisible({timeout:30000});
  await expect(page.getByText("GG Analytics Demo").first()).toBeVisible();
  // Readable screenshots, consistent viewport and no flaky animation frames.
  await capture("app");
  await page.getByRole("tab",{name:"Contributors",exact:true}).click();
  await capture("contributors");
  await page.getByRole("tab",{name:"Files & focus",exact:true}).click();
  await capture("files");
  console.log("Captured GG Analytics screenshots: app, contributors, files");
} finally {
  if (browser) await browser.close();
  fs.rmSync(fixtureRoot,{recursive:true,force:true});
}
