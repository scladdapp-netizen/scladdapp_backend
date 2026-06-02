const ReportCardTheme = require("../models/ReportCardTheme.model");

const getAllThemes = async (schoolId) => {
  try {
    const query = schoolId ? { $or: [{ is_global: true }, { school_id: schoolId }] } : {};
    const result = await ReportCardTheme.find(query).lean();
    return { success: true, data: result, count: result.length };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

const getThemeById = async (themeId) => {
  try {
    const theme = await ReportCardTheme.findOne({ theme_id: themeId }).lean();
    if (!theme) return { success: false, message: "Theme not found" };
    return { success: true, data: theme };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

const createTheme = async (body) => {
  try {
    const { name, html_template, css, school_id, is_global } = body;
    if (!name)          return { success: false, message: "name is required" };
    if (!html_template) return { success: false, message: "html_template is required" };
    if (!css)           return { success: false, message: "css is required" };

    const newTheme = await ReportCardTheme.create({
      theme_id:      `THEME-${Date.now()}`,
      name,
      html_template,
      css,
      school_id:     school_id || null,
      is_global:     is_global ?? false,
      updated_at:    new Date(),
    });

    return { success: true, data: newTheme, message: "Theme created" };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

const updateTheme = async (themeId, body) => {
  try {
    const theme = await ReportCardTheme.findOne({ theme_id: themeId });
    if (!theme) return { success: false, message: "Theme not found" };

    const allowed = ["name", "html_template", "css", "school_id", "is_global"];
    allowed.forEach((key) => { if (body[key] !== undefined) theme[key] = body[key]; });
    theme.updated_at = new Date();
    await theme.save();

    return { success: true, data: theme, message: "Theme updated" };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

const deleteTheme = async (themeId) => {
  try {
    const theme = await ReportCardTheme.findOneAndDelete({ theme_id: themeId });
    if (!theme) return { success: false, message: "Theme not found" };
    return { success: true, message: "Theme deleted" };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

module.exports = { getAllThemes, getThemeById, createTheme, updateTheme, deleteTheme };
