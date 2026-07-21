// Builds the resident on-boarding guide (SOP) as a PDF, using real
// screenshots captured from the running app.
//
//   npm run guide                      # against http://localhost:3000
//   BASE_URL=http://localhost:3020 npm run guide
//
// It creates a throwaway resident account, walks the first-login journey,
// screenshots each screen, then deletes the account again. Personal details
// in the screenshots are replaced with generic sample text so the guide can
// be handed to every resident.
import "dotenv/config";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  MONGODB_URI,
  BASE_URL = "http://localhost:3000",
  CHROME_PATH,
  GUIDE_FLAT = "104",
} = process.env;

if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const CHROME_CANDIDATES = [
  CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const DEMO_USERNAME = "guide_demo_account";
const DEMO_PASSWORD = "Kp7uEXAMPLE";
const DEMO_NEW_PASSWORD = "Monsoon7Tap";

// Sample values shown in the screenshots instead of real resident details.
const SAMPLE_FLAT = "101";
const SAMPLE_NAME = "Resident Name";

const UserSchema = new mongoose.Schema(
  {
    name: String,
    username: { type: String, unique: true, sparse: true, lowercase: true },
    email: { type: String, unique: true, sparse: true, lowercase: true },
    passwordHash: String,
    role: String,
    flatNumber: String,
    phone: String,
    active: Boolean,
    mustChangePassword: Boolean,
    lastLoginAt: Date,
  },
  { timestamps: true }
);
const FlatSchema = new mongoose.Schema(
  { flatNumber: String, ownerName: String, ownerPhone: String },
  { timestamps: true }
);
const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Flat = mongoose.models.Flat || mongoose.model("Flat", FlatSchema);

const shots = {};

async function capture(page, key, target) {
  const buf = target
    ? await target.screenshot({ type: "png" })
    : await page.screenshot({ type: "png", fullPage: true });
  shots[key] = `data:image/png;base64,${buf.toString("base64")}`;
  console.log(`  · captured ${key}`);
}

/** Swap real resident details for generic sample text before screenshotting. */
async function anonymise(page, realName, realFlat) {
  await page.evaluate(
    (realName, realFlat, sampleName, sampleFlat) => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const n of nodes) {
        let t = n.nodeValue;
        if (!t) continue;
        if (realName) t = t.split(realName).join(sampleName);
        t = t.replace(new RegExp(`\\b${realFlat}\\b`, "g"), sampleFlat);
        // Mask phone numbers.
        t = t.replace(/\b\d{10}\b/g, "98765 43210");
        n.nodeValue = t;
      }
      // Inputs (e.g. the pre-filled username on the login shot).
      for (const el of document.querySelectorAll("input")) {
        if (el.value && realFlat && el.value.includes(realFlat)) {
          el.value = el.value.split(realFlat).join(sampleFlat);
        }
      }
    },
    realName,
    realFlat,
    SAMPLE_NAME,
    SAMPLE_FLAT
  );
}

/** Fail loudly rather than ship a guide containing a real resident's details. */
async function assertNoRealDetails(page, realName, realFlat) {
  const leak = await page.evaluate(
    (realName, realFlat) => {
      const text = document.body.innerText;
      if (realName && text.includes(realName)) return `owner name "${realName}"`;
      if (new RegExp(`\\b${realFlat}\\b`).test(text)) return `flat ${realFlat}`;
      return null;
    },
    realName,
    realFlat
  );
  if (leak) {
    throw new Error(
      `Anonymisation failed — ${leak} is still visible in a screenshot.`
    );
  }
}

async function section(page, selectorText) {
  // Find a card whose heading matches the given text.
  const handle = await page.evaluateHandle((text) => {
    const cards = [...document.querySelectorAll("div")].filter((d) =>
      d.className.includes("rounded-xl") && d.className.includes("border")
    );
    return (
      cards.find((c) => c.innerText.toLowerCase().includes(text.toLowerCase())) ||
      null
    );
  }, selectorText);
  const el = handle.asElement();
  return el;
}

async function main() {
  console.log("→ Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);

  const flatDoc = await Flat.findOne({ flatNumber: GUIDE_FLAT }).lean();
  const realName = flatDoc?.ownerName || "";

  // Fresh throwaway account for the walkthrough.
  await User.deleteOne({ username: DEMO_USERNAME });
  await User.create({
    name: SAMPLE_NAME,
    username: DEMO_USERNAME,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
    role: "resident",
    flatNumber: GUIDE_FLAT,
    active: true,
    mustChangePassword: true,
  });
  console.log(`✓ Temporary demo account created (flat ${GUIDE_FLAT}).`);

  const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) {
    throw new Error(
      "No Chrome/Edge found. Set CHROME_PATH to your browser executable."
    );
  }
  console.log(`→ Using browser: ${executablePath}`);

  const profile = mkdtempSync(join(tmpdir(), "qs-guide-"));
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    userDataDir: profile,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 420, height: 880, deviceScaleFactor: 2 });

    // 1 — Login screen
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0" });
    await page.type("#identifier", `rosalyn_${SAMPLE_FLAT}`);
    await page.type("#password", "••••••••••");
    await capture(page, "login");

    // Reload for a clean form (these are controlled inputs, so the React
    // state must be reset properly), then sign in for real.
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0" });
    await page.type("#identifier", DEMO_USERNAME);
    await page.type("#password", DEMO_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForFunction(
      () => location.pathname === "/change-password",
      { timeout: 15000 }
    );

    // 2 — Forced "set your password" screen
    await capture(page, "setPassword");

    // Complete it.
    await page.type("#new", DEMO_NEW_PASSWORD);
    await page.type("#confirm", DEMO_NEW_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForFunction(() => location.pathname === "/resident", {
      timeout: 15000,
    });
    await new Promise((r) => setTimeout(r, 2500)); // let charts render

    // 3 — Dashboard
    await anonymise(page, realName, GUIDE_FLAT);
    await assertNoRealDetails(page, realName, GUIDE_FLAT);
    await capture(page, "dashboard");

    const kpi = await page.evaluateHandle(() => {
      const g = document.querySelector("main .grid");
      return g || null;
    });
    if (kpi.asElement()) await capture(page, "kpis", kpi.asElement());

    const chart = await section(page, "Daily consumption");
    if (chart) await capture(page, "chart", chart);

    const bill = await section(page, "Bill ·");
    if (bill) await capture(page, "bill", bill);

    // Expand the newest day in History before capturing.
    await page.evaluate(() => {
      const b = document.querySelector('button[aria-expanded="false"]');
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
    const history = await section(page, "History");
    if (history) await capture(page, "history", history);

    const meters = await section(page, "Your meters");
    if (meters) await capture(page, "meters", meters);

    // 4 — Voluntary password change
    await page.goto(`${BASE_URL}/change-password`, {
      waitUntil: "networkidle0",
    });
    await anonymise(page, realName, GUIDE_FLAT);
    await assertNoRealDetails(page, realName, GUIDE_FLAT);
    await capture(page, "changePassword");

    // 5 — Render the guide itself to PDF
    const html = buildHtml(shots);
    const guidePage = await browser.newPage();
    await guidePage.setContent(html, { waitUntil: "networkidle0" });
    const outPath = join(__dirname, "..", "QubecSense-Resident-Guide.pdf");
    await guidePage.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="width:100%;font-size:8pt;color:#94a3b8;padding:0 14mm;
                    font-family:Segoe UI,Arial,sans-serif;display:flex;
                    justify-content:space-between;">
          <span>QubecSense · Resident Guide</span>
          <span class="pageNumber"></span>
        </div>`,
    });
    console.log(`\n✓ Guide written to: ${outPath}`);

    if (process.env.GUIDE_PREVIEW) {
      await guidePage.setViewport({ width: 820, height: 1160 });
      const previewPath = join(__dirname, "..", "guide-preview.png");
      await guidePage.screenshot({ path: previewPath, fullPage: true });
      console.log(`✓ Preview image: ${previewPath}`);
    }
  } finally {
    await browser.close();
    rmSync(profile, { recursive: true, force: true });
    await User.deleteOne({ username: DEMO_USERNAME });
    console.log("✓ Temporary demo account removed.");
    await mongoose.disconnect();
  }
}

function buildHtml(s) {
  const img = (key, caption) =>
    s[key]
      ? `<figure><img src="${s[key]}" alt="${caption}"/><figcaption>${caption}</figcaption></figure>`
      : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; font-size: 11pt; line-height: 1.55; margin: 0; }
  h1 { font-size: 24pt; margin: 0 0 4px; color: #0369a1; }
  h2 { font-size: 15pt; margin: 0 0 10px; color: #0369a1; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
  h3 { font-size: 12pt; margin: 16px 0 6px; }
  p  { margin: 0 0 9px; }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 5px; }
  .lede { color: #475569; font-size: 11.5pt; }
  .step { page-break-inside: avoid; margin-bottom: 22px; }
  .cols { display: flex; gap: 18px; align-items: flex-start; }
  .cols .text { flex: 1 1 56%; min-width: 0; }
  /* Keep wide card screenshots from squeezing the explanation column. */
  .cols figure { flex: 0 0 42%; max-width: 42%; margin: 0; }
  figure { margin: 10px 0; text-align: center; page-break-inside: avoid; }
  figure img { max-width: 100%; max-height: 330px; border: 1px solid #cbd5e1; border-radius: 10px; }
  .cols figure img { max-height: 300px; }
  figcaption { font-size: 8.5pt; color: #64748b; margin-top: 5px; }
  .note { background: #f0f9ff; border-left: 4px solid #0284c7; padding: 9px 12px; margin: 10px 0; border-radius: 0 6px 6px 0; }
  .warn { background: #fff7ed; border-left: 4px solid #f59e0b; padding: 9px 12px; margin: 10px 0; border-radius: 0 6px 6px 0; }
  .page { page-break-after: always; }
  .cover { text-align: center; padding-top: 150px; }
  .cover .logo { font-size: 30pt; font-weight: 700; color: #0369a1; letter-spacing: -0.5px; }
  .cover .sub { color: #475569; font-size: 13pt; margin-top: 6px; }
  .cover .box { margin: 40px auto 0; max-width: 380px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; text-align: left; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 9px; text-align: left; }
  th { background: #f1f5f9; }
  .faq dt { font-weight: 600; margin-top: 10px; }
  .faq dd { margin: 2px 0 0; color: #475569; }
</style></head>
<body>

<div class="page cover">
  <div class="logo">QubecSense</div>
  <div class="sub">Water Meter Portal — Resident Guide</div>
  <div class="box">
    <p style="margin:0 0 6px"><strong>What this guide covers</strong></p>
    <ul style="margin:0">
      <li>Signing in for the first time</li>
      <li>Setting your own password</li>
      <li>Reading your water dashboard</li>
      <li>Checking your bill and daily history</li>
      <li>Changing your password later</li>
    </ul>
  </div>
  <p style="margin-top:36px;color:#94a3b8;font-size:9pt">
    Regency Anantam · Rosalyn-21<br/>
    Your flat number and usage will appear in place of the samples shown here.
  </p>
</div>

<div class="page">
  <h2>1. Signing in for the first time</h2>
  <div class="cols">
    <div class="text">
      <p>Open the portal link given by your society office in any browser on your phone or computer.</p>
      <h3>Your username</h3>
      <p>Your username is the word <strong>rosalyn</strong>, an underscore, and your flat number:</p>
      <table>
        <tr><th>Flat</th><th>Username</th></tr>
        <tr><td>101</td><td>rosalyn_101</td></tr>
        <tr><td>1203</td><td>rosalyn_1203</td></tr>
      </table>
      <h3>Your password</h3>
      <p>Use the one-time password given to you by the society office. Type it exactly — it is case sensitive.</p>
      <div class="note"><strong>Tip:</strong> tap <em>Show</em> next to the password box to check what you typed.</div>
    </div>
    ${img("login", "The sign-in screen")}
  </div>
</div>

<div class="page">
  <h2>2. Creating your own password</h2>
  <div class="cols">
    <div class="text">
      <p>The first time you sign in, you must replace the one-time password with your own. This screen appears automatically.</p>
      <ol>
        <li>Type a new password. It must have <strong>at least 8 characters</strong>,
            including <strong>one capital letter</strong>, <strong>one small
            letter</strong> and <strong>one number</strong>.</li>
        <li>Type the same password again to confirm.</li>
        <li>Tap <strong>Save new password</strong>.</li>
      </ol>
      <p>The tick list under the box turns green as each requirement is met.
         Adding a symbol such as <strong>!</strong> or <strong>@</strong> makes
         it stronger still.</p>
      <div class="note"><strong>Avoid:</strong> your flat number, your username,
        and easy runs like <em>1234</em> or <em>abcd</em> — these are not accepted.</div>
      <p>You go straight to your dashboard. From then on, sign in with your <em>new</em> password.</p>
      <div class="warn"><strong>Please note:</strong> the one-time password stops working once you set your own. Choose something you will remember.</div>
      <div class="note">Nobody at the society can see your password — if you forget it, the office issues a fresh one-time password.</div>
    </div>
    ${img("setPassword", "Setting your own password")}
  </div>
</div>

<div class="page">
  <h2>3. Your dashboard at a glance</h2>
  <p class="lede">After signing in you land on <strong>My Water</strong> — everything about your flat's water use, in one screen.</p>
  ${img("dashboard", "The complete resident dashboard")}
  <p>The sections are explained one by one on the following pages.</p>
</div>

<div class="page">
  <h2>4. This month and your bill</h2>
  ${img("kpis", "Summary cards at the top of the dashboard")}
  <h3>This month</h3>
  <p>Total water used by your flat since the 1st of the current month, in litres (L). It updates every day as new meter readings arrive.</p>
  <h3>Estimated bill</h3>
  <p>What that usage costs so far this month, using the rates set by your society. It grows through the month and is final only at month end.</p>
  <div class="note"><strong>1,000 litres = 1 kilolitre (kL)</strong>, which is the unit water rates are usually quoted in.</div>
</div>

<div class="page">
  <h2>5. Daily consumption chart</h2>
  <div class="cols">
    <div class="text">
      <p>One bar per day, so you can spot which days you used more water.</p>
      <ul>
        <li><strong>Dark blue</strong> — kitchen meter</li>
        <li><strong>Teal</strong> — bathroom meter</li>
      </ul>
      <p>The two colours are stacked, so the full height of a bar is your total for that day.</p>
      <p>Tap or hover over a bar to see the exact litres.</p>
      <div class="note">A day that is much taller than the rest usually means guests, tank filling, or a tap left running.</div>
    </div>
    ${img("chart", "Daily consumption")}
  </div>
</div>

<div class="page">
  <h2>6. Your bill breakdown</h2>
  <div class="cols">
    <div class="text">
      <p>This shows exactly how your bill was calculated.</p>
      <ul>
        <li>Each line is a <strong>slab</strong> — a band of usage charged at its own rate per 1,000 litres.</li>
        <li><strong>Fixed charge</strong> is a flat monthly amount, the same for every flat.</li>
        <li><strong>Total so far</strong> is the sum of the lines above.</li>
      </ul>
      <p>If your society charges more per litre above a certain usage, you will see a second slab line appear once you cross it.</p>
    </div>
    ${img("bill", "Bill breakdown")}
  </div>
</div>

<div class="page">
  <h2>7. History — hour by hour</h2>
  <div class="cols">
    <div class="text">
      <p>History lists each day with the total litres used.</p>
      <p><strong>Tap any day</strong> to open it. You then see that day split into <strong>2-hour blocks</strong>, from 00:00 (midnight) to 22:00.</p>
      <p>This tells you <em>when</em> the water was used — morning baths, evening cooking, and so on.</p>
      <div class="warn"><strong>Worth checking:</strong> if you see steady water use between midnight and 5 a.m. when nobody is awake, you may have a leaking tap or flush. Report it to the office.</div>
      <p>Tap the day again to close it.</p>
    </div>
    ${img("history", "History with one day opened")}
  </div>
</div>

<div class="page">
  <h2>8. Your meters</h2>
  <div class="cols">
    <div class="text">
      <p>Your flat normally has two meters — <strong>kitchen</strong> and <strong>bathroom</strong>.</p>
      <p>For each one you can see:</p>
      <ul>
        <li>The date of the <strong>latest reading</strong> received.</li>
        <li>The <strong>totalizer</strong> — the lifetime running total on that meter, exactly like a car odometer. It only ever goes up.</li>
      </ul>
      <div class="note">Your monthly usage is the difference between totalizer readings, so a large totalizer number is completely normal.</div>
    </div>
    ${img("meters", "Your meters")}
  </div>
</div>

<div class="page">
  <h2>9. Changing your password later</h2>
  <div class="cols">
    <div class="text">
      <p>Tap <strong>Password</strong> in the bottom menu at any time.</p>
      <ol>
        <li>Enter your current password.</li>
        <li>Enter the new password twice.</li>
        <li>Tap <strong>Save new password</strong>.</li>
      </ol>
      <p>To sign out, use the exit icon in the top-right corner of the screen.</p>
    </div>
    ${img("changePassword", "Changing your password")}
  </div>

  <h2 style="margin-top:26px">Common questions</h2>
  <dl class="faq">
    <dt>I forgot my password.</dt>
    <dd>Contact the society office. They will issue a new one-time password, and you set your own again on the next sign-in.</dd>
    <dt>My dashboard says no readings yet.</dt>
    <dd>Your meters have not sent data so far. This is normal just after installation — please check again in a day or two.</dd>
    <dt>My usage looks far too high.</dt>
    <dd>Open History and look at the 2-hour blocks. Continuous use overnight almost always means a leak. Report it to the office.</dd>
    <dt>Can I see other flats?</dt>
    <dd>No. You only ever see your own flat's meters and bill.</dd>
    <dt>Is the estimated bill the final amount?</dt>
    <dd>No. It grows during the month and is confirmed by the society at month end.</dd>
  </dl>

  <p style="margin-top:24px;color:#64748b;font-size:9.5pt">
    For any help with the portal, contact your society office.
  </p>
</div>

</body></html>`;
}

main().catch((err) => {
  console.error("✗ Guide generation failed:", err);
  process.exit(1);
});
