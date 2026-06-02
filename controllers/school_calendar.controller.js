const SchoolCalendar = require("../models/SchoolCalendar.model");

exports.createCalendarItem = async (req, res) => {
  try {
    const { school_id, session_id, subsession_id, title, description, calendar_date, calendar_time } = req.body;
    if (!school_id || !session_id || !subsession_id || !title || !description || !calendar_date || !calendar_time) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const item = await SchoolCalendar.create({
      calendar_id:      Date.now().toString(),
      school_id,
      session_id,
      session_name:     req.body.session_name || null,
      subsession_id,
      subsession_name:  req.body.subsession_name || null,
      title,
      description,
      calendar_date,
      calendar_time,
      type:             req.body.type || "Academic",
      location:         req.body.location || null,
      duration:         req.body.duration || null,
      participants:     req.body.participants || "All Students & Staff",
      priority:         req.body.priority || "Medium",
      status:           "Scheduled",
      created_by:       req.body.created_by || null,
      created_by_name:  req.body.created_by_name || null,
      created_by_role:  req.body.created_by_role || null,
    });

    res.status(201).json({ success: true, message: "Calendar item created successfully", data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create calendar item", error: error.message });
  }
};

exports.getCalendarItemsBySubsession = async (req, res) => {
  try {
    const { subsessionId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "", sortBy = "calendar_date", sortOrder = "asc" } = req.query;

    const query = { subsession_id: subsessionId };
    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: "i" };
      query[searchField && searchField.trim() ? searchField : "$or"] = searchField && searchField.trim()
        ? regex
        : [{ title: regex }, { description: regex }, { type: regex }, { location: regex }, { participants: regex }];
    }

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const total    = await SchoolCalendar.countDocuments(query);
    const totalPages = Math.ceil(total / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;

    const items = await SchoolCalendar.find(query)
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip(startIndex)
      .limit(limitNum)
      .lean();

    res.json({ success: true, data: items, count: items.length,
      pagination: { currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve calendar items", error: error.message });
  }
};

exports.getCalendarItemById = async (req, res) => {
  try {
    const item = await SchoolCalendar.findOne({ calendar_id: req.params.calendarId }).lean();
    if (!item) return res.status(404).json({ success: false, message: "Calendar item not found" });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve calendar item", error: error.message });
  }
};

exports.updateCalendarItem = async (req, res) => {
  try {
    const item = await SchoolCalendar.findOne({ calendar_id: req.params.calendarId });
    if (!item) return res.status(404).json({ success: false, message: "Calendar item not found" });

    const allowed = ["title","description","calendar_date","calendar_time","type","location","duration","participants","priority","status","session_name","subsession_name"];
    allowed.forEach((f) => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
    item.updated_at = new Date();
    await item.save();

    res.json({ success: true, message: "Calendar item updated successfully", data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update calendar item", error: error.message });
  }
};

exports.deleteCalendarItem = async (req, res) => {
  try {
    const item = await SchoolCalendar.findOneAndDelete({ calendar_id: req.params.calendarId });
    if (!item) return res.status(404).json({ success: false, message: "Calendar item not found" });
    res.json({ success: true, message: "Calendar item deleted successfully", data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete calendar item", error: error.message });
  }
};

exports.getCalendarItemsBySchool = async (req, res) => {
  try {
    const items = await SchoolCalendar.find({ school_id: req.params.schoolId }).lean();
    res.json({ success: true, data: items, count: items.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve school calendar items", error: error.message });
  }
};

module.exports = exports;
