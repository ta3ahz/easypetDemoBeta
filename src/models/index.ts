import mongoose, { Schema, model, models, Types } from 'mongoose';

/* ----------------------------------------------------------------------------
 * easyPET data model (MongoDB / Mongoose)
 *
 *  Clinic      = the account (username = clinic name, password = 6-digit PIN)
 *  Device      = a physical CrowPanel unit, keyed by its eFuse MAC (uid)
 *  Test        = one measurement a device performed (patient + result)
 *  CreditTx    = ledger of test-credit changes (admin grant / redeem / consume)
 *  Admin       = back-office login (email + password)
 *  RedeemCode  = a code the device/clinic can redeem for credits ("Add tests")
 * ------------------------------------------------------------------------- */

/* ------------------------------- Clinic ---------------------------------- */
export interface IClinic {
  _id: Types.ObjectId;
  name: string;               // unique username (clinic name)
  pinHash: string;            // bcrypt hash of the 6-digit PIN
  vets: string[];             // veterinarian names (max 3 on device)
  credits: number;            // remaining test credits
  status: 'active' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}
const ClinicSchema = new Schema<IClinic>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    pinHash: { type: String, required: true },
    vets: { type: [String], default: [] },
    credits: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true }
);

/* ------------------------------- Device ---------------------------------- */
export interface IDevice {
  _id: Types.ObjectId;
  uid: string;                // eFuse MAC (12 hex chars), unique per chip
  clinic: Types.ObjectId;
  fw: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
const DeviceSchema = new Schema<IDevice>(
  {
    uid: { type: String, required: true, unique: true, uppercase: true, trim: true },
    clinic: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    fw: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/* -------------------------------- Test ----------------------------------- */
export interface ITest {
  _id: Types.ObjectId;
  device: Types.ObjectId;
  clinic: Types.ObjectId;
  vet: string;
  patient: {
    name: string;
    owner: string;
    species: string;          // 'cat' | 'dog'
    sex: string;              // 'female' | 'male'
    age: string;
    weight: string;
  };
  result: {
    positive: boolean;
    value: number | null;     // biomarker reading (optional)
  };
  startedAt: Date | null;
  finishedAt: Date | null;
  creditsUsed: number;
  createdAt: Date;
}
const TestSchema = new Schema<ITest>(
  {
    device: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    clinic: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    vet: { type: String, default: '' },
    patient: {
      name: { type: String, default: '' },
      owner: { type: String, default: '' },
      species: { type: String, default: '' },
      sex: { type: String, default: '' },
      age: { type: String, default: '' },
      weight: { type: String, default: '' },
    },
    result: {
      positive: { type: Boolean, default: false },
      value: { type: Number, default: null },
    },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    creditsUsed: { type: Number, default: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* ------------------------------ CreditTx --------------------------------- */
export interface ICreditTx {
  _id: Types.ObjectId;
  clinic: Types.ObjectId;
  delta: number;              // +grant / -consume
  reason: 'admin_grant' | 'redeem' | 'test_consume' | 'signup_bonus';
  meta?: Record<string, unknown>;
  createdAt: Date;
}
const CreditTxSchema = new Schema<ICreditTx>(
  {
    clinic: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: ['admin_grant', 'redeem', 'test_consume', 'signup_bonus'],
      required: true,
    },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* ------------------------------- Admin ----------------------------------- */
export interface IAdmin {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
}
const AdminSchema = new Schema<IAdmin>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: 'Admin' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* ----------------------------- RedeemCode -------------------------------- */
export interface IRedeemCode {
  _id: Types.ObjectId;
  code: string;
  credits: number;
  usedBy: Types.ObjectId | null;
  usedAt: Date | null;
  createdAt: Date;
}
const RedeemCodeSchema = new Schema<IRedeemCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    credits: { type: Number, required: true, min: 1 },
    usedBy: { type: Schema.Types.ObjectId, ref: 'Clinic', default: null },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* Guard against model recompilation on Next.js hot reload. */
export const Clinic = (models.Clinic as mongoose.Model<IClinic>) || model<IClinic>('Clinic', ClinicSchema);
export const Device = (models.Device as mongoose.Model<IDevice>) || model<IDevice>('Device', DeviceSchema);
export const Test = (models.Test as mongoose.Model<ITest>) || model<ITest>('Test', TestSchema);
export const CreditTx = (models.CreditTx as mongoose.Model<ICreditTx>) || model<ICreditTx>('CreditTx', CreditTxSchema);
export const Admin = (models.Admin as mongoose.Model<IAdmin>) || model<IAdmin>('Admin', AdminSchema);
export const RedeemCode = (models.RedeemCode as mongoose.Model<IRedeemCode>) || model<IRedeemCode>('RedeemCode', RedeemCodeSchema);
