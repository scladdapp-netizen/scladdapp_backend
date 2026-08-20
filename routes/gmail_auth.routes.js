/**
 * Gmail OAuth 2.0 routes
 *
 * GET  /api/gmail/connect?schoolId=<id>
 *   → Redirects the school admin to Google's OAuth consent screen.
 *
 * GET  /api/gmail/callback?code=<code>&state=<schoolId>
 *   → Google redirects here after the user grants permission.
 *     Exchanges the code for tokens and persists the refresh token.
 *
 * GET  /api/gmail/status?schoolId=<id>
 *   → Returns whether a Gmail account is connected for this school.
 *
 * DELETE  /api/gmail/disconnect?schoolId=<id>
 *   → Revokes and removes the stored tokens for this school.
 */

const express    = require("express");
const { google } = require("googleapis");
const GmailToken = require("../models/GmailToken.model");

const router = express.Router();

// ── Scopes required ──────────────────────────────────────────────────────────
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email", // to read the sender address
];

// ── Helper: build a fresh OAuth2 client ─────────────────────────────────────
const buildOAuth2Client = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

// ── GET /api/gmail/connect?schoolId=<id> ────────────────────────────────────
router.get("/connect", (req, res) => {
  const { schoolId } = req.query;

  if (!schoolId) {
    return res.status(400).json({ success: false, message: "schoolId query param is required." });
  }

  const oauth2Client = buildOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type:  "offline",   // ensures a refresh_token is returned
    prompt:       "consent",   // forces re-consent so refresh_token is always included
    scope:        SCOPES,
    state:        schoolId,    // passed back unchanged in the callback
  });

  return res.redirect(authUrl);
});

// ── GET /api/gmail/callback ──────────────────────────────────────────────────
router.get("/callback", async (req, res) => {
  const { code, state: schoolId, error } = req.query;

  if (error) {
    return res.status(400).send(`OAuth error: ${error}`);
  }

  if (!code || !schoolId) {
    return res.status(400).json({ success: false, message: "Missing code or state." });
  }

  try {
    const oauth2Client = buildOAuth2Client();

    // Exchange authorisation code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return res
        .status(400)
        .send(
          "No refresh_token returned. " +
          "Please revoke app access in your Google Account and try again."
        );
    }

    // Fetch the Gmail address from Google's userinfo endpoint
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Persist / update the token document for this school
    await GmailToken.findOneAndUpdate(
      { school_id: schoolId },
      {
        school_id:     schoolId,
        gmail_address: userInfo.email,
        refresh_token: tokens.refresh_token,
        access_token:  tokens.access_token  || null,
        token_expiry:  tokens.expiry_date   ? new Date(tokens.expiry_date) : null,
      },
      { upsert: true, new: true }
    );

    console.log(`[Gmail OAuth] Connected ${userInfo.email} for school ${schoolId}`);

    // Redirect the admin back to the frontend settings page
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontendUrl}/settings?gmail=connected`);
  } catch (err) {
    console.error("[Gmail OAuth] Callback error:", err.message);
    return res.status(500).json({ success: false, message: "OAuth callback failed.", error: err.message });
  }
});

// ── GET /api/gmail/status?schoolId=<id> ─────────────────────────────────────
router.get("/status", async (req, res) => {
  const { schoolId } = req.query;

  if (!schoolId) {
    return res.status(400).json({ success: false, message: "schoolId is required." });
  }

  try {
    const tokenDoc = await GmailToken.findOne({ school_id: schoolId })
      .select("gmail_address connected_at")
      .lean();

    if (!tokenDoc) {
      return res.json({ success: true, connected: false });
    }

    return res.json({
      success:       true,
      connected:     true,
      gmail_address: tokenDoc.gmail_address,
      connected_at:  tokenDoc.connected_at,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/gmail/disconnect?schoolId=<id> ───────────────────────────────
router.delete("/disconnect", async (req, res) => {
  const { schoolId } = req.query;

  if (!schoolId) {
    return res.status(400).json({ success: false, message: "schoolId is required." });
  }

  try {
    const tokenDoc = await GmailToken.findOne({ school_id: schoolId });

    if (!tokenDoc) {
      return res.status(404).json({ success: false, message: "No Gmail account connected for this school." });
    }

    // Revoke the token at Google's end
    try {
      const oauth2Client = buildOAuth2Client();
      await oauth2Client.revokeToken(tokenDoc.refresh_token);
    } catch (revokeErr) {
      // Token may already be invalid — still remove from DB
      console.warn("[Gmail OAuth] Revoke failed (continuing):", revokeErr.message);
    }

    await GmailToken.deleteOne({ school_id: schoolId });

    console.log(`[Gmail OAuth] Disconnected Gmail for school ${schoolId}`);
    return res.json({ success: true, message: "Gmail account disconnected." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
