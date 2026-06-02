const Bill = require("../models/Bill.model");
const UserBill = require("../models/UserBill.model");
const Student = require("../models/Student.model");
const Staff = require("../models/Staff.model");
const Alumni = require("../models/Alumni.model");

const resolveUserName = async (user_type, reference_id) => {
  try {
    switch ((user_type || "").toLowerCase()) {
      case "student": {
        const s = await Student.findOne({ student_id: reference_id }).lean();
        return s?.full_name || null;
      }
      case "staff": {
        const s = await Staff.findOne({ staff_id: reference_id }).lean();
        return s?.full_name || null;
      }
      case "alumni": {
        const a = await Alumni.findOne({ alumni_id: reference_id }).lean();
        return a?.student_name || null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
};

exports.createBill = async (req, res) => {
  try {
    const {
      school_id, template_id, fee_code, fee_name, category, description,
      total_amount, currency, allow_installments, installment_count, min_payment,
      bill_items, school_account_id, mandatory, status, target_type,
      targeted_users, created_by_id, created_by_name,
    } = req.body;

    if (!school_id || !fee_name || !target_type) {
      return res.status(400).json({ success: false, message: "school_id, fee_name, and target_type are required" });
    }

    if (fee_code) {
      const existing = await Bill.findOne({ school_id, fee_code });
      if (existing) {
        return res.status(409).json({ success: false, message: `Fee code "${fee_code}" already exists for this school` });
      }
    }

    const bill_id = Date.now().toString();

    const newBill = await Bill.create({
      bill_id,
      school_id,
      template_id:        template_id || null,
      fee_code:           fee_code || null,
      fee_name,
      category:           category || null,
      description:        description || null,
      total_amount:       total_amount || 0,
      currency:           currency || "NGN",
      allow_installments: allow_installments || false,
      installment_count:  installment_count || null,
      min_payment:        min_payment || null,
      bill_items:         bill_items || [],
      school_account_id:  school_account_id || null,
      mandatory:          mandatory !== undefined ? mandatory : true,
      status:             status || "Active",
      target_type,
      created_by_id:      created_by_id || null,
      created_by_name:    created_by_name || null,
    });

    const recipients = Array.isArray(targeted_users) ? targeted_users : [];

    const userBillDocs = await Promise.all(
      recipients.map(async (recipient, index) => {
        const resolvedName = recipient.name || await resolveUserName(recipient.type, recipient.id);
        return {
          user_bill_id:   (Date.now() + index + 1).toString(),
          bill_id,
          school_id,
          user_id:        recipient.id,
          user_name:      resolvedName || null,
          user_type:      (recipient.type || "unknown").toLowerCase(),
          amount_due:     total_amount || 0,
          amount_paid:    0,
          payment_status: "unpaid",
          due_date:       null,
          paid_at:        null,
          payments:       [],
        };
      })
    );

    if (userBillDocs.length > 0) await UserBill.insertMany(userBillDocs);

    console.log(`Bill ${bill_id} created → ${recipients.length} recipients`);
    res.status(201).json({
      success: true,
      message: "Bill created successfully",
      data: { bill: newBill, recipients_count: recipients.length },
    });
  } catch (error) {
    console.error("Create bill error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBillsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const userBills = await UserBill.find({ user_id: userId }).lean();

    const billIds = userBills.map((ub) => ub.bill_id);
    const bills = await Bill.find({ bill_id: { $in: billIds }, status: "Active" }).lean();
    const billMap = {};
    bills.forEach((b) => { billMap[b.bill_id] = b; });

    const data = userBills
      .filter((ub) => billMap[ub.bill_id])
      .map((ub) => ({ ...ub, bill: billMap[ub.bill_id] }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBillsBySchoolPaginated = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 15, search = "" } = req.query;

    const query = { school_id: schoolId };
    if (search) {
      const q = { $regex: search, $options: "i" };
      query.$or = [{ fee_name: q }, { fee_code: q }, { category: q }];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const totalRecords = await Bill.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;

    const bills = await Bill.find(query)
      .sort({ created_at: -1 })
      .skip(startIndex)
      .limit(limitNum)
      .lean();

    const billIds = bills.map((b) => b.bill_id);
    const userBills = await UserBill.find({ bill_id: { $in: billIds } }).lean();

    const countMap = {};
    const paidMap = {};
    userBills.forEach((ub) => {
      countMap[ub.bill_id] = (countMap[ub.bill_id] || 0) + 1;
      if (ub.payment_status === "paid") paidMap[ub.bill_id] = (paidMap[ub.bill_id] || 0) + 1;
    });

    const data = bills.map((b) => ({
      ...b,
      recipients_count: countMap[b.bill_id] || 0,
      paid_count:       paidMap[b.bill_id] || 0,
    }));

    res.json({
      success: true,
      data,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + limitNum, totalRecords),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBillById = async (req, res) => {
  try {
    const { billId } = req.params;
    const bill = await Bill.findOne({ bill_id: billId }).lean();
    if (!bill) return res.status(404).json({ success: false, message: "Bill not found" });

    const userBills = await UserBill.find({ bill_id: billId }).lean();
    const paid_count = userBills.filter((ub) => ub.payment_status === "paid").length;

    res.json({ success: true, data: { ...bill, recipients_count: userBills.length, paid_count } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRecipientsPaginated = async (req, res) => {
  try {
    const { billId } = req.params;
    const { page = 1, limit = 15, search = "" } = req.query;

    const query = { bill_id: billId };
    if (search) {
      const q = { $regex: search, $options: "i" };
      query.$or = [{ user_name: q }, { payment_status: q }];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const totalRecords = await UserBill.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;

    const pageData = await UserBill.find(query)
      .skip(startIndex)
      .limit(limitNum)
      .lean();

    res.json({
      success: true,
      data: pageData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + limitNum, totalRecords),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const { userBillId } = req.params;
    const { amount, payment_method, reference, note, recorded_by_id, recorded_by_name } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Valid amount is required" });
    }

    const ub = await UserBill.findOne({ user_bill_id: userBillId });
    if (!ub) return res.status(404).json({ success: false, message: "User bill not found" });

    ub.payments.push({
      payment_id:       Date.now().toString(),
      amount:           Number(amount),
      payment_method:   payment_method || null,
      reference:        reference || null,
      note:             note || null,
      paid_at:          new Date(),
      recorded_by_id:   recorded_by_id || null,
      recorded_by_name: recorded_by_name || null,
    });

    ub.amount_paid = ub.payments.reduce((sum, p) => sum + p.amount, 0);
    ub.payment_status =
      ub.amount_paid >= ub.amount_due ? "paid"
      : ub.amount_paid > 0 ? "partial"
      : "unpaid";
    if (ub.payment_status === "paid") ub.paid_at = new Date();

    await ub.save();
    res.json({ success: true, message: "Payment recorded", data: ub });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBillStatus = async (req, res) => {
  try {
    const { billId } = req.params;
    const { status } = req.body;

    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be Active or Inactive" });
    }

    const bill = await Bill.findOne({ bill_id: billId });
    if (!bill) return res.status(404).json({ success: false, message: "Bill not found" });

    bill.status = status;
    await bill.save();

    res.json({ success: true, message: `Bill ${status.toLowerCase()}d`, data: bill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBill = async (req, res) => {
  try {
    const { billId } = req.params;
    const bill = await Bill.findOneAndDelete({ bill_id: billId });
    if (!bill) return res.status(404).json({ success: false, message: "Bill not found" });

    await UserBill.deleteMany({ bill_id: billId });
    res.json({ success: true, message: "Bill deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
