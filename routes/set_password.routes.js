const express = require("express");
const bcrypt  = require("bcryptjs");
const PasswordResetToken = require("../models/PasswordResetToken.model");
const User    = require("../models/User.model");
const Staff   = require("../models/Staff.model");
const Student = require("../models/Student.model");

const router = express.Router();

// ── GET /set-password?token=xxx ───────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send(errorPage("Invalid link", "No token provided."));

  const record = await PasswordResetToken.findOne({ token, used: false });
  if (!record)                    return res.status(400).send(errorPage("Link expired or already used", "Please ask your administrator to resend the invitation."));
  if (new Date() > record.expires_at) return res.status(400).send(errorPage("Link expired", "This link has expired. Please ask your administrator to resend the invitation."));

  let displayName = "Staff Member";
  try {
    if (record.user_type === "staff") {
      const s = await Staff.findOne({ staff_id: record.user_id }).lean();
      if (s) displayName = s.full_name;
    } else if (record.user_type === "student") {
      const s = await Student.findOne({ student_id: record.user_id }).lean();
      if (s) displayName = s.full_name;
    }
  } catch { /* use default */ }

  return res.send(setPasswordPage(token, displayName));
});

// ── POST /set-password ────────────────────────────────────────────────────────
router.post("/", express.urlencoded({ extended: true }), async (req, res) => {
  const { token, password, confirm_password } = req.body;

  if (!token || !password || !confirm_password)
    return res.status(400).send(errorPage("Missing fields", "All fields are required."));

  if (password !== confirm_password)
    return res.status(400).send(errorPage("Passwords don't match", "Please go back and try again.", token));

  const strength = checkPasswordStrength(password);
  if (!strength.valid)
    return res.status(400).send(errorPage("Weak password", strength.message, token));

  const record = await PasswordResetToken.findOne({ token, used: false });
  if (!record || new Date() > record.expires_at)
    return res.status(400).send(errorPage("Link expired or already used", "Please ask your administrator to resend the invitation."));

  const hashed = await bcrypt.hash(password, 10);
  await User.updateOne(
    { reference_id: record.user_id, user_type: record.user_type },
    { $set: { password: hashed, is_active: true } }
  );

  record.used = true;
  await record.save();

  return res.send(successPage());
});

// ── helpers ───────────────────────────────────────────────────────────────────

const checkPasswordStrength = (pw) => {
  if (pw.length < 8)            return { valid: false, message: "Password must be at least 8 characters." };
  if (!/[A-Z]/.test(pw))        return { valid: false, message: "Password must contain at least one uppercase letter." };
  if (!/[a-z]/.test(pw))        return { valid: false, message: "Password must contain at least one lowercase letter." };
  if (!/[0-9]/.test(pw))        return { valid: false, message: "Password must contain at least one number." };
  if (!/[^A-Za-z0-9]/.test(pw)) return { valid: false, message: "Password must contain at least one special character." };
  return { valid: true };
};

const escapeHtml = (s) =>
  String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ── SVG icons ─────────────────────────────────────────────────────────────────
const lockSvg  = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const checkSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const warnSvg  = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const miniCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

// ── shared CSS (mirrors StudentDetailTopTab design language) ──────────────────
const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.wrap{position:relative;width:100%;max-width:440px}

/* decorative shapes — same language as StudentDetailTopTab */
.wrap::before{content:"";position:absolute;width:180px;height:180px;border-radius:50%;border:22px solid rgba(0,0,0,0.04);top:-60px;right:-50px;pointer-events:none}
.wrap::after{content:"";position:absolute;width:70px;height:70px;border-radius:12px;border:2px solid rgba(0,0,0,0.05);bottom:30px;right:60px;transform:rotate(22deg);pointer-events:none}
.dc{position:absolute;width:110px;height:110px;border-radius:50%;border:14px solid rgba(0,0,0,0.03);bottom:-40px;left:-30px;pointer-events:none}
.db{position:absolute;width:40px;height:40px;border-radius:8px;border:1.5px solid rgba(0,0,0,0.06);top:20px;left:180px;transform:rotate(14deg);pointer-events:none}

.card{position:relative;z-index:1;background:#fff;border-radius:16px;padding:40px 36px;border:1px solid #e8e8e8;overflow:hidden}
.card::before{content:"";position:absolute;width:120px;height:120px;border-radius:50%;border:16px solid rgba(0,0,0,0.03);top:-40px;right:-30px;pointer-events:none}

.icon-wrap{width:48px;height:48px;border-radius:12px;background:#111;display:flex;align-items:center;justify-content:center;color:#fff;margin-bottom:20px}
.brand{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:8px}
h1{font-size:22px;font-weight:800;color:#111;letter-spacing:-.03em;line-height:1.15;margin-bottom:6px}
.sub{font-size:13px;color:#888;line-height:1.55;margin-bottom:28px}
.name-tag{display:inline-block;background:#111;color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:16px;letter-spacing:.02em}

label{display:block;font-size:11px;font-weight:700;color:#111;letter-spacing:.06em;text-transform:uppercase;margin-bottom:7px}
.field{margin-bottom:20px}
input[type=password]{width:100%;padding:11px 14px;border:1.5px solid #e8e8e8;border-radius:10px;font-size:14px;outline:none;transition:border-color .15s;background:#fff;color:#111}
input[type=password]:focus{border-color:#111}

.str-track{height:3px;background:#e8e8e8;border-radius:2px;margin-top:8px;overflow:hidden}
.str-bar{height:100%;border-radius:2px;transition:width .25s,background .25s;width:0}
.str-lbl{font-size:10px;color:#aaa;margin-top:5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}

.checks{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chk{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:4px 9px;border-radius:20px;border:1.5px solid #e8e8e8;color:#bbb;transition:all .15s}
.chk.pass{border-color:#111;color:#111;background:#f5f5f5}
.chk svg{width:10px;height:10px;flex-shrink:0}

.mhint{font-size:12px;margin-top:6px;font-weight:600;min-height:16px}

button{width:100%;padding:13px;background:#111;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:.02em;transition:opacity .15s;margin-top:4px}
button:hover:not(:disabled){opacity:.82}
button:disabled{opacity:.3;cursor:not-allowed}

.divider{height:1px;background:#e8e8e8;margin:24px 0}
.fnote{font-size:11px;color:#bbb;text-align:center;line-height:1.5}

.state-icon{width:56px;height:56px;border-radius:14px;background:#111;display:flex;align-items:center;justify-content:center;color:#fff;margin:0 auto 20px}
.center{text-align:center}
.back{display:inline-block;margin-top:20px;font-size:13px;font-weight:700;color:#111;text-decoration:none;border-bottom:2px solid #111;padding-bottom:1px}
`;

// ── HTML templates ────────────────────────────────────────────────────────────

const setPasswordPage = (token, name) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Set Your Password — ScladApp</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <span class="dc"></span>
  <span class="db"></span>
  <div class="card">
    <div class="icon-wrap">${lockSvg}</div>
    <div class="brand">ScladApp</div>
    <div class="name-tag">Hello, ${escapeHtml(name)}</div>
    <h1>Set your password</h1>
    <p class="sub">Choose a strong password to activate your ScladApp account. You'll use it every time you log in.</p>

    <form method="POST" action="/set-password" id="frm">
      <input type="hidden" name="token" value="${escapeHtml(token)}"/>

      <div class="field">
        <label for="pw">New Password</label>
        <input type="password" id="pw" name="password" placeholder="Enter password" autocomplete="new-password" oninput="onPw(this.value)" required/>
        <div class="str-track"><div class="str-bar" id="bar"></div></div>
        <div class="str-lbl" id="slbl"></div>
        <div class="checks">
          <span class="chk" id="c0">${miniCheck}8+ chars</span>
          <span class="chk" id="c1">${miniCheck}Uppercase</span>
          <span class="chk" id="c2">${miniCheck}Lowercase</span>
          <span class="chk" id="c3">${miniCheck}Number</span>
          <span class="chk" id="c4">${miniCheck}Special</span>
        </div>
      </div>

      <div class="field">
        <label for="cpw">Confirm Password</label>
        <input type="password" id="cpw" name="confirm_password" placeholder="Repeat password" autocomplete="new-password" oninput="onCpw()" required/>
        <div class="mhint" id="mh"></div>
      </div>

      <button type="submit" id="btn" disabled>Activate Account</button>
    </form>

    <div class="divider"></div>
    <p class="fnote">This link expires in 48 hours &nbsp;·&nbsp; ScladApp School Management</p>
  </div>
</div>
<script>
const R=[/.{8,}/,/[A-Z]/,/[a-z]/,/[0-9]/,/[^A-Za-z0-9]/];
const BC=["#ddd","#ddd","#999","#999","#111","#111"];
const BL=["","VERY WEAK","WEAK","FAIR","STRONG","VERY STRONG"];
function onPw(v){
  const s=R.filter(r=>r.test(v)).length;
  document.getElementById("bar").style.cssText="width:"+(s/5*100)+"%;background:"+BC[s];
  document.getElementById("slbl").textContent=v.length?BL[s]:"";
  R.forEach((r,i)=>document.getElementById("c"+i).classList.toggle("pass",r.test(v)));
  chk();
}
function onCpw(){chk();}
function chk(){
  const pw=document.getElementById("pw").value;
  const cpw=document.getElementById("cpw").value;
  const s=R.filter(r=>r.test(pw)).length;
  const mh=document.getElementById("mh");
  if(cpw.length){mh.textContent=pw===cpw?"✓ Passwords match":"✗ Passwords don't match";mh.style.color=pw===cpw?"#111":"#888";}
  else mh.textContent="";
  document.getElementById("btn").disabled=!(s===5&&pw===cpw&&cpw.length>0);
}
</script>
</body>
</html>`;

const successPage = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Password Set — ScladApp</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <span class="dc"></span>
  <span class="db"></span>
  <div class="card center">
    <div class="state-icon">${checkSvg}</div>
    <div class="brand">ScladApp</div>
    <h1>You're all set</h1>
    <p class="sub" style="margin-top:8px">Your password has been saved. You can now log in to ScladApp using your email and new password.</p>
    <div class="divider"></div>
    <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="display:inline-block;padding:13px 32px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.02em;">Go to Login &rarr;</a>
    <div class="divider"></div>
    <p class="fnote">ScladApp School Management Platform</p>
  </div>
</div>
</body>
</html>`;

const errorPage = (title, message, token = null) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Error — ScladApp</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <span class="dc"></span>
  <span class="db"></span>
  <div class="card center">
    <div class="state-icon">${warnSvg}</div>
    <div class="brand">ScladApp</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="sub" style="margin-top:8px">${escapeHtml(message)}</p>
    ${token ? `<a class="back" href="/set-password?token=${escapeHtml(token)}">← Try again</a>` : ""}
    <div class="divider"></div>
    <p class="fnote">ScladApp School Management Platform</p>
  </div>
</div>
</body>
</html>`;

module.exports = router;
