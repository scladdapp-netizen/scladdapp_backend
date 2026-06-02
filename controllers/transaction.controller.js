const Transaction = require("../models/Transaction.model");

exports.createTransaction = async (req, res) => {
  try {
    const { school_id, type, title, amount, currency, category, description, date,
            payment_method, reference, status, school_account_id,
            created_by_id, created_by_name, approved_by_id, approved_by_name } = req.body;

    if (!school_id || !type || !title || !amount) {
      return res.status(400).json({ success: false, message: "school_id, type, title, and amount are required" });
    }
    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be 'income' or 'expense'" });
    }

    const transaction = await Transaction.create({
      transaction_id:   Date.now().toString(),
      school_id,
      type,
      title,
      amount:           Number(amount),
      currency:         currency || "NGN",
      category:         category || null,
      description:      description || null,
      date:             date || new Date().toISOString().split("T")[0],
      payment_method:   payment_method || null,
      reference:        reference || null,
      status:           status || "completed",
      school_account_id: school_account_id || null,
      created_by_id:    created_by_id || null,
      created_by_name:  created_by_name || null,
      approved_by_id:   approved_by_id || null,
      approved_by_name: approved_by_name || null,
    });

    res.status(201).json({ success: true, message: "Transaction created", data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTransactionsPaginated = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 15, search = "", type = "", startDate = "", endDate = "" } = req.query;

    // Base query — no date filter in MongoDB to avoid $and/$or conflicts
    const query = { school_id: schoolId };
    if (type) query.type = type;
    if (search) {
      const q = { $regex: search, $options: "i" };
      query.$or = [{ title: q }, { category: q }, { reference: q }];
    }

    // Debug: log all transactions for this school
    const allForSchool = await Transaction.find({ school_id: schoolId }).lean();
    console.log(`[Transactions] school=${schoolId} total=${allForSchool.length}`);
    allForSchool.forEach(t => console.log(`  type=${t.type} date=${t.date} title=${t.title}`));

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;

    // Fetch all matching, filter by date in JS
    const all = await Transaction.find(query).sort({ created_at: -1 }).lean();
    const dateFiltered = all.filter((t) => {
      if (!startDate && !endDate) return true;
      if (!t.date) return true;
      if (startDate && t.date < startDate) return false;
      if (endDate   && t.date > endDate)   return false;
      return true;
    });

    const totalIncome   = dateFiltered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalExpenses = dateFiltered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const totalRecords  = dateFiltered.length;
    const totalPages    = Math.ceil(totalRecords / limitNum) || 1;
    const paged         = dateFiltered.slice(startIndex, startIndex + limitNum);

    res.json({
      success: true,
      data: paged,
      summary: { totalIncome, totalExpenses, netBalance: totalIncome - totalExpenses },
      pagination: {
        currentPage: pageNum, totalPages, totalRecords, recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
        startIndex: startIndex + 1, endIndex: Math.min(startIndex + limitNum, totalRecords),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTransactionById = async (req, res) => {
  try {
    const t = await Transaction.findOne({ transaction_id: req.params.transactionId }).lean();
    if (!t) return res.status(404).json({ success: false, message: "Transaction not found" });
    res.json({ success: true, data: t });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTransaction = async (req, res) => {
  try {
    const t = await Transaction.findOne({ transaction_id: req.params.transactionId });
    if (!t) return res.status(404).json({ success: false, message: "Transaction not found" });

    const allowed = ["title","amount","currency","category","description","date","payment_method","reference","status","school_account_id","approved_by_id","approved_by_name"];
    allowed.forEach((f) => { if (req.body[f] !== undefined) t[f] = req.body[f]; });
    if (req.body.amount !== undefined) t.amount = Number(req.body.amount);
    await t.save();

    res.json({ success: true, message: "Transaction updated", data: t });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const t = await Transaction.findOneAndDelete({ transaction_id: req.params.transactionId });
    if (!t) return res.status(404).json({ success: false, message: "Transaction not found" });
    res.json({ success: true, message: "Transaction deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
