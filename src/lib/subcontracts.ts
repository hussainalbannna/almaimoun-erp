// ════════════════════════════════════════════════════════════════════
//  محرّك عقود مقاولي الباطن — نظام الميمون ERP
//  المصدر الموحّد لتعريف العقود الاحترافية (كهرباء/سباكة) وتوليد صفحة
//  الطباعة الإنجليزية المهيّأة للطباعة فوق الورقة الحكومية المختومة.
//
//  فلسفة التصميم:
//  • كل القيم القابلة للتغيير تُحفظ في ContractSpec (JSON) على الإسناد.
//  • لقطات الأطراف (main/sub) تُحفظ داخل العقد كي يبقى المستند ثابتاً
//    حتى لو تغيّرت بيانات المقاول أو الشركة لاحقاً.
//  • البنود القانونية ثابتة (حماية المقاول الرئيسي) والنطاق قابل للتعديل.
// ════════════════════════════════════════════════════════════════════

export type TradeKey = 'electrical' | 'plumbing'
export type BuildingKey = 'one_storey' | 'two_storey' | 'three_storey' | 'commercial'

// ─── بيانات الشركة الثابتة (تتغيّر التسمية فقط حسب الفرع) ─────────────
export const MAIN_COMPANY = {
  cr: '120637-2',
  address: 'Bldg 1165T, Road 2933, Block 729, Jerdab, Kingdom of Bahrain',
  tel: '+973 3705 5576',
  email: 'Info@AlMaimounConst.com',
} as const

// اسم الشركة حسب رقم الفرع: 2/4/6 مقاولات — 5 مقاولات وتجارة
export const BRANCHES: { no: number; name: string }[] = [
  { no: 2, name: 'ALMAIMOUN CONSTRUCTION' },
  { no: 4, name: 'ALMAIMOUN CONSTRUCTION' },
  { no: 5, name: 'ALMAIMOUN CONSTRUCTION & TRADING' },
  { no: 6, name: 'ALMAIMOUN CONSTRUCTION' },
]

export function branchCompanyName(no: number): string {
  return BRANCHES.find(b => b.no === no)?.name ?? 'ALMAIMOUN CONSTRUCTION'
}

export const BUILDING_LABELS: Record<BuildingKey, string> = {
  one_storey: 'Single-Storey Villa',
  two_storey: 'Two-Storey Villa',
  three_storey: 'Three-Storey Villa',
  commercial: 'Commercial Building',
}

export const TRADE_LABELS: Record<TradeKey, { en: string; ar: string; subject: string }> = {
  electrical: { en: 'Electrical Works', ar: 'أعمال الكهرباء', subject: 'ELECTRICAL WORKS' },
  plumbing: { en: 'Plumbing & Sewage Works', ar: 'أعمال السباكة والصرف', subject: 'PLUMBING & SEWAGE WORKS' },
}

// ─── الأنواع ─────────────────────────────────────────────────────────
export interface ContractParty {
  name: string
  cr: string
  cpr: string
  address: string
  tel: string
  email: string
}

export interface ContractStage {
  seq: number
  description: string
  amount: number
}

export interface ContractSpec {
  version: 1
  trade: TradeKey
  language: 'en'
  branchNo: number
  contractDate: string          // YYYY-MM-DD
  buildingType: BuildingKey
  siteLocation: string          // مثل: SITRA
  main: ContractParty
  sub: ContractParty
  total: number
  warrantyMonths: number
  delayPenaltyPerDay: number
  additionalPointsMin: number
  additionalPointsMax: number
  scopeItems: string[]
  stages: ContractStage[]
}

// ─── القيم الافتراضية لكل تخصص (من النماذج المعتمدة) ─────────────────
const DEFAULT_STAGES: Record<TradeKey, ContractStage[]> = {
  electrical: [
    { seq: 1, description: 'Advance Payment', amount: 300 },
    { seq: 2, description: 'After Ground Floor PT Slab Piping Work', amount: 200 },
    { seq: 3, description: 'After Ground Floor Pipe & Box Work Completion', amount: 300 },
    { seq: 4, description: 'After First Floor PT Slab Piping Work', amount: 300 },
    { seq: 5, description: 'After First Floor Pipe & Box Work Completion', amount: 300 },
    { seq: 6, description: 'After Compound Area / Boundary Wall Pipes & Box Works Finish', amount: 250 },
    { seq: 7, description: 'Before Commencement of All Wiring Works', amount: 900 },
    { seq: 8, description: 'After Light, Switch & Socket Fixing / Fitting Installation', amount: 200 },
    { seq: 9, description: 'After Final Completion (Meter Fixing & Testing)', amount: 200 },
  ],
  plumbing: [
    { seq: 1, description: 'Commencement of Foundation Plumbing Work according to drawings', amount: 200 },
    { seq: 2, description: 'Completion of Foundation Plumbing Works according to drawings', amount: 200 },
    { seq: 3, description: 'Commencement of Ground Floor Work according to drawings', amount: 200 },
    { seq: 4, description: 'Completion of Ground Floor Works according to drawings', amount: 200 },
    { seq: 5, description: 'Commencement of First Floor Work according to drawings', amount: 300 },
    { seq: 6, description: 'Completion of First Floor Works according to drawings', amount: 300 },
    { seq: 7, description: 'Commencement of Building Roof & Staircase Room Work', amount: 300 },
    { seq: 8, description: 'Completion of Building Roof & Staircase Room Work', amount: 300 },
    { seq: 9, description: 'Commencement of Sanitary Ware & Accessories Installation', amount: 250 },
    { seq: 10, description: 'Completion of Sanitary Ware & Accessories Installation', amount: 250 },
    { seq: 11, description: 'Final Completion of All Works, Testing & Commissioning', amount: 300 },
  ],
}

const DEFAULT_SCOPE: Record<TradeKey, string[]> = {
  electrical: [
    'In-Wall & In-Slab Installation: Complete installation of all conduits, back boxes, wires, cables, and embedded fittings inside walls, floors, ceilings, and slabs.',
    'Approved Materials: Electrical wires manufactured in UAE, 100% brand new, EWA-approved (Light 1.5mm², Socket 2.5mm², AC 4.0mm², Main Cable 16mm² 3-Phase). Conduits supplied by Ansari Co.; PVC/metal boxes manufactured in Bahrain.',
    'Prohibition of Joints: All materials must be 100% brand new. No splices, joints, or inline connections are allowed inside walls, floors, or ceilings under any circumstances.',
    'Distribution Boards (DB): Supply and install all DBs, strictly of BSLI brand quality and fully compliant with EWA standards.',
    'Main Cable & Meter Connection: Supply and install the Main Cable (16mm² 3-Phase), cabling from Meter Board to DB, and execute official meter stamping and approval procedures.',
    'Low Voltage Provisions: Piping, backbox installation, and draw-wire provisions for CCTV, Internet/Data, TV, Intercom, and staircase step lighting — even if not explicitly detailed in drawings — without additional charges.',
    'Fixing of Accessories: Fixing and fitting of all finishing items (lights, switches, sockets, fans, exhaust fans, isolators, MCCB, earth rods, busbars) supplied by the Client/Main Contractor.',
  ],
  plumbing: [
    'In-Wall & Under-Slab Piping: Complete installation of all water supply lines, drainage pipes, sewage risers, floor drains, and sanitary ducts embedded inside walls, floors, ceilings, and foundations.',
    'Approved Materials: Sewer & drainage pipes strictly high-quality Bahrain Pipes brand or as approved by the Client. Water supply pipes strictly PPR or Poly (Polyethylene) from approved manufacturers.',
    'Plastic Inspection Chambers (No Masonry): Supply and install prefabricated plastic inspection chambers (gully traps/manholes). Brick/masonry chambers are strictly prohibited.',
    'Spring Check Valve: Supply and install a high-quality spring check valve (non-return valve) for the water supply / pump network.',
    'Sanitary Ware Installation: Client supplies external fixtures (toilets, washbasins, mixers, shower sets, water heaters, pumps); Subcontractor is responsible for professional installation, testing, and commissioning at no extra cost regardless of concealed/wall-mounted or standard types.',
    'Pressure & Leak Testing: Mandatory hydro-pressure testing of all water supply lines and leak testing of all drainage networks prior to wall plastering, tiling, or concrete pour.',
  ],
}

// ─── منشئ مواصفات افتراضية ──────────────────────────────────────────
export function stagesTotal(stages: ContractStage[]): number {
  return stages.reduce((s, st) => s + (Number(st.amount) || 0), 0)
}

export function defaultSpec(trade: TradeKey, contractDate: string): ContractSpec {
  const stages = DEFAULT_STAGES[trade].map(s => ({ ...s }))
  return {
    version: 1,
    trade,
    language: 'en',
    branchNo: 2,
    contractDate,
    buildingType: 'two_storey',
    siteLocation: '',
    main: {
      name: branchCompanyName(2),
      cr: MAIN_COMPANY.cr,
      cpr: '',
      address: MAIN_COMPANY.address,
      tel: MAIN_COMPANY.tel,
      email: MAIN_COMPANY.email,
    },
    sub: { name: '', cr: '', cpr: '', address: '', tel: '', email: '' },
    total: stagesTotal(stages),
    warrantyMonths: 18,
    delayPenaltyPerDay: 10,
    additionalPointsMin: trade === 'electrical' ? 10 : 5,
    additionalPointsMax: trade === 'electrical' ? 20 : 10,
    scopeItems: DEFAULT_SCOPE[trade].slice(),
    stages,
  }
}

// ─── أدوات العرض ─────────────────────────────────────────────────────
const fmt3 = (n: number): string =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

function longDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return iso }
}

// ════════════════════════════════════════════════════════════════════
//  مولّد صفحة الطباعة — إنجليزي، مهيّأ للورقة الحكومية المختومة
//  (بلا ترويسة/شعار؛ هامش علوي واسع لتجاوز رأس الورقة الرسمية المطبوع)
// ════════════════════════════════════════════════════════════════════
export function buildContractHTML(spec: ContractSpec): string {
  const trade = TRADE_LABELS[spec.trade]
  const building = BUILDING_LABELS[spec.buildingType]
  const total = spec.total
  const site = spec.siteLocation || '—'

  const scopeRows = spec.scopeItems
    .map(item => `<li>${esc(item)}</li>`)
    .join('')

  const stageRows = spec.stages
    .map(s => `
      <tr>
        <td class="c">${s.seq}</td>
        <td>${esc(s.description)}</td>
        <td class="r">${fmt3(s.amount)}</td>
      </tr>`)
    .join('')

  const compensation = fmt3(total)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Subcontract Agreement — ${esc(trade.subject)}</title>
<style>
  @page { size: A4; margin: 14mm 15mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a1a; background: #fff; font-size: 12.5px; line-height: 1.6;
  }
  .doc { max-width: 180mm; margin: 0 auto; }

  /* ── ترويسة الميمون الرسمية ── */
  .letterhead {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid #7b4a2d; padding-bottom: 12px; margin-bottom: 6px;
  }
  .lh-left { max-width: 60%; }
  .lh-name { font-size: 23px; font-weight: 800; color: #7b4a2d; letter-spacing: .5px; line-height: 1.1; }
  .lh-ar { font-size: 15px; font-weight: 700; color: #c4925a; margin-top: 2px; direction: rtl; }
  .lh-tag { font-size: 10.5px; color: #888; margin-top: 3px; letter-spacing: .3px; text-transform: uppercase; }
  .lh-right { text-align: right; font-size: 11px; color: #555; line-height: 1.7; padding-top: 2px; }
  .lh-right b { color: #333; }

  h1 { font-size: 18px; text-align: center; margin: 16px 0 3px; color: #222; letter-spacing: .3px; }
  .sub-title { text-align: center; font-size: 12.5px; margin: 0 0 14px; color: #7b4a2d; font-weight: 600; }
  .intro { margin: 9px 0; text-align: justify; }

  .parties { width: 100%; border-collapse: collapse; margin: 10px 0 14px; page-break-inside: avoid; }
  .parties td { width: 50%; vertical-align: top; padding: 10px 12px; border: 1px solid #c9c9c9; }
  .parties td:first-child { background: #faf6f1; }
  .parties .ttl { font-weight: 700; font-size: 10px; letter-spacing: .5px; color: #7b4a2d; margin-bottom: 4px; text-transform: uppercase; }
  .parties .nm { font-weight: 800; font-size: 13px; color: #222; margin-bottom: 3px; }

  h2 {
    font-size: 14px; margin: 16px 0 6px; color: #7b4a2d; padding-bottom: 3px;
    border-bottom: 2px solid #e5d9c8; page-break-after: avoid;
  }
  ul { margin: 6px 0; padding-inline-start: 20px; }
  li { margin: 5px 0; text-align: justify; page-break-inside: avoid; }

  table.pay { width: 100%; border-collapse: collapse; margin: 8px 0; page-break-inside: avoid; }
  table.pay th, table.pay td { border: 1px solid #b8b8b8; padding: 6px 8px; }
  table.pay th { background: #7b4a2d; color: #fff; font-size: 11.5px; text-align: left; }
  table.pay td.c { text-align: center; width: 30px; }
  table.pay td.r, table.pay th.r { text-align: right; width: 100px; }
  table.pay tbody tr:nth-child(even) td { background: #faf6f1; }
  table.pay tfoot td { font-weight: 800; background: #efe6d9; font-size: 13px; }

  .clause { margin: 8px 0; text-align: justify; page-break-inside: avoid; }
  .clause b { display: block; margin-bottom: 2px; color: #7b4a2d; }

  .sign { width: 100%; margin-top: 30px; border-collapse: collapse; page-break-inside: avoid; }
  .sign td { width: 50%; vertical-align: top; padding: 8px 12px; }
  .sig-line { margin-top: 34px; border-top: 1px solid #333; padding-top: 4px; font-size: 10.5px; color: #555; }
  .foot { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5d9c8; text-align: center; font-size: 9.5px; color: #999; }
</style>
</head>
<body>
  <div class="doc">
    <div class="letterhead">
      <div class="lh-left">
        <div class="lh-name">${esc(spec.main.name)}</div>
        <div class="lh-ar">مؤسسة الميمون للمقاولات</div>
        <div class="lh-tag">Construction &amp; Contracting</div>
      </div>
      <div class="lh-right">
        <b>C.R.</b> ${esc(spec.main.cr)}<br/>
        ${esc(spec.main.address)}<br/>
        <b>Tel:</b> ${esc(spec.main.tel)}<br/>
        <b>Email:</b> ${esc(spec.main.email)}
      </div>
    </div>

    <h1>SUBCONTRACT AGREEMENT FOR ${esc(trade.subject)}</h1>
    <div class="sub-title">Labor &amp; Materials Contract — ${esc(building)} Project at ${esc(site)}</div>

    <p class="intro">This Subcontract Agreement is entered into on <b>${esc(longDate(spec.contractDate))}</b>, by and between:</p>

    <table class="parties">
      <tr>
        <td>
          <div class="ttl">First Party (Main Contractor)</div>
          <div class="nm">${esc(spec.main.name)}</div>
          C.R. No.: ${esc(spec.main.cr)}<br/>
          ${esc(spec.main.address)}<br/>
          Tel: ${esc(spec.main.tel)} &nbsp;|&nbsp; ${esc(spec.main.email)}
        </td>
        <td>
          <div class="ttl">Second Party (Subcontractor)</div>
          <div class="nm">${esc(spec.sub.name)}</div>
          ${spec.sub.cr ? `C.R. No.: ${esc(spec.sub.cr)}<br/>` : ''}
          ${spec.sub.cpr ? `C.P.R. No.: ${esc(spec.sub.cpr)}<br/>` : ''}
          ${spec.sub.address ? `${esc(spec.sub.address)}<br/>` : ''}
          ${spec.sub.tel ? `Tel: ${esc(spec.sub.tel)}` : ''}
        </td>
      </tr>
    </table>

    <p class="intro">WHEREAS, the Main Contractor desires to subcontract the complete ${esc(trade.en.toLowerCase())}, material supply, and finishing works for a ${esc(building)} Project at ${esc(site)} ("the Works"), and the Subcontractor agrees to execute the Works in strict compliance with the applicable authority regulations, project drawings, and specifications. NOW, THEREFORE, IT IS MUTUALLY AGREED AS FOLLOWS:</p>

    <h2>1. Scope of Works &amp; Material Obligations</h2>
    <ul>
      ${scopeRows}
      <li>Inclusion of Free Additional Points (${spec.additionalPointsMin} to ${spec.additionalPointsMax} Points): If the Client/Owner requests additional points during execution, the Subcontractor shall supply and install up to a maximum of ${spec.additionalPointsMax} additional points completely free of charge, without demanding extra payment or variation orders.</li>
    </ul>

    <h2>2. Workmanship &amp; Structural Protection Standards</h2>
    <ul>
      <li>Precast Slab Protection: All conduits/pipes must be installed under the precast slab surface. Drilling, breaking, cutting, or chasing into precast slabs is strictly prohibited.</li>
      <li>Structural Integrity: Absolute prohibition of breaking, drilling, or altering any structural concrete element (foundations, columns, beams). The Subcontractor bears full financial and legal liability for any structural damage caused.</li>
      <li>Wall Chasing Method: Use of electric jackhammers or rotary hammers for wall chasing is strictly forbidden. Chasing must be done exclusively using a mechanical grinder (cutting machine) for precise, vibration-free cuts.</li>
    </ul>

    <h2>3. Payment Schedule</h2>
    <p class="clause">The total agreed lump-sum price is <b style="display:inline;color:#222;">BHD ${fmt3(total)}</b>, payable in installments upon stage completion as follows:</p>
    <table class="pay">
      <thead>
        <tr><th class="c" style="width:30px;text-align:center;">No.</th><th>Stage / Milestone Description</th><th class="r">Amount (BHD)</th></tr>
      </thead>
      <tbody>
        ${stageRows}
      </tbody>
      <tfoot>
        <tr><td colspan="2" style="text-align:right;">TOTAL SUBCONTRACT PRICE</td><td class="r">${fmt3(total)}</td></tr>
      </tfoot>
    </table>

    <h2>4. Special Protection &amp; Compensation Clauses</h2>
    <div class="clause"><b>4.1 Work Abandonment &amp; Full Contract Value Compensation:</b> If the Subcontractor abandons, ceases, stops, or leaves the Subcontract Works prior to complete handover for any reason whatsoever, the Main Contractor reserves the explicit legal right to claim and recover full compensation equal to the entire Contract Value (BHD ${compensation}) from the Subcontractor.</div>
    <div class="clause"><b>4.2 Client Work Suspension or Non-Payment Relief:</b> If the Client/Owner halts or suspends project work, or ceases/fails to disburse payments to the Main Contractor for any reason, the Main Contractor shall bear no financial obligations towards the Subcontractor for unpaid amounts or delays. Payments to the Subcontractor for corresponding stages remain strictly contingent upon receipt of funds from the Client.</div>
    <div class="clause"><b>4.3 Liquidated Delay Penalty:</b> If the Subcontractor delays completion or breaches the project schedule for reasons attributable to the Subcontractor, a liquidated delay penalty of BHD ${fmt3(spec.delayPenaltyPerDay)} per day of delay shall be levied and deducted directly from any pending or future payments.</div>
    <div class="clause"><b>4.4 Maintenance Warranty &amp; Defect Rectification (No Retention Withheld):</b> The Subcontractor provides a ${spec.warrantyMonths}-month maintenance warranty for all works starting from final project completion. While no retention money is withheld, the Subcontractor shall be solely responsible for resolving and repairing any fault at his own cost within 24–48 hours of notification.</div>
    <div class="clause"><b>4.5 Fixed Price Guarantee:</b> The agreed lump-sum amount of BHD ${fmt3(total)} is final and includes all labor, tools, equipment, transport, and specified materials. No additional claims shall be made unless agreed in writing by the Main Contractor.</div>

    <h2>5. Safety, Legal Compliance &amp; Governing Law</h2>
    <ul>
      <li>LMRA &amp; Labor Compliance: Subcontractor must employ only legal workers registered under LMRA in compliance with Bahrain Labor Law, and solely assumes all penalties or legal liabilities for LMRA violations.</li>
      <li>Site Safety &amp; Cleanliness: Subcontractor shall adhere to site health &amp; safety rules and remove all daily work waste/debris from the site.</li>
      <li>Termination Right: Main Contractor reserves the right to terminate this Agreement if the Subcontractor's performance is unsatisfactory despite written notices to rectify.</li>
      <li>Governing Law: This Agreement is governed by the laws and regulations of the Kingdom of Bahrain.</li>
    </ul>

    <p class="clause">IN WITNESS WHEREOF, the parties hereto have signed this Agreement on the day and year first above written.</p>

    <table class="sign">
      <tr>
        <td>
          <b>FIRST PARTY: ${esc(spec.main.name)}</b>
          <div class="sig-line">Signature &amp; Official Stamp</div>
          <div class="sig-line">Name / Designation / CPR</div>
        </td>
        <td>
          <b>SECOND PARTY: ${esc(spec.sub.name)}</b>
          <div class="sig-line">Signature &amp; Official Stamp</div>
          <div class="sig-line">Name / Designation / CPR</div>
        </td>
      </tr>
    </table>

    <div class="foot">${esc(spec.main.name)} &nbsp;|&nbsp; Subcontract Agreement &nbsp;|&nbsp; C.R. ${esc(spec.main.cr)} &nbsp;|&nbsp; ${esc(spec.main.tel)}</div>
  </div>
</body>
</html>`
}
