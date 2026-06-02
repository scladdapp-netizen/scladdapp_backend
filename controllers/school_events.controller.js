const SchoolEvent = require("../models/SchoolEvent.model");

exports.createEvent = async (req, res) => {
  try {
    const { school_id, session_id, subsession_id, title, description, event_date, event_time, location } = req.body;
    if (!school_id || !session_id || !subsession_id || !title || !description || !event_date || !event_time || !location) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const event = await SchoolEvent.create({
      event_id:        Date.now().toString(),
      school_id,
      session_id,
      session_name:    req.body.session_name || null,
      subsession_id,
      subsession_name: req.body.subsession_name || null,
      title,
      description,
      event_date,
      event_time,
      location,
      category:        req.body.category || "General",
      organizer:       req.body.organizer || null,
      participants:    req.body.participants || "All Students",
      status:          req.body.status || "Upcoming",
      created_by:      req.body.created_by || null,
      created_by_name: req.body.created_by_name || null,
      created_by_role: req.body.created_by_role || null,
    });

    res.status(201).json({ success: true, message: "School event created successfully", data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create school event", error: error.message });
  }
};

exports.getEventsBySubsession = async (req, res) => {
  try {
    const { subsessionId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "", sortBy = "event_date", sortOrder = "desc" } = req.query;

    const query = { subsession_id: subsessionId };
    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: "i" };
      query[searchField && searchField.trim() ? searchField : "$or"] = searchField && searchField.trim()
        ? regex
        : [{ title: regex }, { description: regex }, { location: regex }, { category: regex }, { organizer: regex }];
    }

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const total    = await SchoolEvent.countDocuments(query);
    const totalPages = Math.ceil(total / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;

    const events = await SchoolEvent.find(query)
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip(startIndex)
      .limit(limitNum)
      .lean();

    res.json({ success: true, data: events, count: events.length,
      pagination: { currentPage: pageNum, totalPages, totalItems: total, itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1 } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve events", error: error.message });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const event = await SchoolEvent.findOne({ event_id: req.params.eventId }).lean();
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve event", error: error.message });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const event = await SchoolEvent.findOne({ event_id: req.params.eventId });
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    const allowed = ["title","description","event_date","event_time","location","category","organizer","participants","status","session_name","subsession_name"];
    allowed.forEach((f) => { if (req.body[f] !== undefined) event[f] = req.body[f]; });
    event.updated_at = new Date();
    await event.save();

    res.json({ success: true, message: "Event updated successfully", data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update event", error: error.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const event = await SchoolEvent.findOneAndDelete({ event_id: req.params.eventId });
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    res.json({ success: true, message: "Event deleted successfully", data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete event", error: error.message });
  }
};

exports.getEventsBySchool = async (req, res) => {
  try {
    const events = await SchoolEvent.find({ school_id: req.params.schoolId }).lean();
    res.json({ success: true, data: events, count: events.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve school events", error: error.message });
  }
};

module.exports = exports;
