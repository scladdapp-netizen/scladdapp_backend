/**
 * seedWebsiteTemplates.js
 * Run: node scripts/seedWebsiteTemplates.js
 *
 * Reads elementTemplates.json (components) + the inline SECTION_TEMPLATES,
 * then upserts every entry into MongoDB WebsiteTemplate collection.
 * Safe to run multiple times — uses template_id as the unique key.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const WebsiteTemplate = require("../models/WebsiteTemplate.model");

// ── 1. load component templates from JSON ────────────────────────────────────
const COMPONENTS = require("../../scladapp/src/pages/AdminSec/AdminPages/AIWebsiteEditor/elementTemplates.json");

// ── 2. inline section templates (same as AddTemplateModal) ───────────────────
const SECTIONS = [
  {
    id: "hero-simple", label: "Hero — Simple", category: "Hero",
    html: `<section style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#fff;padding:100px 40px;text-align:center;"><h1 style="font-size:48px;font-weight:900;margin:0 0 16px;letter-spacing:-0.03em;">Welcome to Our School</h1><p style="font-size:18px;color:rgba(255,255,255,0.65);max-width:560px;margin:0 auto 32px;line-height:1.6;">Nurturing the leaders of tomorrow through quality education and innovation.</p><a href="#" style="display:inline-block;padding:14px 36px;background:#fff;color:#111;border-radius:100px;font-weight:700;font-size:15px;text-decoration:none;">Learn More</a></section>`,
  },
  {
    id: "hero-image", label: "Hero — With Image", category: "Hero",
    html: `<section style="display:flex;align-items:center;gap:48px;padding:80px 40px;background:#fff;max-width:1100px;margin:0 auto;"><div style="flex:1;min-width:0;"><h1 style="font-size:42px;font-weight:900;color:#111;margin:0 0 16px;letter-spacing:-0.02em;">Excellence in Education</h1><p style="font-size:16px;color:#666;line-height:1.7;margin:0 0 28px;">We provide a world-class learning environment for every student to thrive.</p><a href="#" style="display:inline-block;padding:12px 28px;background:#111;color:#fff;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">Apply Now</a></div><div style="flex:1;min-width:0;"><img src="https://placehold.co/560x380?text=School+Photo" alt="School" style="width:100%;border-radius:16px;display:block;" /></div></section>`,
  },
  {
    id: "features-3col", label: "Features — 3 Columns", category: "Features",
    html: `<section style="padding:80px 40px;background:#fafafa;"><div style="max-width:1100px;margin:0 auto;"><h2 style="font-size:32px;font-weight:800;color:#111;margin:0 0 12px;text-align:center;letter-spacing:-0.02em;">Why Choose Us?</h2><p style="font-size:16px;color:#666;text-align:center;margin:0 0 48px;line-height:1.7;">Committed to outstanding experiences for every student.</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;"><div style="padding:28px;border-radius:16px;border:1px solid #eee;background:#fff;"><div style="font-size:28px;margin-bottom:12px;">🎓</div><h3 style="font-size:16px;font-weight:700;color:#111;margin:0 0 8px;">Academic Excellence</h3><p style="font-size:14px;color:#888;line-height:1.6;margin:0;">Our students consistently achieve outstanding results.</p></div><div style="padding:28px;border-radius:16px;border:1px solid #eee;background:#fff;"><div style="font-size:28px;margin-bottom:12px;">🌍</div><h3 style="font-size:16px;font-weight:700;color:#111;margin:0 0 8px;">Holistic Development</h3><p style="font-size:14px;color:#888;line-height:1.6;margin:0;">Arts, sports and leadership programs for growth.</p></div><div style="padding:28px;border-radius:16px;border:1px solid #eee;background:#fff;"><div style="font-size:28px;margin-bottom:12px;">👩‍🏫</div><h3 style="font-size:16px;font-weight:700;color:#111;margin:0 0 8px;">Experienced Staff</h3><p style="font-size:14px;color:#888;line-height:1.6;margin:0;">Highly qualified teachers passionate about success.</p></div></div></div></section>`,
  },
  {
    id: "about", label: "About — Text + Image", category: "About",
    html: `<section style="padding:80px 40px;background:#fff;"><div style="max-width:1100px;margin:0 auto;display:flex;align-items:center;gap:48px;"><div style="flex:1;min-width:0;"><img src="https://placehold.co/520x380?text=About+Us" alt="About" style="width:100%;border-radius:16px;display:block;" /></div><div style="flex:1;min-width:0;"><h2 style="font-size:32px;font-weight:800;color:#111;margin:0 0 16px;letter-spacing:-0.02em;">About Our School</h2><p style="font-size:16px;color:#666;line-height:1.7;margin:0 0 16px;">Founded with a vision to provide quality education, shaping young minds for over two decades.</p><p style="font-size:16px;color:#666;line-height:1.7;margin:0;">Our dedicated faculty and modern facilities create the perfect environment for learning.</p></div></div></section>`,
  },
  {
    id: "stats", label: "Stats Bar", category: "Stats",
    html: `<section style="background:#111;color:#fff;padding:60px 40px;"><div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:32px;text-align:center;"><div><div style="font-size:42px;font-weight:900;color:#a29bfe;">1200+</div><div style="font-size:14px;color:rgba(255,255,255,0.5);margin-top:6px;font-weight:600;">Students Enrolled</div></div><div><div style="font-size:42px;font-weight:900;color:#a29bfe;">98%</div><div style="font-size:14px;color:rgba(255,255,255,0.5);margin-top:6px;font-weight:600;">Pass Rate</div></div><div><div style="font-size:42px;font-weight:900;color:#a29bfe;">80+</div><div style="font-size:14px;color:rgba(255,255,255,0.5);margin-top:6px;font-weight:600;">Qualified Teachers</div></div><div><div style="font-size:42px;font-weight:900;color:#a29bfe;">25</div><div style="font-size:14px;color:rgba(255,255,255,0.5);margin-top:6px;font-weight:600;">Years of Excellence</div></div></div></section>`,
  },
  {
    id: "contact", label: "Contact Form", category: "Contact",
    html: `<section style="padding:80px 40px;background:#fafafa;"><div style="max-width:600px;margin:0 auto;"><h2 style="font-size:32px;font-weight:800;color:#111;margin:0 0 8px;text-align:center;">Get In Touch</h2><p style="font-size:15px;color:#888;text-align:center;margin:0 0 40px;">Have a question? We'd love to hear from you.</p><form style="display:flex;flex-direction:column;gap:16px;"><input type="text" placeholder="Your Name" style="padding:12px 16px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;width:100%;box-sizing:border-box;" /><input type="email" placeholder="Email Address" style="padding:12px 16px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;width:100%;box-sizing:border-box;" /><textarea rows="5" placeholder="Your message…" style="padding:12px 16px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;width:100%;box-sizing:border-box;resize:vertical;"></textarea><button type="submit" style="padding:13px 28px;background:#111;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">Send Message</button></form></div></section>`,
  },
  {
    id: "testimonials", label: "Testimonials", category: "Testimonials",
    html: `<section style="padding:80px 40px;background:#fff;"><div style="max-width:1100px;margin:0 auto;"><h2 style="font-size:32px;font-weight:800;color:#111;margin:0 0 48px;text-align:center;">What People Say</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;"><div style="padding:28px;border-radius:16px;border:1px solid #eee;background:#fafafa;"><p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 16px;">"The school has given my child a wonderful foundation."</p><div style="font-size:13px;font-weight:700;color:#111;">— Mrs. Adaobi Okafor</div><div style="font-size:12px;color:#aaa;">Parent, JSS 2</div></div><div style="padding:28px;border-radius:16px;border:1px solid #eee;background:#fafafa;"><p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 16px;">"I love this school. My teachers always push me to do my best."</p><div style="font-size:13px;font-weight:700;color:#111;">— Tunde Balogun</div><div style="font-size:12px;color:#aaa;">Student, SS 3</div></div><div style="padding:28px;border-radius:16px;border:1px solid #eee;background:#fafafa;"><p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 16px;">"Outstanding results every year. Highly recommended."</p><div style="font-size:13px;font-weight:700;color:#111;">— Mr. Emeka Nwosu</div><div style="font-size:12px;color:#aaa;">Parent, Primary 6</div></div></div></div></section>`,
  },
  {
    id: "navbar", label: "Navigation Bar", category: "Navigation",
    html: `<nav style="display:flex;align-items:center;justify-content:space-between;padding:16px 40px;background:#fff;border-bottom:1px solid #eee;position:sticky;top:0;z-index:10;"><span style="font-size:18px;font-weight:800;color:#111;">School Name</span><ul style="display:flex;gap:28px;list-style:none;margin:0;padding:0;"><li><a href="#" style="text-decoration:none;color:#555;font-size:14px;font-weight:500;">Home</a></li><li><a href="#" style="text-decoration:none;color:#555;font-size:14px;font-weight:500;">About</a></li><li><a href="#" style="text-decoration:none;color:#555;font-size:14px;font-weight:500;">Admissions</a></li><li><a href="#" style="text-decoration:none;color:#555;font-size:14px;font-weight:500;">Contact</a></li></ul></nav>`,
  },
  {
    id: "footer", label: "Footer", category: "Footer",
    html: `<footer style="background:#111;color:#888;padding:40px 40px 24px;"><div style="max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;align-items:flex-start;gap:32px;flex-wrap:wrap;margin-bottom:32px;"><div><div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:8px;">School Name</div><p style="font-size:13px;line-height:1.6;max-width:260px;margin:0;">Providing quality education and shaping future leaders since 2000.</p></div><div><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#555;margin-bottom:12px;">Quick Links</div><ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;"><li><a href="#" style="color:#888;font-size:13px;text-decoration:none;">Home</a></li><li><a href="#" style="color:#888;font-size:13px;text-decoration:none;">About</a></li><li><a href="#" style="color:#888;font-size:13px;text-decoration:none;">Contact</a></li></ul></div><div><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#555;margin-bottom:12px;">Contact</div><p style="font-size:13px;line-height:1.7;margin:0;">123 School Road<br/>Lagos, Nigeria<br/>info@schoolname.edu</p></div></div><div style="border-top:1px solid #222;padding-top:20px;text-align:center;font-size:12px;">© 2026 School Name. All rights reserved.</div></footer>`,
  },
];

// ── 3. seed ───────────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME });
  console.log(`Connected to MongoDB: ${process.env.DB_NAME}`);

  let created = 0, updated = 0;

  // Sections
  for (let i = 0; i < SECTIONS.length; i++) {
    const s = SECTIONS[i];
    const result = await WebsiteTemplate.findOneAndUpdate(
      { template_id: `sec_${s.id}` },
      {
        template_id: `sec_${s.id}`,
        label:      s.label,
        category:   s.category,
        type:       "section",
        html:       s.html,
        sort_order: i,
        is_active:  true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    result.__v === undefined ? created++ : updated++;
    console.log(`  [section] ${s.label}`);
  }

  // Components
  for (let i = 0; i < COMPONENTS.length; i++) {
    const c = COMPONENTS[i];
    const result = await WebsiteTemplate.findOneAndUpdate(
      { template_id: `cmp_${c.id}` },
      {
        template_id: `cmp_${c.id}`,
        label:      c.label,
        category:   c.category,
        type:       "component",
        html:       c.html,
        sort_order: i,
        is_active:  true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    result.__v === undefined ? created++ : updated++;
    console.log(`  [component] ${c.label}`);
  }

  console.log(`\nDone — ${created + updated} templates seeded (${created} new, ${updated} updated)`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
