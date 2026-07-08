import { AuditLog } from '@/models';

// Record an admin/clinic action for traceability (clinical device compliance).
export async function logAudit(actor: string, action: string, target: string, detail: string) {
  try {
    await AuditLog.create({ actor, action, target, detail });
  } catch {
    // auditing must never break the primary action
  }
}
