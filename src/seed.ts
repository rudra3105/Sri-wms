import { State, Product, Storage, Role, Zone, Rack, Customer, Supplier, Employee, User, StockRec, PriceEntry } from './types';
import { setClock, addDays, now, mulberry32, pad, DAY, SHELVES, BINS, dayKey, round2 } from './util';
import * as E from './engine';
import { qrP, qrL, qrK, prod, nextId, mv, totals } from './core';
import { ROLE_DEFAULTS, DEFAULT_APPROVAL_RULES } from './perms';

type CatDef = [string, string, Storage, number, string, boolean, string, number, string];
const CATS: CatDef[] = [
  ['Rice & Grains', 'RIC', 'ambient', 5, '1006', true, 'Bag', 2, 'Basmati Rice 25kg:1850|Sona Masoori Rice 25kg:1350|Wheat Flour 10kg:380|Toor Dal 5kg:620|Poha 1kg:58'],
  ['Edible Oils', 'OIL', 'ambient', 5, '1507', true, 'Carton', 2, 'Sunflower Oil 1L (Carton of 12):1320|Groundnut Oil 5L:780|Coconut Oil 1L:210|Mustard Oil 1L:165|Palm Oil 15kg Tin:1650'],
  ['Spices', 'SPC', 'ambient', 5, '0910', true, 'Pack', 1, 'Turmeric Powder 500g:95|Chilli Powder 500g:140|Coriander Powder 500g:85|Garam Masala 200g:110|Black Pepper 250g:190'],
  ['Beverages', 'BEV', 'ambient', 12, '2101', true, 'Case', 2, 'Tea Powder 1kg:340|Instant Coffee 200g:420|Fruit Juice 1L:78|Soft Drink 2L:72|Packaged Water 20L:55'],
  ['Dairy & Chilled', 'DAI', 'cold', 12, '0405', true, 'Pack', 1, 'Butter 500g:260|Cheese Block 1kg:480|Paneer 1kg:340|Curd Cup 400g:38|Ghee 1L:560'],
  ['Frozen Foods', 'FRZ', 'cold', 5, '0710', true, 'Pack', 1, 'Frozen Peas 1kg:130|French Fries 2kg:310|Ice Cream Tub 1L:190|Frozen Paratha 10pc:120|Chicken Nuggets 1kg:360'],
  ['Snacks & Confectionery', 'SNK', 'ambient', 12, '1905', true, 'Case', 1, 'Potato Chips 150g:38|Family Biscuit Pack:48|Chocolate Bar 40g:32|Namkeen Mix 400g:92|Roasted Cashew 500g:410'],
  ['Personal Care', 'PRC', 'ambient', 18, '3304', false, 'Pcs', 1, 'Bath Soap 100g:34|Shampoo 340ml:210|Toothpaste 150g:78|Face Cream 50g:165|Hair Oil 200ml:96'],
  ['Home Cleaning', 'CLN', 'ambient', 18, '3402', false, 'Pcs', 1, 'Detergent Powder 4kg:520|Dishwash Liquid 750ml:130|Floor Cleaner 2L:220|Toilet Cleaner 1L:105|Glass Cleaner 500ml:92'],
  ['Hazmat & Chemicals', 'HAZ', 'hazmat', 18, '3814', false, 'Can', 2, 'Industrial Solvent 5L:640|Pest Control Spray 1L:280|Paint Thinner 4L:420|Acid Cleaner 5L:310|Lubricant Spray 400ml:190'],
  ['Stationery', 'STN', 'ambient', 12, '4802', false, 'Pack', 1, 'A4 Paper Ream:215|Ball Pens Box of 50:260|Notebook Pack of 6:190|Marker Set of 12:240|File Folder Pack of 10:180'],
  ['Electronics Accessories', 'ELE', 'ambient', 18, '8544', false, 'Pcs', 1, 'USB-C Cable 1m:120|Power Bank 10000mAh:780|Wireless Mouse:310|Wired Earphones:140|LED Bulb 9W:55'],
  ['Small Appliances', 'APL', 'ambient', 18, '8516', false, 'Pcs', 4, 'Electric Kettle 1.5L:690|Mixer Grinder 750W:2150|Induction Cooktop:1850|Steam Iron:980|Table Fan 400mm:1650'],
  ['Kitchenware', 'KIT', 'ambient', 18, '7323', false, 'Set', 2, 'Steel Tiffin Set:420|Pressure Cooker 5L:1250|Non-stick Pan 24cm:560|Glass Bowl Set 6pc:480|Steel Water Bottle 1L:260'],
  ['Packaging Materials', 'PKG', 'ambient', 18, '3923', false, 'Bundle', 3, 'Corrugated Box 5-ply (10):320|BOPP Tape 48mm (6):210|Bubble Wrap Roll:540|Stretch Film 500mm:420|Poly Bags Pack of 500:260'],
  ['Hardware & Tools', 'HRD', 'ambient', 18, '8205', false, 'Pcs', 1, 'Screwdriver Set 12pc:290|Claw Hammer 500g:240|Measuring Tape 5m:90|Drill Bit Set 19pc:410|Adjustable Spanner 10in:260'],
  ['Pet Care', 'PET', 'ambient', 18, '2309', true, 'Pack', 1, 'Dog Food 3kg:780|Cat Food 1kg:340|Pet Shampoo 200ml:210|Chew Toy:120|Pet Treats 500g:260'],
  ['Baby Care', 'BBY', 'ambient', 12, '9619', true, 'Pack', 1, 'Baby Diapers M (60):720|Baby Wipes 80pc:110|Baby Lotion 200ml:190|Feeding Bottle 250ml:210|Baby Powder 400g:230'],
  ['Pharma OTC', 'PHR', 'ambient', 12, '3004', true, 'Box', 1, 'Paracetamol 500mg Strip:26|Antiseptic Liquid 500ml:140|Bandage Roll:38|ORS Sachet Box:90|Vitamin C Tablets:160'],
  ['Textiles', 'TEX', 'ambient', 5, '6302', false, 'Pcs', 2, 'Cotton Towel:180|Bedsheet Double:520|Pillow Cover Pair:130|Cotton Napkins Set:150|Table Cloth:280'],
];
const BINCAP: Record<string, number> = { A: 500, B: 500, C: 300, D: 200, E: 500, F: 1500, G: 300, H: 500, I: 500, J: 300 };
const ZONES: [string, string, string, Storage][] = [['A', 'WH1', 'Ambient General', 'ambient'], ['B', 'WH1', 'Fast-Moving Pick Face', 'ambient'], ['C', 'WH1', 'Cold Chain', 'cold'], ['D', 'WH1', 'Hazmat Cage', 'hazmat'], ['E', 'WH2', 'Ambient General', 'ambient'], ['F', 'WH2', 'Bulk Storage', 'ambient'], ['G', 'WH2', 'Cold Chain', 'cold'], ['H', 'WH3', 'Ambient General', 'ambient'], ['I', 'WH3', 'Fast-Moving Pick Face', 'ambient'], ['J', 'WH3', 'Cold Chain', 'cold']];
const COLORS = ['#0f766e', '#c2410c', '#1d4ed8', '#7c3aed', '#be123c', '#4d7c0f', '#0369a1', '#a16207'];

const EMPS: [string, string, Role, string, string, string][] = [
  ['E101', 'Ravi Kumar', 'whmanager', 'Warehouse Management', 'WH1', 'General'], ['E102', 'Priya Nair', 'supervisor', 'Warehouse Operations', 'WH1', 'Morning'], ['E103', 'Karthik S', 'invmanager', 'Inventory Control', 'WH1', 'General'],
  ['E104', 'Suresh Babu', 'receiving', 'Inbound', 'WH1', 'Morning'], ['E105', 'Anitha R', 'putaway', 'Inbound', 'WH1', 'Morning'], ['E106', 'Murugan K (Employee A)', 'picker', 'Outbound', 'WH1', 'Morning'],
  ['E107', 'Divya P', 'picker', 'Outbound', 'WH1', 'Evening'], ['E108', 'Lakshmi V', 'packer', 'Outbound', 'WH1', 'Morning'], ['E109', 'Imran S', 'packer', 'Outbound', 'WH1', 'Evening'],
  ['E110', 'Vijay M', 'gate', 'Dispatch', 'WH1', 'General'], ['E111', 'Rahul Shah', 'sales', 'Sales', 'WH1', 'General'], ['E112', 'Meena Iyer', 'accounts', 'Accounts', 'WH1', 'General'],
];
const CUSTS: [string, string, string, string, string, number, number, number][] = [
  ['Customer A – Greenfield Retail Pvt Ltd', 'Retail Chain', 'Tamil Nadu', 'Anand Raj', 'Chennai', 600000, 30, 7],
  ['Annapoorna Supermart', 'Retail Chain', 'Tamil Nadu', 'Gopal Krishnan', 'Coimbatore', 500000, 30, 5], ['Metro Bazaar Stores', 'Retail Chain', 'Karnataka', 'Shilpa Rao', 'Bengaluru', 800000, 45, 6],
  ['Sai Distributors', 'Distributor', 'Tamil Nadu', 'Venkatesh S', 'Madurai', 900000, 45, 9], ['Hotel Saravana Residency', 'HoReCa', 'Tamil Nadu', 'Murali K', 'Chennai', 250000, 15, 3], ['Kerala Fresh Mart', 'Wholesale', 'Kerala', 'Thomas Mathew', 'Kochi', 450000, 30, 6],
  ['City Institutional Supplies', 'Institution', 'Tamil Nadu', 'Dr. Ramesh', 'Trichy', 300000, 30, 5], ['Lakshmi General Stores', 'Wholesale', 'Tamil Nadu', 'Lakshmi Devi', 'Salem', 200000, 15, 6], ['Namma Kirana Hub', 'Retail Chain', 'Karnataka', 'Prakash N', 'Mysuru', 350000, 30, 4],
  ['Grand Catering Services', 'HoReCa', 'Tamil Nadu', 'Imtiaz A', 'Chennai', 220000, 15, 3], ['Deccan Wholesale Traders', 'Distributor', 'Maharashtra', 'Sunil Patil', 'Pune', 700000, 45, 8], ['Sri Murugan Provisions', 'Wholesale', 'Tamil Nadu', 'Murugesan', 'Tirunelveli', 180000, 15, 6],
  ['Campus Mart Co-op', 'Institution', 'Tamil Nadu', 'Sridevi', 'Vellore', 260000, 30, 5], ['Harbour View Hotels', 'HoReCa', 'Kerala', 'Joseph Paul', 'Kochi', 280000, 30, 3], ['Quick Basket Retail (Demo – low credit)', 'Retail Chain', 'Tamil Nadu', 'Ritu Sharma', 'Chennai', 8000, 15, 4],
];
const SUPS: [string, string, string, number, number][] = [
  ['Bharat Agro Foods', 'Chennai', 'Tamil Nadu', 30, 4], ['Southern Oils & Spices', 'Coimbatore', 'Tamil Nadu', 30, 5], ['Prime Beverages Ltd', 'Hyderabad', 'Telangana', 45, 3], ['CoolChain Dairy Co-op', 'Bengaluru', 'Karnataka', 15, 4], ['HomeCare Industries', 'Mumbai', 'Maharashtra', 45, 4],
  ['TechAccess Distribution', 'Chennai', 'Tamil Nadu', 30, 5], ['KitchenPro Manufacturing', 'Rajkot', 'Gujarat', 45, 3], ['PackWell Solutions', 'Hosur', 'Tamil Nadu', 30, 4], ['SafeChem Industries', 'Vadodara', 'Gujarat', 30, 3], ['Textile Mills Collective', 'Tiruppur', 'Tamil Nadu', 60, 5],
];
const VEH = ['TN 01 AB 4521', 'TN 09 CX 7788', 'KA 03 MN 2210', 'TN 38 DE 9012', 'TN 22 GH 3345'];
const DRV = ['Selvam P', 'Ramesh K', 'Basha A', 'Joseph D', 'Manoj T'];

export const emptyState = (): State => ({
  v: 3, seededAt: Date.now(),
  org: { name: 'Sri Company', product: 'SRI WMS', devBy: 'Webrise Global™', tagline: 'Complete Warehouse Control. Smarter Business Operations.', address: '[Editable placeholder] Plot No. __, Industrial Estate, City – PIN', gstin: '[Enter GSTIN]', email: 'accounts@sri-company.example', phone: '+91 00000 00000', state: 'Tamil Nadu', logo: 'SRI', currency: 'INR', tz: 'Asia/Kolkata', dateFmt: 'DD MMM YYYY', pan: '[Enter PAN]' },
  settings: { alloc: 'FEFO', discountApprovalPct: 15, adjustApprovalValue: 10000, sessionMin: 60, invPrefix: 'INV/', soPrefix: 'SO-', skuPrefix: 'SRI-', gstRate: 18, freightTax: 18, nearExpiryDays: 30, slowDays: 45, notif: { lowStock: true, expiry: true, grn: true, picking: true, dispatch: true, delivery: true, invoice: true, returns: true, supplier: true }, auditRetention: 7, twoFA: false, saas: false },
  counters: {}, warehouses: [], zones: [], racks: [], blockedBins: [], categories: [], products: [], customers: [], prices: [], suppliers: [], employees: [], users: [], stock: [], ledger: [], pos: [], inwards: [], tasks: [], orders: [], packs: [], gates: [], dispatches: [], invoices: [], payments: [], notes: [], returns: [], transfers: [], counts: [], approvals: [], audit: [], notifs: [], reqs: [], supInvs: [], scans: [], loginLog: [], tickets: [],
  rolePerms: JSON.parse(JSON.stringify(ROLE_DEFAULTS)), approvalRules: JSON.parse(JSON.stringify(DEFAULT_APPROVAL_RULES)),
  integrations: {}, session: { userId: null, mode: 'console', wh: 'ALL', page: 'home' },
});

export const INTEGRATIONS: { id: string; name: string; group: string; fields: string[]; status?: string; note?: string }[] = [
  { id: 'usb', name: 'USB / Bluetooth scanner (keyboard-wedge)', group: 'Hardware', fields: [], status: 'Ready – works via input focus', note: 'Scanners that emulate a keyboard work with every scan box today.' },
  { id: 'camera', name: 'Camera QR scanning', group: 'Hardware', fields: ['Scanner library', 'Camera permission'] }, { id: 'rfid', name: 'RFID readers', group: 'Hardware', fields: ['Reader host', 'Port'] },
  { id: 'thermal', name: 'Thermal / barcode label printers', group: 'Hardware', fields: ['Printer IP', 'Protocol (ZPL/TSPL)'] }, { id: 'scale', name: 'Weighing scales', group: 'Hardware', fields: ['Serial port', 'Baud rate'] },
  { id: 'conveyor', name: 'Conveyor systems', group: 'Hardware', fields: ['PLC endpoint'] }, { id: 'cctv', name: 'Warehouse cameras (computer vision)', group: 'Hardware', fields: ['RTSP URL', 'API key'] }, { id: 'iot', name: 'IoT temperature sensors', group: 'Hardware', fields: ['MQTT broker', 'Topic'] },
  { id: 'gps', name: 'GPS / vehicle tracking', group: 'Logistics', fields: ['Provider', 'API key'] }, { id: 'ship', name: 'Shipping aggregators', group: 'Logistics', fields: ['Provider', 'API key'] },
  { id: 'tally', name: 'Accounting software (Tally / Zoho)', group: 'Business', fields: ['Company ID', 'API key'] }, { id: 'erp', name: 'ERP system', group: 'Business', fields: ['Base URL', 'Client secret'] },
  { id: 'pay', name: 'Payment gateway', group: 'Business', fields: ['Merchant ID', 'Secret key'] }, { id: 'ecom', name: 'E-commerce platforms', group: 'Business', fields: ['Store URL', 'API key'] },
  { id: 'einv', name: 'GST e-invoicing (IRP)', group: 'Compliance', fields: ['GSP username', 'Client ID', 'Client secret'], note: 'Requires GSP onboarding and authorisation – not active.' }, { id: 'eway', name: 'E-way bill service', group: 'Compliance', fields: ['GSP username', 'Client secret'], note: 'Requires GSP onboarding and authorisation – not active.' },
  { id: 'wa', name: 'WhatsApp Business API', group: 'Messaging', fields: ['Phone number ID', 'Access token'] }, { id: 'email', name: 'Email (SMTP)', group: 'Messaging', fields: ['SMTP host', 'Username', 'Password'] },
  { id: 'sms', name: 'SMS gateway', group: 'Messaging', fields: ['Sender ID', 'API key'] }, { id: 'push', name: 'Push notifications', group: 'Messaging', fields: ['Server key'] }, { id: 'webhook', name: 'Webhooks', group: 'Messaging', fields: ['Endpoint URL', 'Signing secret'] },
  { id: 'ocr', name: 'AI document OCR (invoices/POs)', group: 'AI', fields: ['Provider', 'API key'] }, { id: 'voice', name: 'Voice-assisted picking', group: 'AI', fields: ['Provider'] },
];

export function buildSeed(): State {
  const rnd = mulberry32(2026);
  const R = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
  const T0 = Date.now();
  const d = emptyState(); d.seededAt = T0;
  const as = (r: string) => { d.session.userId = 'U-' + r; };
  setClock(addDays(T0, -120)); d.session.userId = null;
  INTEGRATIONS.forEach(i => (d.integrations[i.id] = { status: i.status || 'Not configured', fields: Object.fromEntries(i.fields.map(f => [f, ''])), lastSync: null, log: [] }));

  // warehouses / zones / racks
  d.warehouses = [
    { id: 'WH1', code: 'WH-CEN', name: 'Central Warehouse', type: 'Central warehouse', address: '[Editable] Industrial Estate, Chennai', phone: '+91 00000 00001', email: 'central@sri-company.example', manager: 'E101', hours: '06:00 – 22:00', active: true },
    { id: 'WH2', code: 'WH-REG', name: 'Regional Warehouse – Coimbatore', type: 'Regional warehouse', address: '[Editable] Logistics Park, Coimbatore', phone: '+91 00000 00002', email: 'regional@sri-company.example', manager: 'E102', hours: '07:00 – 21:00', active: true },
    { id: 'WH3', code: 'WH-DC', name: 'Distribution Center – Bengaluru', type: 'Distribution center', address: '[Editable] Warehousing Hub, Bengaluru', phone: '+91 00000 00003', email: 'dc@sri-company.example', manager: 'E101', hours: '06:00 – 23:00', active: true },
  ];
  d.zones = ZONES.map(([id, wh, name, storage]) => ({ id, wh, name, storage, binCap: BINCAP[id] } as Zone));
  for (const z of d.zones) for (let n = 1; n <= 10; n++) d.racks.push({ id: `${z.id}-${pad(n, 2)}`, zone: z.id, wh: z.wh, aisle: `${z.id}-AS${n <= 4 ? 1 : n <= 7 ? 2 : 3}`, blocked: false, maint: false } as Rack);

  // categories & products
  let pi = 0;
  CATS.forEach((c, ci) => {
    d.categories.push({ id: 'C' + pad(ci + 1, 2), name: c[0], prefix: c[1] });
    c[8].split('|').forEach(it => {
      const [name, cost] = it.split(':'); pi++; const costN = Number(cost); const price = Math.round(costN * (1.14 + rnd() * 0.16));
      const rop = R(24, 90);
      d.products.push({ id: 'P' + pad(pi, 4), sku: `${c[1]}-${pad(pi, 3)}`, name, cat: d.categories[ci].id, sub: c[0].split(' ')[0], brand: ['Sri Select', 'FreshCo', 'PrimeLine', 'HomeEssentials', 'NutriGold'][pi % 5], mfr: 'Demo Manufacturing Ltd', hsn: c[4], uom: c[6], purUom: c[6], salesUom: c[6], conv: 1,
        barcode: `890${pad(1000000 + pi * 137, 9)}`, gtin: `890${pad(1000000 + pi * 137, 9)}0`, desc: `${name} – ${c[0]}`, weight: R(1, 25), dims: '40x30x25 cm', pack: `${c[6]} / carton`, min: Math.round(rop * 0.6), max: rop * 6, rop, roq: rop * 2, cost: costN, price, tax: c[3], storage: c[2],
        tracking: c[5] ? 'batch' : ['Power Bank 10000mAh', 'Mixer Grinder 750W', 'Induction Cooktop'].includes(name) ? 'serial' : 'none', expiry: c[5], fragile: ['ELE', 'KIT', 'APL'].includes(c[1]), perishable: c[2] === 'cold', hazmat: c[2] === 'hazmat', slot: c[7], status: 'Active', color: COLORS[pi % 8], createdAt: T0 - 130 * DAY });
    });
  });

  // employees / users
  d.employees = EMPS.map(([id, name, role, dept, wh, shift], i) => {
    const att: Record<string, string> = {}; for (let k = 1; k <= 14; k++) { const dd = new Date(T0 - k * DAY); if (dd.getDay() === 0) continue; att[dayKey(dd.getTime())] = rnd() < 0.92 ? 'P' : rnd() < 0.5 ? 'L' : 'A'; }
    return { id, name, role, dept, wh, shift, phone: `+91 90000 0${pad(i + 10, 4)}`, joined: T0 - R(200, 1500) * DAY, status: 'Active', attendance: att, overtime: R(0, 12) } as Employee;
  });
  const U = (id: string, name: string, role: Role, extra: Partial<User> = {}): User => ({ id: 'U-' + id, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@sri-company.example`, role, wh: ['*'], active: true, twoFA: role === 'superadmin', dept: 'Operations', demo: true, ...extra });
  d.users = [U('superadmin', 'Arjun Mehta', 'superadmin', { dept: 'Management' }), U('whmanager', 'Ravi Kumar', 'whmanager', { empId: 'E101' }), U('supervisor', 'Priya Nair', 'supervisor', { empId: 'E102' }), U('invmanager', 'Karthik S', 'invmanager', { empId: 'E103' }), U('receiving', 'Suresh Babu', 'receiving', { empId: 'E104', wh: ['WH1'] }),
    U('putaway', 'Anitha R', 'putaway', { empId: 'E105', wh: ['WH1'] }), U('picker', 'Murugan K (Employee A)', 'picker', { empId: 'E106', wh: ['WH1'] }), U('picker2', 'Divya P', 'picker', { empId: 'E107', wh: ['WH1'], demo: false }), U('packer', 'Lakshmi V', 'packer', { empId: 'E108', wh: ['WH1'] }), U('packer2', 'Imran S', 'packer', { empId: 'E109', wh: ['WH1'], demo: false }),
    U('gate', 'Vijay M', 'gate', { empId: 'E110', wh: ['WH1'] }), U('sales', 'Rahul Shah', 'sales', { empId: 'E111' }), U('accounts', 'Meena Iyer', 'accounts', { empId: 'E112', dept: 'Accounts' }), U('procurement', 'Sanjay Rao', 'procurement', { dept: 'Procurement' }),
    U('customer', 'Anand Raj (Customer A)', 'customer', { customerId: 'C01', dept: 'Customer' }), U('auditor', 'Neha Kapoor', 'auditor', { dept: 'Internal Audit' })];

  // customers / suppliers
  d.customers = CUSTS.map(([name, cat, state, contact, city, limit, terms, disc], i) => ({ id: 'C' + pad(i + 1, 2), code: 'CUST-' + pad(i + 1, 3), name, company: name.replace('Customer A – ', ''), contact, phone: `+91 98000 0${pad(i + 100, 4)}`, email: `purchase${i + 1}@customer${i + 1}.example`, billing: `[Placeholder] ${city}, ${state}`, shipping: `[Placeholder] Delivery address, ${city}`, state, gstin: `${state === 'Tamil Nadu' ? '33' : state === 'Karnataka' ? '29' : state === 'Kerala' ? '32' : '27'}DEMO${pad(i + 1, 2)}0000A1Z${i % 9}`, creditLimit: limit, terms, category: cat, status: 'Active', baseDiscount: disc, advance: 0 } as Customer));
  d.suppliers = SUPS.map(([name, city, state, terms, rating], i) => ({ id: 'S' + pad(i + 1, 2), code: 'SUP-' + pad(i + 1, 3), name, company: name, contact: ['Mohan', 'Kavitha', 'Farooq', 'Deepa', 'Nikhil', 'Sowmya', 'Hardik', 'Senthil', 'Rakesh', 'Geetha'][i], phone: `+91 97000 0${pad(i + 100, 4)}`, email: `sales@supplier${i + 1}.example`, address: `[Placeholder] ${city}, ${state}`, gstin: `DEMOSUP${pad(i + 1, 3)}Z${i}`, terms, rating, status: 'Active', leadDays: R(3, 10) } as Supplier));

  // price lists
  let pl = 0; const mkP = (customerId: string, sku: string, rate: number, minQty: number, type: PriceEntry['type'], from: number, to: number | null) => d.prices.push({ id: 'PL' + ++pl, customerId, sku, rate: round2(rate), minQty, from, to, type, approved: true });
  d.customers.forEach((c, ci) => {
    for (let k = 0; k < 9; k++) { const p = d.products[(ci * 7 + k * 11) % d.products.length]; mkP(c.id, p.sku, p.price * (1 - (c.baseDiscount + R(2, 6)) / 100), 1, k % 3 === 0 ? 'Negotiated' : 'Contract', T0 - 100 * DAY, T0 + 250 * DAY); }
    const vp = d.products[(ci * 5 + 3) % d.products.length]; mkP(c.id, vp.sku, vp.price * 0.9, 50, 'Volume', T0 - 100 * DAY, null); mkP(c.id, vp.sku, vp.price * 0.86, 200, 'Volume', T0 - 100 * DAY, null);
    if (ci % 3 === 0) mkP(c.id, d.products[(ci + 20) % 100].sku, d.products[(ci + 20) % 100].price * 0.88, 10, 'Promotional', T0 - 10 * DAY, T0 + 20 * DAY);
    if (ci % 4 === 0) mkP(c.id, d.products[(ci + 50) % 100].sku, d.products[(ci + 50) % 100].price * 0.8, 1, 'Promotional', T0 - 80 * DAY, T0 - 20 * DAY);
  });

  // locations helper
  const binLists: Record<string, string[]> = {}; const cursor: Record<string, number> = {};
  const zoneBins = (zid: string) => (binLists[zid] ||= d.racks.filter(r => r.zone === zid).flatMap(r => { const o: string[] = []; for (let s = 1; s <= SHELVES; s++) for (let b = 1; b <= BINS; b++) o.push(`${r.id}-${pad(s, 2)}-${pad(b, 2)}`); return o; }));
  const seedPlace = (zid: string) => { cursor[zid] ||= 0; if (zid === 'A' && cursor.A === 10) cursor.A = 18; return zoneBins(zid)[cursor[zid]++]; };
  const zoneFor = (p: Product, wh: string) => { const idx = d.products.indexOf(p); if (wh === 'WH1') return p.storage === 'cold' ? 'C' : p.storage === 'hazmat' ? 'D' : idx % 3 === 0 && p.slot < 2 ? 'B' : 'A'; if (wh === 'WH2') return p.storage === 'cold' ? 'G' : p.slot >= 2 ? 'F' : 'E'; return p.storage === 'cold' ? 'J' : idx % 2 ? 'I' : 'H'; };
  const capQty = (p: Product, zid: string, q: number) => Math.max(1, Math.min(q, Math.floor(BINCAP[zid] / p.slot)));

  // opening stock
  const lowSet = new Set([3, 9, 14, 22, 31, 40, 47, 58, 66, 77]); const expiredSet = new Set([6, 28]); const nearSet = new Set([1, 11, 16, 36, 51, 82]);
  let batchN = 100; const mkStock = (p: Product, wh: string, qty: number, expDays: number | null, extra: Partial<StockRec> = {}) => {
    const zid = zoneFor(p, wh); const bin = extra.status && extra.status !== 'Available' ? null : seedPlace(zid); const exp = p.expiry && expDays != null ? addDays(T0, expDays) : null;
    const rec: StockRec = { id: nextId(d, 'S'), sku: p.sku, batch: p.tracking === 'none' ? 'NA' : `B${26}${pad(++batchN % 100, 2)}-${pad(batchN, 3)}`, mfg: exp ? exp - R(180, 330) * DAY : null, exp, wh, bin, qty: capQty(p, zid, qty), reserved: 0, picked: 0, status: 'Available', receivedAt: T0 - R(40, 119) * DAY, lastMove: T0 - R(40, 119) * DAY, ref: 'OPENING', ...extra };
    d.stock.push(rec); setClock(rec.receivedAt); mv(d, { type: 'OPENING', sku: p.sku, qty: rec.qty, delta: rec.qty, wh, to: bin || 'QC', batch: rec.batch, ref: 'Opening balance' }); return rec;
  };
  d.products.forEach((p, i) => {
    const wh1Q = lowSet.has(i) ? R(4, 14) : R(70, 340); const e1 = expiredSet.has(i) ? -9 : nearSet.has(i) ? R(6, 24) : R(120, 520);
    mkStock(p, 'WH1', wh1Q, e1); if (p.expiry && !lowSet.has(i) && i % 3 === 1) mkStock(p, 'WH1', R(40, 160), R(200, 540));
    if (i % 2 === 0 && p.storage !== 'hazmat') mkStock(p, 'WH2', R(50, 260), R(150, 500)); if (i % 4 === 0 && p.storage !== 'hazmat') mkStock(p, 'WH3', R(40, 200), R(150, 500));
    if (i % 17 === 5) mkStock(p, 'WH1', R(3, 9), null, { status: 'Damaged', ref: 'OPENING-DMG' }); if (i % 29 === 7) mkStock(p, 'WH1', R(10, 30), R(60, 200), { status: 'Quarantine', ref: 'OPENING-QC' });
  });
  // make some products dead/slow: older receivedAt
  const wh1 = (sku: string) => d.stock.filter(s => s.sku === sku && s.wh === 'WH1' && s.status === 'Available');

  const vehicle = (n: number) => ({ vehicle: VEH[n % 5], driver: DRV[n % 5], driverPhone: `+91 99000 0${pad(n + 100, 4)}` });
  const pickProducts = (n: number, wh: string, avoidHaz = true) => { const out: Product[] = []; let k = R(0, 99); while (out.length < n) { const p = d.products[k++ % 100]; if (avoidHaz && p.storage === 'hazmat' && wh !== 'WH1') continue; if (!out.includes(p)) out.push(p); } return out; };

  /* ---------- 10 purchase orders & receiving transactions ---------- */
  const putawayAll = (grnId: string, leaveOpen = 0) => {
    const ts = d.tasks.filter(t => t.type === 'putaway' && t.grnId === grnId);
    ts.forEach((t, i) => {
      const p = prod(d, t.lines[0].sku)!; const zid = zoneFor(p, t.wh); const bin = seedPlace(zid);
      if (i < ts.length - leaveOpen) { as('supervisor'); E.assignTask(d, t.id, { empId: 'E105', deadlineMin: 90, destBin: bin }); as('putaway'); const r = E.completePutaway(d, t.id, { product: qrP(p.sku), location: qrL(bin) }); if (!r.ok) throw new Error('seed putaway: ' + r.msg); }
      else { t.lines[0].destBin = bin; t.lines[0].suggested = bin; if (i === ts.length - 1 && leaveOpen === 1) { as('supervisor'); E.assignTask(d, t.id, { empId: 'E105', deadlineMin: 240 }); } }
    });
  };
  const receive = (poIdx: number, frac: number, mode: 'approve' | 'pending' | 'draft' | 'reject', open = 0) => {
    const po = d.pos[poIdx]; as('receiving'); const inId = E.createInward(d, { poId: po.id, wh: po.wh, ...vehicle(poIdx), invoiceRef: `SUP-INV-${1000 + poIdx * 13}` });
    const inw = d.inwards.find(x => x.id === inId)!;
    inw.lines.forEach((l, li) => {
      if (mode === 'draft' && li > 0) return; const p = prod(d, l.sku)!; const r = E.scanInward(d, inId, qrP(l.sku)); if (!r.ok) throw new Error('seed scan ' + r.msg);
      const received = Math.max(1, Math.round(l.expected * frac)); const dm = li === 0 && poIdx % 2 === 0 ? 2 : 0; const qr = li === 1 && poIdx % 3 === 0 ? 3 : 0;
      const exp = p.expiry ? addDays(now(), R(150, 480)) : null; E.recordLine(d, inId, l.id, { received, damaged: dm, quarantine: qr, batch: p.tracking !== 'none' ? `B26${pad(R(1, 12), 2)}-${R(100, 999)}` : 'NA', mfg: exp ? exp - R(120, 200) * DAY : null, exp, remarks: dm ? 'Outer carton damaged' : '' });
    });
    if (mode === 'draft') return inId;
    E.submitInward(d, inId); if (mode === 'pending') return inId;
    as('whmanager'); const ap = d.approvals.find(a => a.type === 'grn' && a.payload.inId === inId && a.status === 'Pending')!;
    if (mode === 'reject') { E.decideApproval(d, ap.id, false, 'Supplier invoice does not match quantities – returned'); return inId; }
    E.decideApproval(d, ap.id, true, 'Verified'); putawayAll(inId, open); return inId;
  };
  for (let k = 0; k < 10; k++) {
    setClock(addDays(T0, -32 + k * 2)); as('procurement'); const wh = k === 4 ? 'WH2' : k === 6 ? 'WH3' : 'WH1'; const ps = pickProducts(k === 0 ? 3 : R(2, 3), wh);
    const lines = ps.map(p => { const z = zoneFor(p, wh); return { sku: p.sku, qty: Math.min(R(8, 30) * 10, Math.floor(BINCAP[z] / p.slot)), rate: p.cost }; });
    const id = E.createPO(d, { supplierId: d.suppliers[k].id, wh, lines, expected: addDays(now(), k < 8 ? 3 : 6) });
    if (k <= 8) { as('whmanager'); E.poAction(d, id, 'approve'); } if (k <= 8) { as('procurement'); E.poAction(d, id, 'send'); } if (k === 7) E.poAction(d, id, 'asn', { vehicle: VEH[2], driver: DRV[2] });
  }
  for (let k = 0; k < 5; k++) { setClock(addDays(T0, -31 + k * 2) + 36e5 * 9); receive(k, 1, 'approve'); }
  setClock(addDays(T0, -22)); receive(5, 0.6, 'approve'); setClock(addDays(T0, -20)); receive(5, 0.4, 'reject');
  setClock(addDays(T0, -19)); receive(6, 0.5, 'approve', 1); setClock(addDays(T0, -1) + 36e5 * 9); receive(7, 0.4, 'draft'); setClock(addDays(T0, -1) + 36e5 * 13); receive(8, 1, 'pending');

  /* ---------- 20 sales orders ---------- */
  const custPick = (j: number) => d.customers[j % 3 === 0 ? 0 : (j * 7 + 2) % 14];
  const mkOrder = (j: number, nLines: number, cust = custPick(j)) => {
    as('sales'); const cands = d.products.filter(p => wh1(p.sku).length && p.storage !== 'hazmat'); const lines: { sku: string; qty: number }[] = []; let k = (j * 13) % cands.length;
    while (lines.length < nLines) { const p = cands[k++ % cands.length]; const av = totals(d, p.sku, 'WH1').available; if (av < 20 || lines.some(l => l.sku === p.sku)) continue; lines.push({ sku: p.sku, qty: R(4, Math.min(40, Math.floor(av / 3))) }); }
    return E.createOrder(d, { customerId: cust.id, wh: 'WH1', lines, freight: R(2, 8) * 100, packing: R(1, 3) * 50, deliveryDate: addDays(now(), 3), priority: j % 5 === 0 ? 'High' : 'Normal', instructions: j % 4 === 0 ? 'Deliver between 9am and 1pm' : '' });
  };
  const pickAll = (oid: string, emp: string, shortIdx = -1, only = 99) => {
    const o = d.orders.find(x => x.id === oid)!; const t = d.tasks.find(x => x.id === o.taskId)!; as(emp === 'E106' ? 'picker' : 'picker2');
    t.lines.forEach((l, i) => { if (i >= only) return; const q = i === shortIdx ? Math.max(0, l.qty - 1) : l.qty; const r = E.pickLine(d, t.id, i, { product: qrP(l.sku), location: qrL(l.bin!), qty: q, reason: q < l.qty ? 'Stock not found in bin' : undefined }); if (!r.ok) throw new Error('seed pick ' + r.msg); });
    return t.id;
  };
  const packAll = (oid: string) => { const o = d.orders.find(x => x.id === oid)!; as(o.lines.length % 2 ? 'packer' : 'packer2'); const items = o.lines.filter(l => l.picked > 0).map(l => ({ sku: l.sku, qty: l.picked })); const half = items.length > 2 ? 2 : items.length; const pk = items.length > 2 ? [{ items: items.slice(0, half) }, { items: items.slice(half) }] : [{ items }];
    E.packOrder(d, oid, { packages: pk.map((x, i) => ({ type: i ? 'Carton – Medium' : 'Carton – Large', weight: R(6, 22), dims: '60x40x40', items: x.items, photo: true })), checklist: { items: true, labels: true, seal: true, slip: true } }); };
  const gateTo = (oid: string, short = false) => { const o = d.orders.find(x => x.id === oid)!; as('gate'); const gid = E.gateOpen(d, oid); o.pkgIds.forEach(p => E.gateScanPackage(d, gid, qrK(p))); o.lines.filter(l => l.packed > 0).forEach((l, i) => E.gateScanItem(d, gid, qrP(l.sku), short && i === 0 ? l.packed - 1 : l.packed)); E.gateVerify(d, gid); return gid; };
  const dispatchIt = (gid: string, n: number) => { as('supervisor'); E.gateApproveDispatch(d, gid); as('gate'); return E.confirmDispatch(d, gid, { ...vehicle(n), transporter: ['Demo Logistics Pvt Ltd', 'SpeedLine Transport', 'Metro Freight Carriers'][n % 3], method: 'Road – FTL', etaDays: 1 }); };
  const HR = 36e5, MIN = 6e4;
  const tFor = (j: number) => (j <= 13 ? addDays(T0, -28 + j * 1.8) : T0 - [6 * HR, 1 * HR, 25 * MIN, 20 * MIN, 15 * MIN, 10 * MIN][j - 14]);
  for (let j = 0; j < 20; j++) {
    setClock(tFor(j)); const oid = mkOrder(j, 2 + (j % 3), j === 18 ? d.customers[14] : custPick(j)); const o = () => d.orders.find(x => x.id === oid)!;
    if (j === 19) break;
    as('sales'); const cr = E.confirmOrder(d, oid); if (j === 18) { if (!cr.pending) throw new Error('credit hold expected'); continue; }
    if (j === 10) { E.cancelOrder(d, oid, 'Customer postponed the order'); continue; }
    if (j >= 16) continue;
    as('supervisor'); const tId = o().taskId!; const emp = j === 15 || j % 3 !== 2 ? 'E106' : 'E107';
    if (j === 14) { setClock(tFor(j) + 30 * MIN); E.assignTask(d, tId, { empId: 'E107', deadlineMin: 30, priority: 'High' }); continue; }
    if (j === 15) { setClock(tFor(j) + 15 * MIN); E.assignTask(d, tId, { empId: 'E106', deadlineMin: 60, priority: 'Normal' }); setClock(tFor(j) + 30 * MIN); pickAll(oid, 'E106', -1, 1); continue; }
    setClock(now() + 2 * HR); E.assignTask(d, tId, { empId: emp, deadlineMin: 45, priority: j % 5 === 0 ? 'High' : 'Normal' });
    setClock(now() + 20 * MIN); const t = pickAll(oid, emp, j === 5 ? 0 : -1); E.completePick(d, t); if (j === 13) continue;
    setClock(now() + HR); packAll(oid); if (j === 12) continue;
    setClock(now() + HR); if (j === 11) { gateTo(oid, true); continue; }
    const gid = gateTo(oid); setClock(now() + HR); const dsp = dispatchIt(gid, j);
    if (j <= 6) { setClock(now() + 20 * HR); as('gate'); const dp = d.dispatches.find(x => x.id === dsp)!; E.deliver(d, dsp, { otp: dp.otp, receivedBy: d.customers.find(c => c.id === o().customerId)!.contact, signature: true, photo: true }); }
  }
  // finance: payments
  setClock(addDays(T0, -6)); as('accounts');
  d.invoices.forEach((inv, i) => { if (i < 3) { setClock(inv.date + DAY * (3 + i)); E.recordPayment(d, { customerId: inv.customerId, amount: inv.total, mode: ['NEFT', 'UPI', 'Cheque'][i % 3], ref: `UTR${700000 + i * 931}`, invoiceId: inv.id }); } else if (i === 3) { setClock(inv.date + DAY * 5); E.recordPayment(d, { customerId: inv.customerId, amount: Math.round(inv.total * 0.5), mode: 'NEFT', ref: 'UTR881200', invoiceId: inv.id }); } });
  // returns
  setClock(addDays(T0, -12)); as('sales'); const dOrd = d.orders.filter(o => o.status === 'Delivered');
  const o1 = dOrd[0]; const r1 = E.createReturn(d, { orderId: o1.id, lines: [{ sku: o1.lines[0].sku, qty: 2, reason: 'Damaged in transit', cond: 'Damaged' }, { sku: o1.lines[1].sku, qty: 1, reason: 'Wrong item delivered', cond: 'Good' }], refund: true, replacement: false });
  as('whmanager'); E.decideApproval(d, d.approvals.find(a => a.type === 'return' && a.payload.id === r1)!.id, true, 'OK'); as('receiving'); E.returnReceive(d, r1); as('invmanager'); E.returnInspect(d, r1, { 0: 'Damaged', 1: 'Restock' });
  setClock(addDays(T0, -2)); as('sales'); const o2 = dOrd[1]; E.createReturn(d, { orderId: o2.id, lines: [{ sku: o2.lines[0].sku, qty: 3, reason: 'Near expiry on arrival', cond: 'Good' }], refund: true, replacement: true });
  setClock(addDays(T0, -9)); as('invmanager'); const dmg = d.stock.find(s => s.status === 'Damaged' && s.qty > 3 && s.ref === 'OPENING-DMG'); if (dmg) E.createSupplierReturn(d, { stockId: dmg.id, qty: 2, reason: 'Manufacturing defect – supplier to credit' });
  // adjustments, counts, transfers
  setClock(addDays(T0, -7)); as('invmanager'); const adjS = d.stock.find(s => s.wh === 'WH1' && s.status === 'Available' && s.qty > 60 && s.reserved === 0)!; E.adjustStock(d, { stockId: adjS.id, kind: 'Correction', newQty: adjS.qty - 3, reason: 'Count variance found during shelf audit' });
  const wo = d.stock.find(s => s.wh === 'WH1' && s.status === 'Available' && s.qty > 80 && s.reserved === 0 && s.id !== adjS.id)!; E.adjustStock(d, { stockId: wo.id, kind: 'Write-off', qty: 5, reason: 'Water damage in rack' });
  const cr0 = d.racks.find(r => d.stock.some(s => s.bin && s.bin.startsWith(r.id + '-') && s.reserved === 0 && s.wh === 'WH1' && s.status === 'Available'))!; const cnt = E.createCount(d, { rack: cr0.id }); const cc = d.counts.find(c => c.id === cnt)!; const m: Record<string, number> = {}; const vi = cc.lines.findIndex(l => { const s0 = d.stock.find(x => x.id === l.stockId)!; return s0.qty - s0.reserved - s0.picked >= 1; }); cc.lines.forEach((l, i) => (m[l.stockId] = i === vi ? l.system - 1 : l.system)); E.submitCount(d, cnt, m);
  const cnt2 = E.createCount(d, { rack: d.racks.find(r => r.id !== cr0.id && d.stock.some(s => s.bin && s.bin.startsWith(r.id + '-') && s.wh === 'WH1' && s.status === 'Available' && s.reserved === 0))!.id });
  setClock(addDays(T0, -3)); const trS = d.stock.find(s => s.wh === 'WH1' && s.status === 'Available' && s.qty - s.reserved > 60 && prod(d, s.sku)!.storage === 'ambient' && prod(d, s.sku)!.slot === 1)!; const tp = prod(d, trS.sku)!;
  const tb = zoneBins('H').find(b => !d.stock.some(s => s.bin === b))!; E.createTransfer(d, { stockId: trS.id, qty: 20, toWh: 'WH3', toBin: tb, reason: 'Rebalance for Bengaluru demand' });
  as('whmanager'); const tap = d.approvals.find(a => a.type === 'transfer' && a.status === 'Pending')!; E.decideApproval(d, tap.id, true, 'Approved'); void tp;
  const trS2 = d.stock.find(s => s.wh === 'WH1' && s.status === 'Available' && s.qty - s.reserved > 50 && s.id !== trS.id && prod(d, s.sku)!.storage === 'ambient' && prod(d, s.sku)!.slot === 1)!; as('invmanager'); E.createTransfer(d, { stockId: trS2.id, qty: 15, toWh: 'WH2', toBin: zoneBins('E').find(b => !d.stock.some(s => s.bin === b))!, reason: 'Regional replenishment' });
  setClock(addDays(T0, -1)); as('invmanager'); const bigS = d.stock.find(s => s.wh === 'WH1' && s.status === 'Available' && s.qty >= 100 && s.reserved === 0)!; E.adjustStock(d, { stockId: bigS.id, kind: 'Write-off', qty: 12, reason: 'Expired batch destroyed – requires approval' });
  // requisitions
  setClock(addDays(T0, -4)); as('invmanager'); const lowP = d.products.filter((p, i) => lowSet.has(i)).slice(0, 3); const rq = E.createReq(d, { wh: 'WH1', lines: lowP.map(p => ({ sku: p.sku, qty: p.roq })), reason: 'Below reorder point' }); as('whmanager'); E.decideReq(d, rq, true);
  as('procurement'); E.addQuote(d, rq, { supplierId: 'S01', rate: lowP[0].cost, leadDays: 5 }); E.addQuote(d, rq, { supplierId: 'S02', rate: Math.round(lowP[0].cost * 0.97), leadDays: 8 });
  setClock(addDays(T0, 0) - 2 * 36e5); as('picker2'); const rt = d.tasks.find(t => t.type === 'pick' && t.status === 'Assigned'); if (rt) E.requestAssist(d, rt.id, 'Bin looks empty – need help');
  d.tickets.push({ id: 'TK1', at: T0 - 2 * DAY, customerId: 'C01', subject: 'Invoice copy request', body: 'Please share the invoice for last dispatch.', status: 'Open' });
  setClock(null); d.session = { userId: null, mode: 'console', wh: 'ALL', page: 'home' }; d.loginLog = [];
  d.notifs.forEach((n, i) => { n.read = i < d.notifs.length - 14; });
  void cnt2;
  return d;
}
