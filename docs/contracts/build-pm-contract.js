const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, Header, Footer, PageNumber, ShadingType, HeightRule, VerticalAlign, TabStopType,
  PageBreak, TableLayoutType,
} = require("docx");

const NAVY = "1F3864";
const GREY = "8C8C8C";
const LINE = "BFC9D9";
const LABEL_FILL = "F3F5F9";
const FONT = "Calibri";
const SZ = 21; // 10.5pt
const pt = (n) => Math.round(n * 20);

// ---------- text helpers ----------
// "**bold**" and "*italic*" markers inside strings.
// "[[name]]" puts a DocuSign anchor "/name/" in tiny white text: template fields are anchored to these,
// so they land in the right cell however DocuSign lays the pages out.
function runs(text, base = {}) {
  const parts = String(text).split(/\[\[([a-z0-9]+)\]\]/i);
  if (parts.length > 1)
    return parts.flatMap((t, i) =>
      i % 2 ? [new TextRun({ text: `/${t}/`, font: FONT, size: 2, color: "FFFFFF" })] : t ? plainRuns(t, base) : []
    );
  return plainRuns(text, base);
}
function plainRuns(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, size: SZ, ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, size: SZ, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, font: FONT, size: SZ, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, size: SZ, ...base }));
  return out;
}
const SPACING = { line: 252, after: pt(5) };
const P = (text, opts = {}, base = {}) =>
  new Paragraph({ children: runs(text, base), spacing: SPACING, ...opts });

const H = (text, before = 10) =>
  new Paragraph({
    children: [new TextRun({ text, bold: true, color: NAVY, font: FONT, size: SZ })],
    spacing: { before: pt(before), after: pt(6) },
    keepNext: true,
  });
const SECTION_LABEL = (text, before = 13, after = 6) =>
  new Paragraph({
    children: [new TextRun({ text, bold: true, color: NAVY, font: FONT, size: SZ })],
    spacing: { before: pt(before), after: pt(after) },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 2 } },
    keepNext: true,
  });
const SUB = (text) =>
  new Paragraph({
    children: [new TextRun({ text, bold: true, color: NAVY, font: FONT, size: SZ })],
    spacing: { before: pt(6), after: pt(3) },
    keepNext: true,
  });

// numbered clause: number at 72pt, text at 108pt
const HANG = pt(36);
const clause = (num, text) =>
  new Paragraph({
    children: [new TextRun({ text: num, bold: true, font: FONT, size: SZ }), new TextRun({ text: "\t", font: FONT, size: SZ }), ...runs(text)],
    indent: { left: HANG, hanging: HANG },
    tabStops: [{ type: TabStopType.LEFT, position: HANG }],
    spacing: SPACING,
  });
// continuation paragraph inside a clause
const cont = (text) => new Paragraph({ children: runs(text), indent: { left: HANG }, spacing: SPACING });
// lettered / bulleted item under a clause
const item = (text, marker = "–") =>
  new Paragraph({
    children: [new TextRun({ text: marker, font: FONT, size: SZ }), new TextRun({ text: "\t", font: FONT, size: SZ }), ...runs(text)],
    indent: { left: HANG + pt(22), hanging: pt(22) },
    tabStops: [{ type: TabStopType.LEFT, position: HANG + pt(22) }],
    spacing: { line: 259, after: pt(3) },
  });
// section 3/4 dash lists
const dash = (text) =>
  new Paragraph({
    children: [new TextRun({ text: "–", font: FONT, size: SZ }), new TextRun({ text: "\t", font: FONT, size: SZ }), ...runs(text)],
    indent: { left: pt(52), hanging: pt(10) },
    tabStops: [{ type: TabStopType.LEFT, position: pt(52) }],
    spacing: { line: 259, after: pt(2) },
  });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// ---------- table helpers ----------
const B = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const BORDERS = { top: B, bottom: B, left: B, right: B };
const NOB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NOBORDERS = { top: NOB, bottom: NOB, left: NOB, right: NOB };
const MARGINS = { top: pt(3), bottom: pt(3), left: pt(6), right: pt(6) };

function cell(content, width, o = {}) {
  const paras = (Array.isArray(content) ? content : [content]).map((c) =>
    c instanceof Paragraph
      ? c
      : new Paragraph({
          children: runs(String(c), o.run || {}),
          alignment: o.align,
          spacing: { line: 240, after: 0 },
        })
  );
  return new TableCell({
    children: paras,
    width: { size: pt(width), type: WidthType.DXA },
    borders: o.borders || BORDERS,
    margins: MARGINS,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    verticalAlign: o.valign || VerticalAlign.TOP,
    columnSpan: o.span,
  });
}
const label = (t, w, o = {}) => cell(t, w, { fill: LABEL_FILL, ...o });
const head = (t, w, o = {}) => cell(t, w, { fill: NAVY, run: { bold: true, color: "FFFFFF" }, ...o });
function table(widths, rows) {
  return new Table({
    width: { size: pt(widths.reduce((a, b) => a + b, 0)), type: WidthType.DXA },
    columnWidths: widths.map(pt),
    layout: TableLayoutType.FIXED,
    rows,
  });
}
const row = (cells, h, rule = HeightRule.ATLEAST) =>
  new TableRow({ children: cells, height: h ? { value: pt(h), rule } : undefined, cantSplit: true });

// ======================================================================
// PAGE 1
// ======================================================================
const body = [];
body.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: pt(9), after: pt(2) },
    children: [new TextRun({ text: "PROPERTY MANAGEMENT AGREEMENT", bold: true, color: NAVY, font: FONT, size: 30 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: pt(12) },
    children: [new TextRun({ text: "Residential Rental Property  •  Province of Ontario", color: "595959", font: FONT, size: 16 })],
  }),
  P('This Property Management Agreement (the **"Agreement"**) is made as of [[pmfeff]]______________________ (the **"Effective Date"**) between the parties identified below.', { spacing: { line: 259, after: pt(8) } })
);

// Engagement type
const engage = new Paragraph({
  spacing: { line: 240, after: 0 },
  indent: { firstLine: pt(19) },
  tabStops: [{ type: TabStopType.LEFT, position: pt(287) }],
  children: runs("[[pmeng1]]New engagement — 12-month Initial Term applies (s. 2.1)\t[[pmeng2]]Re-signing an existing landlord (s. 2.10)"),
});
const managedSince = new Paragraph({
  spacing: { line: 240, after: 0 },
  tabStops: [{ type: TabStopType.LEFT, position: pt(90) }],
  children: [
    ...runs("[[pmfms]]"),
    new TextRun({ text: "\t", font: FONT, size: SZ }),
    new TextRun({ text: "Complete only when re-signing. If 12 months or more, this Agreement runs month-to-month under s. 2.10.", font: FONT, size: 15 }),
  ],
});
body.push(
  table([117, 351], [
    row([label("Engagement type", 117), cell(engage, 351, { valign: VerticalAlign.BOTTOM })], 34),
    row([label("Managed since", 117), cell(managedSince, 351)], 26),
  ])
);

body.push(SECTION_LABEL("LANDLORD", 9, 5));
body.push(
  table([117, 144, 73, 134], [
    row([label("Landlord is", 117), cell("[[pmlis]]", 351, { span: 3 })], 24),
    row([
      label(new Paragraph({ spacing: { line: 240, after: 0 }, children: [...runs("Corporation name "), new TextRun({ text: "(if any)", font: FONT, size: 15, color: "595959" })] }), 117),
      cell("[[pmfcorp]]", 144),
      label("Corp. number", 73),
      cell("[[pmfcorpno]]", 134),
    ]),
    row([label("Address for notices", 117), cell("[[pmfnotice]]", 351, { span: 3 })]),
  ])
);

body.push(P("Owner(s) of the Property — list every registered owner:", { spacing: { before: pt(8), after: pt(4) } }));
const ownerRows = [
  row([head("Owner / registered name", 183), head("Ownership %", 66), head("Phone", 99), head("Email", 120)]),
];
for (let i = 0; i < 6; i++)
  ownerRows.push(row([cell(`[[pmo${i + 1}n]]`, 183), cell(`[[pmo${i + 1}p]]`, 66), cell(`[[pmo${i + 1}t]]`, 99), cell(`[[pmo${i + 1}e]]`, 120)], 26));
body.push(table([183, 66, 99, 120], ownerRows));

body.push(
  P("**Authorized Signatory** — the one individual with authority to sign this Agreement and to give instructions and approvals on behalf of all owners (section 1.6):", { spacing: { before: pt(8), after: pt(4) } })
);
body.push(
  table([117, 144, 73, 134], [
    row([label("Name", 117), cell("[[pmsn]]", 144), label("Phone", 73), cell("[[pmst]]", 134)], 24),
    row([label("Capacity", 117), cell("[[pmsc]]", 144), label("Email", 73), cell("[[pmse]]", 134)], 24),
  ])
);
body.push(pageBreak());
body.push(SECTION_LABEL("MANAGER", 0, 6));
body.push(
  table([81, 153, 64, 170], [
    row([label("Legal name", 81), cell("**IRep Property Management**", 153), label("Phone", 64), cell("519-590-7200", 170)]),
    row([label("Address", 81), cell("6-2557 Dougall Ave, Suite 223, Windsor, ON N8X 1T5", 153), label("Email", 64), cell("administration@IRepPM.ca", 170)]),
    row([label("HST No.", 81), cell("72502 0143 RT0001", 153), cell("", 64), cell("", 170)]),
  ])
);
body.push(SECTION_LABEL("THE PROPERTY", 16, 6));
body.push(
  table([117, 351], [
    row([label("Municipal address", 117), cell("[[pmfaddr]]", 351)]),
    row([label("City / Postal code", 117), cell("[[pmfcity]]", 351)]),
    row([label("Property type", 117), cell("[[pmptype]]", 351)], 24),
    row([label("Units / bedrooms", 117), cell("[[pmunits]]", 351)], 24),
    row([label("Leases anticipated", 117), cell("[[pmleases]]", 351)], 24),
    row([label("Commencement date", 117), cell("[[pmfstart]]", 351)]),
  ])
);

// ======================================================================
// BODY
// ======================================================================
const S = (t) => body.push(H(t));
const C = (n, t) => body.push(clause(n, t));
const I = (t, m) => body.push(item(t, m));
const N = (t) => body.push(cont(t));
const D = (t) => body.push(dash(t));

body.push(H("1.   APPOINTMENT, PARTIES AND AUTHORITY", 12));
C("1.1", "The Landlord appoints the Manager as the exclusive property manager of the Property, and the Manager accepts that appointment, on the terms of this Agreement.");
C("1.2", "The Manager acts as agent of the Landlord only in respect of the services expressly described in this Agreement and only within the authority granted here. The Manager has no authority to bind the Landlord beyond that authority.");
C("1.3", "The Manager is an independent contractor. Nothing in this Agreement creates a partnership, joint venture, employment or fiduciary relationship beyond that of a service provider and its client.");
C("1.4", 'In this Agreement, **"Lease"** means one tenancy agreement in respect of the Property, regardless of how many tenants are named on it. Two or more occupants sharing a single tenancy agreement count as one Lease; separate agreements for individual rooms or units each count as a separate Lease.');
C("1.5", '**"Landlord"** means, collectively, each individual and each corporation named as an owner on page 1. Where more than one person or entity is named, their obligations under this Agreement are joint and several, and each of them is bound by this Agreement whether or not they sign it personally.');
C("1.6", 'The Landlord designates the individual named as Authorized Signatory on page 1 (the **"Authorized Signatory"**) as the sole point of authority under this Agreement. Where the Landlord is a single individual, that individual is the Authorized Signatory.');
C("1.7", "The Authorized Signatory is authorized, on behalf of every owner, to: sign this Agreement and any amendment to it; add or remove optional services under Schedule A; give or withhold approval for work exceeding the Maintenance Threshold; set or change the Maintenance Threshold; give directions in respect of the tenancies, including directions to prepare and serve notices under section 11; designate the account to which rent is remitted; and give and receive notices under this Agreement.");
C("1.8", "The Manager is entitled to rely on any instruction, approval, direction or notice given by the Authorized Signatory as that of every owner, and is not required to obtain or confirm the consent of any other owner. Notice given by the Manager to the Authorized Signatory is notice to every owner.");
C("1.9", "The Authorized Signatory may be changed only by written notice to the Manager signed by all owners or, where the Landlord is a corporation, signed by an officer or director of the corporation. The change takes effect when the Manager receives that notice. Until then, the Manager may continue to rely on the Authorized Signatory named on page 1.");
C("1.10", "The person signing as Authorized Signatory represents and warrants that they hold the authority described in sections 1.6 and 1.7 and, where the Landlord is a corporation, that they have authority to bind the corporation.");
C("1.11", "The Manager remits rent and provides statements to a single account and a single owner contact designated in writing by the Authorized Signatory. The Manager has no obligation to divide, apportion or separately account for funds among multiple owners.");
C("1.12", "A dispute among owners does not suspend this Agreement. If the Manager receives conflicting instructions from two or more owners, the Manager may act on the instruction of the Authorized Signatory or, at its option, take no action on the disputed matter until the owners provide a single written instruction signed by all of them.");

S("2.   TERM, RENEWAL AND TERMINATION");
C("2.1", 'Subject to sections 2.10 and 2.11, the initial term of this Agreement is twelve (12) months beginning on the Commencement Date (the **"Initial Term"**).');
C("2.2", "At the end of the Initial Term this Agreement continues automatically on a month-to-month basis on the same terms until terminated in accordance with this section.");
C("2.3", "**Termination by the Landlord.** After the Initial Term, or at any time where section 2.10(b) applies, the Landlord may terminate this Agreement by giving the Manager sixty (60) days’ written notice.");
C("2.3A", "**Termination by the Manager.** The Manager may terminate this Agreement, or any optional service, at any time and for any reason or no reason, by written notice to the Landlord. Termination takes effect on the date stated in the notice, which may be the date the notice is given. The Manager is not liable to the Landlord for any loss, cost or damages arising from a termination under this section. No notice period, minimum term or early termination charge applies to the Manager. Section 2.7 applies on termination.");
C("2.4", "Optional services selected in Schedule A that carry a minimum term bind the Landlord for that term. If the Landlord terminates this Agreement or an optional service before the end of its minimum term, other than under section 2.5 for the Manager’s breach, the Landlord shall pay the monthly fees for that service for the balance of its minimum term. Minimum terms do not bind the Manager.");
C("2.5", "Either party may terminate this Agreement immediately by written notice if the other party:");
I("commits a material breach and fails to cure it within fifteen (15) days of written notice;", "(a)");
I("becomes insolvent or bankrupt; or", "(b)");
I("directs or requires the other party to act unlawfully or contrary to the Residential Tenancies Act, 2006.", "(c)");
N("The Manager may also terminate this Agreement immediately by written notice if:");
I("any amount owing to the Manager is unpaid fifteen (15) days after it is due;", "(d)");
I("the Landlord, or anyone acting for the Landlord, threatens, harasses or abuses the Manager’s staff, contractors or the tenants; or", "(e)");
I("the Landlord fails to maintain the insurance required by section 7.4.", "(f)");
N("A termination by the Manager under this section 2.5 is a termination for the Landlord’s breach, and section 2.8 applies.");
C("2.6", "If the Landlord sells or otherwise transfers the Property, the Landlord shall give the Manager written notice no later than the date of the accepted agreement of purchase and sale, and this Agreement terminates on the closing date. All fees earned to that date remain payable, and where closing falls within the Initial Term the early termination charge in section 2.8 applies except as waived under section 2.9.");
C("2.7", "On termination for any reason:");
I("within thirty (30) days, the Manager shall deliver to the Landlord the keys, access devices, leases, tenant ledgers and records in its possession;", "(a)");
I("within the same thirty (30) days, the Manager shall remit all rent and deposits held, net of amounts owing under this Agreement, with a final statement of account;", "(b)");
I("the Manager may hold back a reasonable amount for fees, expenses and charges not yet invoiced, and shall account for it within sixty (60) days;", "(c)");
I("from the termination date, the Landlord is responsible for the Property, the tenancies, and any notice or Landlord and Tenant Board matter in progress; and", "(d)");
I("fees earned to the termination date remain payable.", "(e)");
C("2.8", "**Early termination charge.** If, before the end of the Initial Term, the Landlord terminates this Agreement (other than under section 2.5 for the Manager’s breach), the Manager terminates it under section 2.5 for the Landlord’s breach, or it ends under section 2.6 on a sale, the Landlord shall pay out the remainder of the Initial Term. The amount payable is the total of the monthly management fee under section 5 and the monthly fees for all optional services then selected under Schedule A, multiplied by the number of whole and partial months remaining in the Initial Term, plus HST. That amount is due within fifteen (15) days of the termination date and may be deducted from any rent or funds held by the Manager. The parties agree this is a reasonable pre-estimate of the Manager’s loss and not a penalty. For clarity, amounts payable under section 2.4 for optional services are included in, and not charged in addition to, this amount for months falling within the Initial Term. This section does not apply to a termination by the Manager under section 2.3A.");
C("2.9", "**Waiver on sale with IRep Realty Inc.** Where the Agreement is ending before the end of the Initial Term because the Landlord is selling the Property, the early termination charge in section 2.8 is waived in full if the Landlord lists the Property for sale with IRep Realty Inc., a real estate brokerage related to the Manager, under a signed listing agreement, and the sale of the Property closes through that listing. If that listing agreement is terminated, expires without a sale, or the Property is sold other than through IRep Realty Inc., the charge under section 2.8 revives and becomes payable on the earlier of the closing date and the date the listing ends. Nothing in this section obliges the Landlord to list with IRep Realty Inc., and the Landlord’s choice of brokerage is the Landlord’s alone. The Landlord acknowledges that the Manager has disclosed its relationship with IRep Realty Inc.");
C("2.10", "**Existing landlords.** Where the Manager has managed the Property under an earlier agreement, the Engagement Type block on page 1 shows which of the following applies:");
I("**New engagement:** this Agreement is treated as a new engagement from the Effective Date. The Initial Term, the first-year discount under section 5.7 and the early termination charge under section 2.8 apply as for a new client, despite the earlier management, and section 2.11 does not apply.", "(a)");
I("**Re-signing, where the Manager has managed the Property continuously for twelve (12) months or more as at the Effective Date:** no new Initial Term applies. This Agreement runs month to month from the Effective Date, the Landlord may end it on sixty (60) days’ written notice under section 2.3, and no early termination charge under section 2.8 is payable. Optional services already provided for twelve (12) months or more likewise continue month to month; an optional service newly added on or after the Effective Date carries its own minimum term under section 6.2.", "(b)");
N("In either case, this Agreement replaces the earlier agreement from the Effective Date. Amounts owing under the earlier agreement remain payable.");
C("2.11", "**Re-signing a landlord managed for less than twelve months.** Where page 1 shows a re-signing and the Manager has managed the Property for less than twelve (12) months as at the Effective Date, the Initial Term ends twelve (12) months after the date shown as “Managed since” on page 1, and not twelve months after the Effective Date. Signing this Agreement does not restart or extend the original twelve-month commitment.");

S("3.   CORE MANAGEMENT SERVICES");
body.push(P('For the management fee set out in section 5, the Manager will provide the following services (the **"Core Services"**):'));
body.push(SUB("Tenant management"));
D("Acting as the point of contact for tenants and handling day-to-day tenancy communications.");
D("Administering leases, renewals, rent increases permitted by law, and lease enforcement.");
D("Coordinating move-ins and move-outs, key handling, and move-in / move-out condition checks.");
D("Handling tenant complaints and disputes between occupants.");
body.push(SUB("Rent collection and accounting"));
D("Collecting rent and permitted deposits, and following up on arrears.");
D("Maintaining rent ledgers and records of receipts and disbursements for the Property.");
D("Providing the Landlord with a monthly statement showing rent collected, expenses deducted and the net amount remitted.");
body.push(SUB("Maintenance coordination"));
D("Receiving and triaging maintenance requests from tenants.");
D("Dispatching and coordinating third-party trades and vendors, and authorizing work within the maintenance budget in section 9.");
D("Obtaining quotes and seeking Landlord approval for work above the maintenance budget threshold.");
D("Arranging work through independent contractors. The Manager does not carry out repairs or optional services itself.");
body.push(SUB("Inspections and reporting"));
D("Periodic physical check-ups of the Property, as reasonably required by the Manager.");
D("One (1) thorough written condition report on the Property per calendar year, provided to the Landlord.");
body.push(SUB("Tenancy notices"));
D("Preparing notices under the Residential Tenancies Act, 2006 for the Landlord’s signature, serving them, and providing a Certificate of Service, as set out in section 11.");

S("4.   SERVICES NOT INCLUDED");
body.push(P("The following are not included in the management fee and are provided only if selected and paid for under Schedule A, or arranged separately in writing:"));
D("Any optional service in Schedule A that is not selected.");
D("Leasing and tenant placement (see Schedule A, Part 3).");
D("Representation, filing or attendance at the Landlord and Tenant Board (see section 11).");
D("Renovations, capital projects, project management of major works, and the cost of any repairs, materials or trades.");
D("Legal, accounting, insurance, mortgage, property tax and utility obligations of the Landlord.");
D("Payment of the Landlord’s expenses out of the Manager’s own funds.");

S("5.   MANAGEMENT FEE");
C("5.1", "The base management fee is $175.00 per month for the Property, which includes the first Lease at the Property.");
C("5.2", "For each additional Lease at the Property beyond the first, the Landlord shall pay an additional $25.00 per month.");
C("5.3", "Example: a room-rental home with seven (7) bedrooms rented on seven (7) individual Leases is charged $175.00 for the Property and the first Lease, plus 6 × $25.00 for the remaining six Leases, for a total of $325.00 per month.");
C("5.4", "The management fee is a fixed monthly amount based on the number of Leases anticipated at the Property as recorded on page 2. It is payable in full each month whether or not every room or unit is rented, including while a unit is vacant, between tenants or under repair, or after a Lease has ended or been broken. There is no reduction, proration or suspension for vacancy or loss of rent, except as the Manager waives under section 5.9.");
C("5.5", "The management fee and all Schedule A fees are payable monthly in advance and are deducted from rent collected under section 8. If rent collected in a month is insufficient, the balance is payable by the Landlord on invoice.");
C("5.6", "All fees in this Agreement are exclusive of HST. HST at 13% is added to all fees. Manager’s HST registration number: 72502 0143 RT0001.");
C("5.7", "**First-year discount (if applicable).** A total discount of [[pmfdisca]]________________ is granted, applied as [[pmfdiscm]]______________ per month for the twelve (12) months following the Commencement Date. This includes an existing landlord moved to this Agreement as a new engagement under section 2.10(a). The discount ends automatically after those twelve months without further notice, does not apply to Schedule A optional service fees, and ends early if this Agreement ends.");
C("5.8", "**Changes to the number of Leases.** The number of Leases changes only when the configuration of the Property permanently changes, as agreed in writing by the Authorized Signatory: a room or unit is added, removed or taken out of rental use, or the Property converts between whole-home and room rental. The change takes effect on the first day of the following month and is recorded by amending Schedule A, Part 1. Tenant turnover does not change the number of Leases.");
C("5.9", "**Waivers.** The Manager may, at its sole discretion, waive or reduce any fee for any month. For example, it may waive the management fee for a month in which all rent collected comes from a Lease that began that month. A waiver applies only to the month and amount stated and does not waive any other fee.");
C("5.10", "**Overdue amounts.** Any amount owing to the Manager that is unpaid fifteen (15) days after invoice bears interest from the due date until paid at two percent (2%) per month, which is twenty-four percent (24%) per year, calculated and compounded monthly. While any amount is overdue, the Manager may suspend any or all services, including optional services, without liability.");

S("6.   OPTIONAL SERVICES");
C("6.1", "The optional services described in Schedule A are provided only where selected in Schedule A and are charged at the fixed rates set out there. Those rates are not negotiable on a per-item basis.");
C("6.2", "Optional services may be added at any time during the term by written agreement of the parties, including by email confirmation, and take effect on the first day of the following month. An added service carries the same minimum term, starting on the date it is added.");
C("6.3", "An optional service with no minimum term may be cancelled by either party on thirty (30) days’ written notice. An optional service with a minimum term may be cancelled by the Landlord effective at the end of its minimum term on thirty (30) days’ written notice, or earlier subject to section 2.4. The Manager may cancel any optional service under section 2.3A.");
C("6.4", "The detailed terms, inclusions and exclusions for each optional service are set out in Schedule B and form part of this Agreement.");

S("7.   LANDLORD OBLIGATIONS");
C("7.1", "The Landlord shall provide the Manager with keys and access devices, copies of all existing leases, tenant ledgers, records of deposits held, and any known information about defects or outstanding issues at the Property.");
C("7.2", "The Landlord shall respond to any request for approval from the Manager within [[pmfresp]]________________ (if left blank, forty-eight (48) hours). If the Landlord does not respond in time, the Manager is not obliged to carry out the work and is not liable for any consequence of the delay.");
C("7.3", "The Landlord remains responsible for compliance with the Residential Tenancies Act, 2006, the Ontario Fire Code, the Building Code, municipal by-laws, and any applicable rental, lodging house or licensing requirements affecting the Property.");
C("7.4", "The Landlord shall maintain property insurance and commercial general liability insurance on the Property of not less than $2,000,000 per occurrence, shall name the Manager as an additional insured, and shall provide evidence of that coverage on request and on each renewal.");
C("7.5", "The Landlord shall not give instructions directly to tenants, contractors or vendors in respect of the Property without first informing the Manager, and shall promptly forward to the Manager any communication received from a tenant.");
C("7.6", "The Landlord shall reimburse the Manager for any properly incurred expense that exceeds rent collected within ten (10) days of invoice.");

S("8.   RENT COLLECTION AND REMITTANCE");
C("8.1", "Rent, deposits and other tenant payments are collected by the Manager as agent for the Landlord and held in the Manager’s trust or designated bank account pending remittance. The Landlord is not entitled to any interest earned on funds held.");
C("8.2", "The Manager remits to the Landlord on a net basis. The Manager deducts, in the following order: the management fee and Schedule A fees plus HST; maintenance and repair costs authorized under section 9; and any other expense authorized by the Landlord in writing.");
C("8.3", "**Remittance.** The Manager remits rent to the Landlord, net of amounts deducted under section 8.2, as follows:");
I("if all rent due for the month is received before the 7th day of the month, the Manager remits it by the next business day after the last payment is received;", "(a)");
I("otherwise, on the 7th day of the month (or the next business day if the 7th is not a business day), the Manager remits all rent received to that date; and", "(b)");
I("rent received after that remittance is remitted by the next business day after it is received.", "(c)");
N("Rent is “received” when the funds have cleared into the Manager’s account, including through any payment service such as PayProp. A remittance is made when it is sent, and the Manager is not responsible for bank or payment-system delays. The Manager provides a statement of account for each month.");
C("8.4", "The Manager is not a guarantor of rent, is not responsible for tenant arrears or non-payment, and has no obligation to advance its own funds to the Landlord.");
C("8.5", "**Unpaid rent.** Unless the Landlord instructs otherwise in writing, the Landlord instructs the Manager to prepare an N4 for the Landlord’s signature for any tenant whose rent remains unpaid after the 7th day of the month.");
C("8.6", "**Deposit interest.** Where the Manager holds a rent deposit for the Landlord, the Landlord remains responsible under the Residential Tenancies Act, 2006 for paying or crediting tenants the annual interest on it. The Manager may pay that interest from rent collected and deduct it under section 8.2.");
C("8.7", "**Set-off.** The Manager may set off any amount the Landlord owes it, under this Agreement or otherwise, against any funds it holds for the Landlord.");

S("9.   MAINTENANCE BUDGET AND AUTHORIZATION");
C("9.1", 'The Landlord shall set an automated maintenance budget for the Property of $250 per occurrence (the **"Maintenance Threshold"**).');
C("9.2", "Any maintenance or repair at or below the Maintenance Threshold is arranged immediately by the Manager without further approval, and the cost is deducted from rent collected.");
C("9.3", "Any work expected to exceed the Maintenance Threshold requires the Landlord’s approval before it proceeds, except as provided in section 9.4.");
C("9.4", "In an emergency — where there is a risk to health, safety or the Property, or where immediate action is required by law — the Manager may authorize work exceeding the Maintenance Threshold and shall notify the Landlord as soon as reasonably possible and in any event within twenty-four (24) hours.");
C("9.5", "The Maintenance Threshold may be changed at any time by written notice from the Landlord, including by email, effective on receipt.");
C("9.6", "**Related contractor.** The Landlord acknowledges that the Manager may engage Chuck Fixed My House, a business owned by Zan (Chuck) Greksa, a manager of the Manager, to carry out maintenance, repairs and optional services at the Property. It is engaged on the same terms as any other contractor, at rates the Manager considers reasonable for the work. The Landlord consents to this arrangement, and to the Manager engaging other contractors related to it on the same basis.");

S("10.   LIABILITY, INDEMNITY AND INSURANCE");
C("10.1", "**Contractors.** The Manager arranges maintenance, repairs and optional services through independent contractors and does not perform the work itself. Every contractor, including Chuck Fixed My House and any other contractor related to the Manager, is an independent contractor and not the Manager’s employee or agent. Each contractor is solely responsible for its workmanship, materials, workers and site safety, and for maintaining its own WSIB coverage (or exemption) and commercial general liability insurance. The Manager is not liable for any act, omission, delay, defect, damage or injury arising from a contractor’s work, or for any contractor’s failure to perform. The Landlord’s recourse for a contractor’s work is against that contractor. On request, the Manager will pass on any warranty it receives from a contractor.");
C("10.2", "The Manager is not liable for the tenants or occupants of the Property or their guests, including their acts, omissions, conduct, illegal activity, damage, injury, arrears or failure to pay rent.");
C("10.3", "The Manager is not liable for loss of rent, including during vacancy, turnover, repairs or any Board or court proceeding. It is also not liable for loss of profit, loss of opportunity, fines or penalties imposed on the Landlord, or any indirect, incidental or consequential loss, however caused.");
C("10.4", "The Manager’s total liability for all claims together under or relating to this Agreement is limited to the management fees paid by the Landlord to the Manager in the three (3) months before the event giving rise to the first claim. This applies whether the claim is in contract, tort (including negligence) or otherwise.");
C("10.5", "The Landlord shall indemnify and hold harmless the Manager and its principals, officers, managers, employees, contractors and agents from all claims, demands, actions, fines, losses, damages, costs and expenses, including legal fees on a full indemnity basis, arising out of:");
I("the Property and its condition;", "(a)");
I("the tenancies and anything a tenant or occupant does;", "(b)");
I("any act or omission of a contractor;", "(c)");
I("any instruction given by the Landlord or the Authorized Signatory;", "(d)");
I("the Landlord’s breach of this Agreement or of any law; or", "(e)");
I("the performance of the services under this Agreement.", "(f)");
C("10.6", "Sections 2.7, 8.7 and this section 10 survive termination of this Agreement.");
C("10.7", "**Exception.** Nothing in this section 10 limits the Manager’s liability for its own fraud or wilful misconduct.");
C("10.8", "**Landlord’s compliance.** The Manager acts on the information and instructions the Landlord gives it and is entitled to rely on them. The Landlord remains solely responsible for the Property’s compliance with all laws, including:");
I("the Residential Tenancies Act, 2006, including rent increases and deposits;", "(a)");
I("the Ontario Fire Code and Building Code;", "(b)");
I("municipal by-laws and any rental, lodging-house or licensing requirement; and", "(c)");
I("the Landlord’s taxes, insurance and mortgage.", "(d)");
C("10.9", "**Time limit for claims.** Any claim against the Manager must be started within one (1) year after the Landlord first knew, or ought to have known, of it.");
C("10.10", "**Events beyond control.** The Manager is not liable for any delay or failure to perform caused by events beyond its reasonable control, including weather, fire, flood, utility or internet outages, labour or supply shortages, illness, government action, pandemic, or a tenant’s refusal of entry.");
C("10.11", "**No personal liability.** No principal, officer, manager or employee of the Manager is personally liable to the Landlord under or in connection with this Agreement. The Landlord’s recourse is against the Manager only.");

S("11.   TENANCY NOTICES AND THE LANDLORD AND TENANT BOARD");
C("11.1", "On the Landlord’s instruction, the Manager will prepare the notices prescribed under the Residential Tenancies Act, 2006 (the N-forms), using information the Landlord provides or approves, for the Landlord’s review and signature. The Manager will then serve each signed notice and give the Landlord a Certificate of Service. The Landlord decides whether to give a notice, signs every notice, and is responsible for its contents.");
C("11.2", "The Manager does not represent the Landlord at the Landlord and Tenant Board. The Manager does not file applications with the Board, does not attend hearings, and does not act as the Landlord’s representative or agent in any Board proceeding. The Landlord is responsible for retaining a licensed paralegal or lawyer for any Board matter, at the Landlord’s cost.");
C("11.3", "On the Landlord’s request, the Manager will provide the Landlord or the Landlord’s representative with copies of the ledgers, notices, certificates of service and correspondence in its possession that relate to the matter, and will otherwise reasonably cooperate.");
C("11.4", "Notices requiring the Landlord’s instruction — including an N12 or N13 — will be prepared and served only on the Landlord’s written direction.");
C("11.5", "Nothing provided by the Manager under this Agreement is legal advice, and the Manager does not hold itself out as licensed to provide legal services.");
C("11.6", "The Manager is not liable for any defect in a notice or for any outcome before the Landlord and Tenant Board or a court, including where a notice is found invalid or an application is dismissed or delayed.");

S("12.   GENERAL");
C("12.1", "**Notices.** Notices under this Agreement are valid if delivered personally, sent by registered mail to the address for notices on page 1, or sent by email — to the Authorized Signatory in the case of the Landlord, and to the email address on page 2 in the case of the Manager. Email notice is deemed received on the next business day after sending.");
C("12.2", "**Confidentiality and privacy.** Each party shall keep confidential the personal information of tenants and shall handle it in accordance with applicable privacy legislation, and shall use it only for the purposes of this Agreement.");
C("12.3", "**Entire agreement.** This Agreement, together with its Schedules, is the entire agreement between the parties and replaces all prior discussions, representations and agreements relating to its subject matter.");
C("12.4", "**Amendment.** This Agreement may be amended only in writing signed by both parties, except where this Agreement expressly permits a change by written notice or email confirmation.");
C("12.5", "**Assignment.** The Landlord may not assign this Agreement without the Manager’s written consent. The Manager may assign this Agreement, without the Landlord’s consent, to an affiliate or to a buyer of all or part of its business, by written notice to the Landlord.");
C("12.6", "**Severability.** If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions continue in full force.");
C("12.7", "**Governing law.** This Agreement is governed by the laws of the Province of Ontario and the laws of Canada applicable in it.");
C("12.8", "**Counterparts and electronic signature.** This Agreement may be signed in counterparts and delivered electronically, and electronic signatures have the same effect as original signatures.");
C("12.9", "**Electronic communication.** The Landlord consents to receiving statements, invoices, approvals and notices under this Agreement by email and through the Manager’s owner portal.");
body.push(pageBreak());

// ======================================================================
// SIGNATURES
// ======================================================================
body.push(SECTION_LABEL("SIGNATURES"));
body.push(P("The parties have signed this Agreement as of the Effective Date. The Authorized Signatory signs on behalf of every owner of the Property named on page 1, and binds each of them (sections 1.5 to 1.10)."));
const sigLine = { top: NOB, left: NOB, right: NOB, bottom: { style: BorderStyle.SINGLE, size: 6, color: "404040" } };
const small = (t) => new Paragraph({ spacing: { line: 240, after: 0 }, children: [new TextRun({ text: t, font: FONT, size: 15, color: "595959" })] });
const sigRows = [
  row([
    cell("**LANDLORD — Authorized Signatory**", 225, { borders: NOBORDERS, run: { color: NAVY, size: 16 } }),
    cell("", 24, { borders: NOBORDERS }),
    cell("**MANAGER**", 219, { borders: NOBORDERS, run: { color: NAVY, size: 16 } }),
  ], 20),
];
for (const [l, r, h, a, b] of [["Signature", "Signature", 42, "pmsig1", "pmsig2"], ["Print name", "Print name", 36, "pmpn1", "pmpn2"], ["Capacity (owner / officer / attorney)", "Title", 36, "pmcap1", "pmttl2"], ["Date", "Date", 36, "pmdt1", "pmdt2"]]) {
  sigRows.push(row([
    cell(`[[${a}]]`, 225, { borders: sigLine, valign: VerticalAlign.BOTTOM }),
    cell("", 24, { borders: NOBORDERS }),
    cell(`[[${b}]]`, 219, { borders: sigLine, valign: VerticalAlign.BOTTOM }),
  ], h, HeightRule.EXACT));
  sigRows.push(row([cell(small(l), 225, { borders: NOBORDERS }), cell("", 24, { borders: NOBORDERS }), cell(small(r), 219, { borders: NOBORDERS })], 16, HeightRule.EXACT));
}
body.push(table([225, 24, 219], sigRows));
const box = (t) =>
  new Paragraph({
    spacing: { before: pt(10), after: pt(4), line: 259 },
    children: [new TextRun({ text: "☐", font: "Segoe UI Symbol", size: SZ }), new TextRun({ text: "  " + t, font: FONT, size: SZ })],
  });
body.push(new Paragraph({ spacing: { after: pt(8) }, children: [] }));
body.push(box("Where the Landlord is a corporation, the person signing above certifies: I have authority to bind the corporation."));
body.push(box("Where the Property has more than one owner, the person signing above certifies that they are authorized to sign on behalf of, and to bind, every owner named on page 1."));
body.push(pageBreak());

// ======================================================================
// SCHEDULE A
// ======================================================================
body.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: "SCHEDULE A", bold: true, color: NAVY, font: FONT, size: 26 })] }));
body.push(new Paragraph({ spacing: { after: pt(10) }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 2 } }, children: [new TextRun({ text: "Services Selected and Fee Summary", color: "595959", font: FONT, size: SZ })] }));
body.push(P("Check the box beside each service the Landlord selects. Unchecked services are not provided. Rates are fixed and are exclusive of HST."));
body.push(SUB("Part 1 — Management fee worksheet"));
body.push(
  table([270, 76, 122], [
    row([head("Item", 270), head("Rate", 76, { align: AlignmentType.CENTER }), head("Monthly amount", 122, { align: AlignmentType.CENTER })]),
    row([cell("Base fee — the Property including its first Lease", 270), cell("$175.00", 76, { align: AlignmentType.CENTER }), cell("$175.00", 122, { align: AlignmentType.CENTER })]),
    row([
      cell("Additional Leases (each Lease beyond the first) × $25.00", 270),
      cell("$25.00", 76, { align: AlignmentType.CENTER }),
      cell("[[pmfaddl]]", 122),
    ]),
    row([cell("**Subtotal — management fee**", 270, { fill: LABEL_FILL }), cell("", 76, { fill: LABEL_FILL }), cell("[[pmfmgmt]]", 122, { fill: LABEL_FILL })]),
  ])
);
body.push(P('A "Lease" is one tenancy agreement, however many tenants are named on it (section 1.4).'));

body.push(SUB("Part 2 — Optional services"));
const svc = (name, rest, rate, term, monthly, italic) =>
  row([
    cell("☐", 21, { run: { font: "Segoe UI Symbol" } }),
    cell(italic ? `*${name}${rest}*` : `**${name}**${rest}`, 208),
    cell(rate, 89, { align: AlignmentType.CENTER }),
    cell(term, 60, { align: AlignmentType.CENTER }),
    cell(monthly, 90, { align: monthly.startsWith("[[") ? undefined : AlignmentType.CENTER }),
  ]);
body.push(
  table([21, 208, 89, 60, 90], [
    row([head("", 21), head("Service", 208), head("Fixed rate", 89, { align: AlignmentType.CENTER }), head("Min. term", 60, { align: AlignmentType.CENTER }), head("Monthly", 90, { align: AlignmentType.CENTER })]),
    svc("Lawn maintenance & snow removal", " — monthly plan", "$50.00 / month", "1 year", "[[pmfsnow]]"),
    svc("Lawn maintenance & snow removal", " — per service (no monthly plan)", "$75.00 per service", "None", "As used"),
    svc("Security package", " — 1–2 exterior cameras", "$15.00 / month", "None", "[[pmfsec]]"),
    svc("Security package", " — one-time installation", "$100.00 one time", "—", "", true),
    svc("Appliance coverage", " — fridge, stove, washer, dryer", "$50.00 / month", "1 year", "[[pmfapp]]"),
    svc("Plumbing package", " — basic plumbing repairs", "$40.00 / month", "1 year", "[[pmfplumb]]"),
    svc("Common space cleaning", " — shared areas of the Property", "$150.00 / month", "None", "[[pmfclean]]"),
    row([cell("", 21, { fill: LABEL_FILL }), cell("**Subtotal — optional services (monthly)**", 208, { fill: LABEL_FILL }), cell("", 89, { fill: LABEL_FILL }), cell("", 60, { fill: LABEL_FILL }), cell("[[pmfopt]]", 90, { fill: LABEL_FILL })]),
  ])
);
body.push(P("Detailed terms, inclusions and exclusions for each optional service are set out in Schedule B."));

body.push(SUB("Part 3 — Leasing / tenant placement fee"));
body.push(
  table([330, 138], [
    row([cell("Tenant placement by the Manager (per Lease signed)", 330), cell("One-half (½) month’s rent", 138, { align: AlignmentType.CENTER })]),
    row([cell("Tenant placement where the Property must be listed on MLS®", 330), cell("One (1) full month’s rent", 138, { align: AlignmentType.CENTER })]),
  ])
);
body.push(P("The leasing fee is earned on execution of the Lease and is deducted from rent collected. It is charged per Lease signed and is exclusive of HST."));

body.push(SUB("Part 4 — Monthly fee summary"));
const sumRow = (l, v, bold) => row([cell(bold ? `**${l}**` : l, 330), cell(v, 138)], 18);
body.push(
  table([330, 138], [
    sumRow("Management fee (Part 1)", "[[pmftmgmt]]"),
    sumRow("Optional services (Part 2)", "[[pmftopt]]"),
    sumRow("Less first-year discount, if any (section 5.7)", "[[pmftdisc]]"),
    sumRow("Subtotal", "[[pmftsub]]", true),
    sumRow("HST @ 13%", "[[pmfthst]]"),
    sumRow("TOTAL MONTHLY, HST included", "[[pmfttot]]", true),
  ])
);
body.push(P("One-time charges at start-up (e.g. camera installation $100.00 + HST) are billed in the first month."));

body.push(SUB("Part 5 — Lease schedule"));
body.push(P('Complete one row per Lease at the Property, one line for each unit or room. If a unit or room is vacant, enter "Vacant" under Tenant(s).'));
const lw = [26, 82, 115, 76, 76, 93];
const leaseRows = [row(["#", "Unit / room", "Tenant(s)", "Lease start", "Lease end", "Monthly rent"].map((t, i) => head(t, lw[i])))];
for (let i = 1; i <= 12; i++) leaseRows.push(row(lw.map((w, j) => cell(j === 0 ? String(i) : `[[pmL${i}c${j}]]`, w)), 28));
body.push(table(lw, leaseRows));
body.push(pageBreak());

// ======================================================================
// SCHEDULE B
// ======================================================================
body.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: "SCHEDULE B", bold: true, color: NAVY, font: FONT, size: 26 })] }));
body.push(new Paragraph({ spacing: { after: pt(10) }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 2 } }, children: [new TextRun({ text: "Terms of the Optional Services", color: "595959", font: FONT, size: SZ })] }));
body.push(P("The following terms apply only to services selected in Schedule A. Where a service is not selected, this Schedule has no application to it."));

body.push(SUB("B1. Lawn maintenance and snow removal"));
C("B1.1", "The Manager arranges service through a contractor to the standard required by the applicable municipal by-laws governing grass height, weed control, and the clearing of snow and ice from walkways and driveways within the times those by-laws require.");
C("B1.2", "Monthly plan: $50.00 per month, committed for a minimum term of one (1) year. The monthly rate covers all attendances required to meet the by-law standard during that month.");
C("B1.3", "Per-service option: where the Landlord is not on the monthly plan, service is charged at $75.00 per attendance, billed in the month it is performed. There is no minimum term.");
C("B1.4", "The Manager is not responsible for by-law fines or orders arising from conditions the Manager was not engaged to address, or from the Landlord’s failure to select this service.");

body.push(SUB("B2. Security package"));
C("B2.1", "The Manager arranges the installation of one (1) to two (2) cameras on the exterior of the Property. Camera placement is determined by the Manager acting reasonably.");
C("B2.2", "The fee is $15.00 per month, plus a one-time installation charge of $100.00 payable in the first month. There is no minimum term.");
C("B2.3", "All cameras, mounts, wiring and related equipment remain the property of the Manager at all times and do not become fixtures or the property of the Landlord.");
C("B2.4", "On termination of this service or of this Agreement, the Manager may attend at the Property on reasonable notice to remove its equipment. The Manager will arrange to make good any mounting holes but is not responsible for repainting or refinishing.");
C("B2.5", "The cameras are a deterrent and recording aid only. The Manager does not provide monitored security, does not guarantee continuous recording or retention, and assumes no liability for theft, damage, injury or any incident at the Property, or for any failure or interruption of the equipment.");
C("B2.6", "Recordings are retained and used only for property management purposes and are handled in accordance with applicable privacy legislation. Cameras are not placed in any area where a tenant has a reasonable expectation of privacy.");
C("B2.7", "Cameras record exterior and shared outdoor areas only. The Landlord shall make sure tenants are told about the cameras, including in each Lease.");

body.push(SUB("B3. Appliance coverage"));
C("B3.1", "The fee is $50.00 per month, committed for a minimum term of one (1) year.");
C("B3.2", "Covered appliances are limited to the refrigerator, stove, washer and dryer at the Property. No other appliance or equipment is covered.");
C("B3.3", "Maintenance calls on covered appliances are arranged through a contractor at no additional cost, including parts and labour, subject to section B3.5.");
C("B3.4", "If a covered appliance stops working and is not economically repairable, the Manager will arrange its replacement with a used unit of comparable function. The replacement carries only the warranty, if any, given by its supplier.");
C("B3.5", "The Manager will arrange at most two (2) replacements per twelve (12) month period. In addition, the Manager’s total cost for repairs and replacements under this section B3 in any twelve (12) month period is limited to the B3 fees the Landlord paid for that period. Costs beyond either limit are at the Landlord’s expense, and the Manager will tell the Landlord before incurring them.");
C("B3.6", "Not covered: damage caused by misuse, abuse, neglect or tenant damage; cosmetic damage; appliances owned by a tenant; appliances that were not in working order at the start of this service; and any consequential loss, including spoiled food or water damage.");

body.push(SUB("B4. Plumbing package"));
C("B4.1", "The fee is $40.00 per month, committed for a minimum term of one (1) year.");
C("B4.2", "Covered work is limited to basic plumbing issues: unclogging drains, repairing leaking pipes, repairing toilet leaks, and repairing or replacing broken faucets.");
C("B4.3", "The Manager arranges the repair of the plumbing issue only, through a contractor. The Manager does not cover, repair or pay for any damage caused by the plumbing issue. By way of example, if a pipe bursts and floods the basement, the Manager arranges the repair of the pipe; the restoration of the basement and its contents is the Landlord’s responsibility and, where applicable, an insurance matter.");
C("B4.4", "Not covered: sewer line and main stack replacement, excavation, water heaters, well and septic systems, fixture upgrades or renovations, damage caused by tenant misuse or the introduction of improper items into drains, and any work requiring a permit.");

body.push(SUB("B5. Common space cleaning"));
C("B5.1", "The fee is $150.00 per month. The Manager arranges routine cleaning, through a contractor, of the shared interior common areas of the Property, including hallways, shared kitchens, shared bathrooms, stairwells and shared laundry areas.");
C("B5.2", "Cleaning inside a tenant’s private room or unit, deep cleaning, post-move-out cleaning, and hoarding or biohazard cleanup are not included and are quoted separately.");

// ======================================================================
const header = new Header({
  children: [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: "IRep Property Management  •  Property Management Agreement", font: FONT, size: 14, color: "A6A6A6", characterSpacing: 20 })],
    }),
  ],
});
const f = (text) => new TextRun({ text, font: FONT, size: 16, color: GREY });
const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        f("Landlord initials ________   Manager initials ________          Page "),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY }),
        f(" of "),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: GREY }),
      ],
    }),
  ],
});

const doc = new Document({
  creator: "IRep Property Management",
  title: "Property Management Agreement",
  styles: { default: { document: { run: { font: FONT, size: SZ } } } },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, bottom: 1300, left: 1440, right: 1440, header: 740, footer: 700 },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children: body,
    },
  ],
});
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[2] || "IRep_Property_Management_Contract.docx", buf);
  console.log("written");
});
