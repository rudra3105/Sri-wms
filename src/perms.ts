import { Role, State } from './types';

export const MODULES: { k: string; label: string; group: string }[] = [
  { k: 'overview', label: 'Overview', group: 'Main Dashboard' }, { k: 'activity', label: 'Activity Center', group: 'Main Dashboard' },
  { k: 'warehouses', label: 'Warehouses', group: 'Warehouse Operations' }, { k: 'locations', label: 'Zones & Locations', group: 'Warehouse Operations' }, { k: 'racks', label: 'Racks & Bins', group: 'Warehouse Operations' },
  { k: 'products', label: 'Products & SKUs', group: 'Warehouse Operations' }, { k: 'labels', label: 'QR & Labels', group: 'Warehouse Operations' }, { k: 'inward', label: 'Goods Inward', group: 'Warehouse Operations' },
  { k: 'qc', label: 'Quality Control', group: 'Warehouse Operations' }, { k: 'putaway', label: 'Putaway', group: 'Warehouse Operations' }, { k: 'inventory', label: 'Inventory', group: 'Warehouse Operations' },
  { k: 'transfers', label: 'Stock Transfers', group: 'Warehouse Operations' }, { k: 'counting', label: 'Cycle Counting', group: 'Warehouse Operations' }, { k: 'adjustments', label: 'Stock Adjustments', group: 'Warehouse Operations' },
  { k: 'customers', label: 'Customers', group: 'Sales & Orders' }, { k: 'pricelists', label: 'Customer Price Lists', group: 'Sales & Orders' }, { k: 'orders', label: 'Sales Orders', group: 'Sales & Orders' },
  { k: 'allocation', label: 'Order Allocation', group: 'Sales & Orders' }, { k: 'picking', label: 'Picking', group: 'Sales & Orders' }, { k: 'packing', label: 'Packing', group: 'Sales & Orders' },
  { k: 'gate', label: 'Gate Verification', group: 'Dispatch' }, { k: 'dispatch', label: 'Dispatch Planning', group: 'Dispatch' }, { k: 'deliveries', label: 'Deliveries', group: 'Dispatch' }, { k: 'returns', label: 'Returns', group: 'Dispatch' },
  { k: 'suppliers', label: 'Suppliers', group: 'Procurement' }, { k: 'requisitions', label: 'Purchase Requisitions', group: 'Procurement' }, { k: 'pos', label: 'Purchase Orders', group: 'Procurement' }, { k: 'supplierinv', label: 'Supplier Invoices', group: 'Procurement' },
  { k: 'invoices', label: 'Invoices', group: 'Finance' }, { k: 'payments', label: 'Payments', group: 'Finance' }, { k: 'ledger', label: 'Customer Ledger', group: 'Finance' }, { k: 'creditnotes', label: 'Credit & Debit Notes', group: 'Finance' }, { k: 'outstanding', label: 'Outstanding Balances', group: 'Finance' },
  { k: 'employees', label: 'Employees', group: 'Workforce' }, { k: 'tasks', label: 'Task Management', group: 'Workforce' }, { k: 'shifts', label: 'Shifts & Attendance', group: 'Workforce' }, { k: 'productivity', label: 'Productivity', group: 'Workforce' },
  { k: 'reports', label: 'Reports', group: 'Intelligence' }, { k: 'analytics', label: 'Analytics', group: 'Intelligence' }, { k: 'ai', label: 'AI Assistant', group: 'Intelligence' }, { k: 'forecasting', label: 'Forecasting', group: 'Intelligence' },
  { k: 'users', label: 'User Management', group: 'Administration' }, { k: 'roles', label: 'Roles & Permissions', group: 'Administration' }, { k: 'notifications', label: 'Notifications', group: 'Administration' }, { k: 'integrations', label: 'Integrations', group: 'Administration' },
  { k: 'approvals', label: 'Approval Workflows', group: 'Administration' }, { k: 'audit', label: 'Audit Logs', group: 'Administration' }, { k: 'settings', label: 'Settings', group: 'Administration' },
];
export const ACTIONS: { k: string; label: string }[] = [
  { k: 'product.write', label: 'Create / edit products' }, { k: 'location.write', label: 'Manage locations (block, maintenance)' }, { k: 'warehouse.write', label: 'Create / edit warehouses' },
  { k: 'inward.write', label: 'Receive goods & generate GRN' }, { k: 'putaway.assign', label: 'Assign putaway / picking tasks' }, { k: 'putaway.execute', label: 'Execute putaway' },
  { k: 'inventory.adjust', label: 'Adjust / write-off stock' }, { k: 'transfer.write', label: 'Stock transfers' }, { k: 'count.write', label: 'Cycle counting' }, { k: 'qc.write', label: 'Quality decisions' },
  { k: 'order.write', label: 'Create & confirm orders' }, { k: 'order.cancel', label: 'Cancel / hold orders' }, { k: 'price.write', label: 'Maintain customer rates' }, { k: 'customer.write', label: 'Maintain customers' },
  { k: 'pick.execute', label: 'Execute picking' }, { k: 'pack.execute', label: 'Execute packing' }, { k: 'gate.scan', label: 'Gate scanning' }, { k: 'dispatch.approve', label: 'Approve dispatch & overrides' }, { k: 'dispatch.confirm', label: 'Confirm dispatch & delivery' },
  { k: 'return.write', label: 'Raise / process returns' }, { k: 'supplier.write', label: 'Maintain suppliers' }, { k: 'po.write', label: 'Create / approve purchase orders' },
  { k: 'invoice.write', label: 'Invoices, notes & payments' }, { k: 'approve.decide', label: 'Decide approvals (per workflow rules)' }, { k: 'employee.write', label: 'Maintain employees' },
  { k: 'user.write', label: 'Manage users' }, { k: 'role.write', label: 'Edit role permissions' }, { k: 'settings.write', label: 'Edit settings & integrations' }, { k: 'report.export', label: 'Export reports' },
];
const ALLV = MODULES.map(m => m.k);
const V = (...k: string[]) => k.map(x => 'view:' + x);
const BASE = V('overview', 'activity', 'notifications');
export const ROLE_META: Record<Role, { label: string; desc: string }> = {
  superadmin: { label: 'Super Administrator', desc: 'Full control of every module & setting' }, whmanager: { label: 'Warehouse Manager', desc: 'Approvals, operations & oversight' }, supervisor: { label: 'Warehouse Supervisor', desc: 'Task assignment, dispatch approval' },
  invmanager: { label: 'Inventory Manager', desc: 'Stock, adjustments, counts, QC' }, receiving: { label: 'Receiving Operator', desc: 'Goods inward & inspection' }, putaway: { label: 'Putaway Operator', desc: 'Storage assignments (mobile)' },
  picker: { label: 'Picking Operator', desc: 'Pick tasks (mobile)' }, packer: { label: 'Packing Operator', desc: 'Packing workstation' }, gate: { label: 'Dispatch Gate Operator', desc: 'Final verification & dispatch' },
  sales: { label: 'Sales Executive', desc: 'Customers, rates & orders' }, accounts: { label: 'Accounts Executive', desc: 'Invoices, payments, ledgers' }, procurement: { label: 'Procurement Manager', desc: 'Suppliers & purchase orders' },
  customer: { label: 'Customer Portal User', desc: 'Self-service portal' }, auditor: { label: 'Auditor (Read-only)', desc: 'View everything, change nothing' },
};
export const ROLE_DEFAULTS: Record<Role, string[]> = {
  superadmin: ['*'],
  whmanager: [...V(...ALLV.filter(k => !['users', 'roles', 'settings'].includes(k))), 'product.write', 'location.write', 'warehouse.write', 'inward.write', 'putaway.assign', 'putaway.execute', 'inventory.adjust', 'transfer.write', 'count.write', 'qc.write', 'order.write', 'order.cancel', 'price.write', 'customer.write', 'dispatch.approve', 'dispatch.confirm', 'return.write', 'approve.decide', 'employee.write', 'report.export', 'po.write'],
  supervisor: [...BASE, ...V('warehouses', 'locations', 'racks', 'products', 'labels', 'inward', 'qc', 'putaway', 'inventory', 'transfers', 'orders', 'allocation', 'picking', 'packing', 'gate', 'dispatch', 'deliveries', 'returns', 'employees', 'tasks', 'shifts', 'productivity', 'reports', 'approvals', 'ai'), 'putaway.assign', 'order.cancel', 'dispatch.approve', 'dispatch.confirm', 'gate.scan', 'return.write', 'approve.decide', 'report.export'],
  invmanager: [...BASE, ...V('warehouses', 'locations', 'racks', 'products', 'labels', 'inward', 'qc', 'putaway', 'inventory', 'transfers', 'counting', 'adjustments', 'reports', 'analytics', 'forecasting', 'ai', 'approvals', 'suppliers', 'pos'), 'product.write', 'location.write', 'inventory.adjust', 'transfer.write', 'count.write', 'qc.write', 'approve.decide', 'report.export'],
  receiving: [...BASE, ...V('products', 'labels', 'inward', 'qc', 'putaway', 'inventory', 'racks'), 'inward.write', 'qc.write'],
  putaway: [...BASE, ...V('putaway', 'inventory', 'racks', 'locations', 'tasks', 'labels'), 'putaway.execute'],
  picker: [...BASE, ...V('picking', 'tasks', 'inventory'), 'pick.execute'],
  packer: [...BASE, ...V('packing', 'orders', 'labels'), 'pack.execute'],
  gate: [...BASE, ...V('gate', 'dispatch', 'deliveries', 'orders'), 'gate.scan', 'dispatch.confirm'],
  sales: [...BASE, ...V('customers', 'pricelists', 'orders', 'allocation', 'returns', 'invoices', 'inventory', 'products', 'ledger', 'deliveries'), 'order.write', 'price.write', 'customer.write', 'return.write'],
  accounts: [...BASE, ...V('customers', 'orders', 'invoices', 'payments', 'ledger', 'creditnotes', 'outstanding', 'reports', 'supplierinv', 'analytics', 'approvals', 'returns', 'deliveries'), 'invoice.write', 'approve.decide', 'report.export'],
  procurement: [...BASE, ...V('suppliers', 'requisitions', 'pos', 'supplierinv', 'inventory', 'products', 'reports', 'forecasting', 'inward', 'analytics', 'ai'), 'supplier.write', 'po.write', 'report.export'],
  customer: ['portal'],
  auditor: [],
};
export function canRole(rp: Record<string, string[]>, role: Role | string | undefined, perm: string): boolean {
  if (!role) return false; if (role === 'superadmin') return true;
  if (role === 'auditor') return perm.startsWith('view:'); if (role === 'customer') return perm === 'portal';
  const l = rp[role] || ROLE_DEFAULTS[role as Role] || []; return l.includes('*') || l.includes(perm);
}
export const can = (s: State, perm: string | null | undefined) => { if (!perm) return true; const u = s.users.find(x => x.id === s.session.userId); return canRole(s.rolePerms, u?.role, perm); };
export const DEFAULT_APPROVAL_RULES: State['approvalRules'] = {
  grn: { required: true, roles: ['whmanager'], label: 'GRN approval' }, qc_reject: { required: true, roles: ['whmanager', 'invmanager'], label: 'Quality rejection' },
  adjust: { required: true, roles: ['invmanager', 'whmanager'], threshold: 10000, label: 'Stock adjustment' }, writeoff: { required: true, roles: ['whmanager'], label: 'Stock write-off' },
  transfer: { required: true, roles: ['whmanager'], label: 'Inter-warehouse transfer' }, price: { required: true, roles: ['whmanager'], label: 'Special pricing' },
  discount: { required: true, roles: ['whmanager', 'accounts'], threshold: 15, label: 'Discount approval' }, order_cancel: { required: true, roles: ['whmanager', 'supervisor'], label: 'Order cancellation' },
  dispatch_discrepancy: { required: true, roles: ['supervisor', 'whmanager'], label: 'Dispatch discrepancy override' }, invoice_cancel: { required: true, roles: ['whmanager', 'accounts'], label: 'Invoice cancellation' },
  credit_override: { required: true, roles: ['accounts', 'whmanager'], label: 'Credit limit override' }, return: { required: true, roles: ['whmanager', 'supervisor'], label: 'Return approval' },
};
