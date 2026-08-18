import mongoose, { Schema, model, models, Types } from 'mongoose';

/* ----------------------------------------------------------------------------
 * uriBX data model — DEVICE-CENTRIC (MongoDB / Mongoose)
 *
 *  Device  = the account. Keyed by its eFuse MAC (uid). Holds the display name,
 *            the touchscreen PIN (offline-verifiable), OPTIONAL web credentials,
 *            credits, calibration, and vet labels. There is no separate "clinic".
 *  Test    = one measurement a device performed (patient + result).
 *  CreditTx= ledger of a device's test-credit changes.
 *  Admin   = back-office (fleet) login.
 *  RedeemCode = a code redeemed for credits ("Add tests").
 *  AuditLog= back-office action trail.
 * ------------------------------------------------------------------------- */

/* ------------------------------- Device ---------------------------------- */
// Per-device photometer calibration: concentration = log10(i0/raw)*a + b,
// positive if concentration > ths.
export interface IDeviceConfig {
  i0: number;
  a: number;
  b: number;
  ths: number;
}
export interface IDevice {
  _id: Types.ObjectId;
  uid: string;                 // eFuse MAC (12 hex), unique per chip — identity
  name: string;                // display name (clinic/owner), set on the device
  pinSalt: string;             // salt for the device-side SHA-256 PIN verifier
  pinCheck: string;            // sha256(pinSalt + pin) — offline device unlock
  webUser: string | null;      // OPTIONAL web-panel login username (set on device)
  webPassHash: string | null;  // OPTIONAL web-panel password (bcrypt, server-side)
  credits: number;             // remaining test credits (admin-controlled)
  config: IDeviceConfig;       // calibration (admin-set)
  vets: string[];              // optional veterinarian names for labelling tests
  status: 'new' | 'active' | 'suspended'; // new = auto-registered, not set up yet
  fw: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
const DeviceSchema = new Schema<IDevice>(
  {
    uid: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, default: '' },
    pinSalt: { type: String, default: '' },
    pinCheck: { type: String, default: '' },
    webUser: { type: String, default: null, trim: true },
    webPassHash: { type: String, default: null },
    credits: { type: Number, default: 0, min: 0 },
    config: {
      i0: { type: Number, default: 10000 },
      a: { type: Number, default: 1 },
      b: { type: Number, default: 0 },
      ths: { type: Number, default: 1 },
    },
    vets: { type: [String], default: [] },
    status: { type: String, enum: ['new', 'active', 'suspended'], default: 'new' },
    fw: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
// Web login username is unique when present (sparse — many devices have none yet).
DeviceSchema.index(
  { webUser: 1 },
  { unique: true, partialFilterExpression: { webUser: { $type: 'string' } } }
);

/* -------------------------------- Test ----------------------------------- */
export interface ITest {
  _id: Types.ObjectId;
  device: Types.ObjectId;
  vet: string;
  patient: {
    name: string;
    owner: string;
    species: string;   // 'cat' | 'dog'
    sex: string;       // 'female' | 'male'
    age: string;
    weight: string;
  };
  raw: number | null;
  temp: number | null;
  result: {
    positive: boolean;
    value: number | null;   // computed concentration
  };
  startedAt: Date | null;
  finishedAt: Date | null;
  creditsUsed: number;
  clientId: string | null;  // device-generated id; dedupes offline re-uploads
  createdAt: Date;
}
const TestSchema = new Schema<ITest>(
  {
    device: { type: Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
    vet: { type: String, default: '' },
    patient: {
      name: { type: String, default: '' },
      owner: { type: String, default: '' },
      species: { type: String, default: '' },
      sex: { type: String, default: '' },
      age: { type: String, default: '' },
      weight: { type: String, default: '' },
    },
    raw: { type: Number, default: null },
    temp: { type: Number, default: null },
    result: {
      positive: { type: Boolean, default: false },
      value: { type: Number, default: null },
    },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    creditsUsed: { type: Number, default: 1 },
    clientId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
// Idempotent offline uploads: one record per (device, clientId) when set.
TestSchema.index(
  { device: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

/* ------------------------------ CreditTx --------------------------------- */
export interface ICreditTx {
  _id: Types.ObjectId;
  device: Types.ObjectId;
  delta: number;
  reason: 'admin_grant' | 'redeem' | 'test_consume' | 'signup_bonus' | 'test_dedupe_refund';
  meta?: unknown;
  createdAt: Date;
}
const CreditTxSchema = new Schema<ICreditTx>(
  {
    device: { type: Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: ['admin_grant', 'redeem', 'test_consume', 'signup_bonus', 'test_dedupe_refund'],
      required: true,
    },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* -------------------------------- Admin ---------------------------------- */
export interface IAdmin {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
const AdminSchema = new Schema<IAdmin>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: 'Admin' },
  },
  { timestamps: true }
);

/* ------------------------------ RedeemCode ------------------------------- */
export interface IRedeemCode {
  _id: Types.ObjectId;
  code: string;
  credits: number;
  usedByDevice: Types.ObjectId | null;
  usedAt: Date | null;
  createdAt: Date;
}
const RedeemCodeSchema = new Schema<IRedeemCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    credits: { type: Number, required: true, min: 1 },
    usedByDevice: { type: Schema.Types.ObjectId, ref: 'Device', default: null },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* ------------------------------ AuditLog --------------------------------- */
export interface IAuditLog {
  _id: Types.ObjectId;
  actor: string;
  action: string;
  target: string;
  detail: string;
  createdAt: Date;
}
const AuditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: String, required: true },
    action: { type: String, required: true },
    target: { type: String, default: '' },
    detail: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* ------------------------------ Firmware --------------------------------- */
// An OTA firmware release. The binary is hosted on GitHub Releases (url); this
// record is the manifest the device checks. Exactly one release is `active` at a
// time — that's the target a device compares its own `fw` against.
export interface IFirmware {
  _id: Types.ObjectId;
  version: string;   // semver-ish, e.g. "2.1.0" — compared against Device.fw
  url: string;       // HTTPS URL of the .bin (GitHub release asset)
  sha256: string;    // hex sha256 of the .bin (integrity reference)
  notes: string;
  active: boolean;   // the current rollout target (only one true at a time)
  createdAt: Date;
}
const FirmwareSchema = new Schema<IFirmware>(
  {
    version: { type: String, required: true, unique: true, trim: true },
    url: { type: String, required: true, trim: true },
    sha256: { type: String, default: '', trim: true, lowercase: true },
    notes: { type: String, default: '' },
    active: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* Guard against model recompilation on Next.js hot reload. */
export const Device = (models.Device as mongoose.Model<IDevice>) || model<IDevice>('Device', DeviceSchema);
export const Firmware = (models.Firmware as mongoose.Model<IFirmware>) || model<IFirmware>('Firmware', FirmwareSchema);
export const Test = (models.Test as mongoose.Model<ITest>) || model<ITest>('Test', TestSchema);
export const CreditTx = (models.CreditTx as mongoose.Model<ICreditTx>) || model<ICreditTx>('CreditTx', CreditTxSchema);
export const Admin = (models.Admin as mongoose.Model<IAdmin>) || model<IAdmin>('Admin', AdminSchema);
export const RedeemCode = (models.RedeemCode as mongoose.Model<IRedeemCode>) || model<IRedeemCode>('RedeemCode', RedeemCodeSchema);
export const AuditLog = (models.AuditLog as mongoose.Model<IAuditLog>) || model<IAuditLog>('AuditLog', AuditLogSchema);
