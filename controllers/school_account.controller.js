const SchoolAccount = require("../models/SchoolAccount.model");
const axios = require("axios");
require("dotenv").config();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

exports.createSchoolAccount = async (req, res) => {
  try {
    const { school_id, account_name, account_number, bank_name, bank_code, account_type,
            balance, currency, is_default, description, created_by, subaccount_code } = req.body;

    if (!school_id) return res.status(400).json({ success: false, message: "School ID is required" });
    if (!account_name || !account_number || !bank_name) {
      return res.status(400).json({ success: false, message: "Account name, account number, and bank name are required" });
    }

    const existing = await SchoolAccount.findOne({ school_id, account_number });
    if (existing) return res.status(400).json({ success: false, message: "Account number already exists for this school" });

    if (is_default) {
      await SchoolAccount.updateMany({ school_id, is_default: true }, { $set: { is_default: false } });
    }

    const newAccount = await SchoolAccount.create({
      account_id:      Date.now().toString(),
      school_id,
      account_name:    account_name.trim(),
      account_number:  account_number.trim(),
      bank_name:       bank_name.trim(),
      bank_code:       bank_code?.trim() || null,
      account_type:    account_type || "Savings",
      balance:         balance || "0",
      currency:        currency || "NGN",
      is_default:      is_default || false,
      status:          "Active",
      description:     description?.trim() || "",
      subaccount_code: subaccount_code || null,
      created_by:      created_by || null,
      last_modified:   new Date(),
      modified_by:     created_by || null,
    });

    res.status(201).json({ success: true, message: "School account created successfully", data: newAccount });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create school account", error: error.message });
  }
};

exports.getSchoolAccountsBySchool = async (req, res) => {
  try {
    const accounts = await SchoolAccount.find({ school_id: req.params.schoolId }).lean();
    res.json({ success: true, data: accounts, count: accounts.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve school accounts", error: error.message });
  }
};

exports.getSchoolAccountById = async (req, res) => {
  try {
    const account = await SchoolAccount.findOne({ account_id: req.params.accountId }).lean();
    if (!account) return res.status(404).json({ success: false, message: "School account not found" });
    res.json({ success: true, data: account });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve school account", error: error.message });
  }
};

exports.updateSchoolAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { account_name, account_number, bank_name, account_type, balance, currency,
            is_default, status, description, modified_by } = req.body;

    const account = await SchoolAccount.findOne({ account_id: accountId });
    if (!account) return res.status(404).json({ success: false, message: "School account not found" });

    if (is_default && !account.is_default) {
      await SchoolAccount.updateMany({ school_id: account.school_id, account_id: { $ne: accountId }, is_default: true }, { $set: { is_default: false } });
    }

    if (account_name  !== undefined) account.account_name  = account_name.trim();
    if (account_number !== undefined) account.account_number = account_number.trim();
    if (bank_name     !== undefined) account.bank_name     = bank_name.trim();
    if (account_type  !== undefined) account.account_type  = account_type;
    if (balance       !== undefined) account.balance       = balance;
    if (currency      !== undefined) account.currency      = currency;
    if (is_default    !== undefined) account.is_default    = is_default;
    if (status        !== undefined) account.status        = status;
    if (description   !== undefined) account.description   = description?.trim();
    account.last_modified = new Date();
    account.modified_by   = modified_by || account.modified_by;
    await account.save();

    res.json({ success: true, message: "School account updated successfully", data: account });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update school account", error: error.message });
  }
};

exports.deleteSchoolAccount = async (req, res) => {
  try {
    const account = await SchoolAccount.findOne({ account_id: req.params.accountId });
    if (!account) return res.status(404).json({ success: false, message: "School account not found" });
    if (account.is_default) {
      return res.status(400).json({ success: false, message: "Cannot delete default account. Please set another account as default first." });
    }
    await SchoolAccount.deleteOne({ account_id: req.params.accountId });
    res.json({ success: true, message: "School account deleted successfully", data: account });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete school account", error: error.message });
  }
};

exports.setDefaultAccount = async (req, res) => {
  try {
    const account = await SchoolAccount.findOne({ account_id: req.params.accountId });
    if (!account) return res.status(404).json({ success: false, message: "School account not found" });

    await SchoolAccount.updateMany({ school_id: account.school_id }, { $set: { is_default: false } });
    account.is_default    = true;
    account.last_modified = new Date();
    await account.save();

    res.json({ success: true, message: "Account set as default successfully", data: account });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to set default account", error: error.message });
  }
};

exports.getBankList = async (req, res) => {
  try {
    const response = await axios.get("https://api.paystack.co/bank?country=nigeria&perPage=100", {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const banks = response.data.data.map((b) => ({ name: b.name, code: b.code }));
    return res.json({ success: true, data: banks });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

exports.verifyBankAccount = async (req, res) => {
  const { account_number, bank_code } = req.query;
  if (!account_number || !bank_code) return res.status(400).json({ success: false, message: "Missing account_number or bank_code" });
  try {
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    return res.json({ success: true, account_name: response.data.data.account_name, account_number: response.data.data.account_number });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

exports.createPaystackSubaccount = async (req, res) => {
  const { business_name, account_number, bank_code, percentage_charge } = req.body;
  if (!business_name || !account_number || !bank_code) return res.status(400).json({ success: false, message: "Missing required fields" });
  try {
    const response = await axios.post(
      "https://api.paystack.co/subaccount",
      { business_name, settlement_bank: bank_code, account_number, percentage_charge: percentage_charge || 0 },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" } }
    );
    return res.json({ success: true, subaccount_code: response.data.data.subaccount_code, data: response.data.data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

module.exports = exports;
