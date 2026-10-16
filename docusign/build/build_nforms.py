"""Build DocuSign template JSON files for the 2026 LTB N1, N4, N5 forms.

Each PDF form box becomes a named DocuSign field at the same spot, owned by the
"Landlord" signer, so the website can prefill by label and the signer can still edit.
"""
import base64, copy, io, json, sys, uuid
import pypdf
from pypdf.generic import NameObject, ArrayObject

U = "/root/.claude/uploads/2381269b-ca4b-59d5-8f40-7d48650787bf/"
OUT = "/tmp/claude-0/-home-claude/2381269b-ca4b-59d5-8f40-7d48650787bf/scratchpad/ds/out/"
H = 792

def widgets(path):
    r = pypdf.PdfReader(path)
    if r.is_encrypted:
        r.decrypt("")
    found = {}
    for pi, p in enumerate(r.pages):
        for a in p.get("/Annots") or []:
            a = a.get_object()
            if a.get("/Subtype") != "/Widget":
                continue
            name = a.get("/T")
            par = a.get("/Parent")
            if name is None and par is not None:
                name = par.get_object().get("/T")
            n = (a.get("/AP") or {}).get("/N", {})
            n = n.get_object() if hasattr(n, "get_object") else n
            ap = [] if "/BBox" in n else list(n.keys())
            on = [k for k in ap if k != "/Off"]
            key = (pi + 1, str(name), on[0] if on else None)
            found.setdefault(key, []).append([float(x) for x in a["/Rect"]])
    return found

def clean_pdf(path, keep_pages):
    r = pypdf.PdfReader(path)
    if r.is_encrypted:
        r.decrypt("")
    w = pypdf.PdfWriter()
    for i in keep_pages:
        w.add_page(r.pages[i - 1])
    for p in w.pages:
        annots = p.get("/Annots")
        if annots:
            keep = ArrayObject([a for a in annots if a.get_object().get("/Subtype") != "/Widget"])
            if keep:
                p[NameObject("/Annots")] = keep
            else:
                del p[NameObject("/Annots")]
    if "/AcroForm" in w._root_object:
        del w._root_object["/AcroForm"]
    b = io.BytesIO()
    w.write(b)
    return b.getvalue()

def build(name, base_json, pdf, keep_pages, doc_name, subject, spec, signature, date_signed):
    wd = widgets(U + pdf)
    newpage = {old: i + 1 for i, old in enumerate(keep_pages)}
    d = json.load(open(U + base_json))
    for k in ("templateId", "uri", "created", "lastModified", "lastModifiedBy", "lastUsed", "owner", "folderId", "folderName", "folderIds"):
        d.pop(k, None)
    d["name"] = name
    d["description"] = "LTB form " + doc_name + ". Fields are named so the IRep website can fill them in."
    d["emailSubject"] = subject
    data = clean_pdf(U + pdf, keep_pages)
    d["pageCount"] = str(len(keep_pages))
    d["documents"] = [{
        "documentId": "1", "name": doc_name + ".pdf", "order": "1", "pages": str(len(keep_pages)),
        "display": "inline", "includeInDownload": "true", "signerMustAcknowledge": "no_interaction",
        "templateLocked": "false", "templateRequired": "false",
        "documentBase64": base64.b64encode(data).decode(),
    }]
    signer = copy.deepcopy(d["recipients"]["signers"][0])
    rid = signer["recipientId"]
    signer["roleName"] = "Landlord"
    tabs = {"textTabs": [], "checkboxTabs": [], "signHereTabs": [], "dateSignedTabs": []}

    def rect(page, field, on=None, idx=0):
        rs = wd.get((page, field, on))
        if not rs:
            raise SystemExit(f"{name}: missing {page} {field} {on}; have {[k for k in wd if k[1]==field]}")
        return rs[idx]

    def pos(page, r):
        return {"documentId": "1", "recipientId": rid, "pageNumber": str(newpage[page]),
                "xPosition": str(round(r[0]) + 1), "yPosition": str(round(H - r[3]) + 1)}

    for item in spec:
        kind, label, page, field = item[:4]
        on = item[4] if len(item) > 4 else None
        idx = item[5] if len(item) > 5 else 0
        r = rect(page, field, on, idx)
        if kind == "text":
            h = r[3] - r[1]
            tabs["textTabs"].append({**pos(page, r), "tabLabel": label, "value": "", "required": "false",
                "locked": "false", "shared": "false", "concealValueOnDocument": "false", "disableAutoSize": "false",
                "maxLength": "4000", "font": "helvetica", "fontColor": "black",
                "fontSize": "size9" if h < 24 else "size10",
                "width": str(round(r[2] - r[0]) - 2), "height": str(round(h) - 2),
                "tabId": str(uuid.uuid4())})
        else:
            tabs["checkboxTabs"].append({**pos(page, r), "tabLabel": label, "name": label, "selected": "false",
                "required": "false", "locked": "false", "shared": "false", "tabId": str(uuid.uuid4())})
    sp, sf = signature
    r = rect(sp, sf)
    tabs["signHereTabs"].append({**pos(sp, r), "tabLabel": "Landlord Signature", "name": "SignHere",
        "stampType": "signature", "scaleValue": "0.6", "optional": "false", "tabId": str(uuid.uuid4())})
    tabs["signHereTabs"][0]["yPosition"] = str(int(tabs["signHereTabs"][0]["yPosition"]) - 6)
    dp, df = date_signed
    r = rect(dp, df)
    tabs["dateSignedTabs"].append({**pos(dp, r), "tabLabel": "Date Signed", "name": "DateSigned", "value": "",
        "font": "helvetica", "fontColor": "black", "fontSize": "size10",
        "localePolicy": {"customDateFormat": "dd/MM/yyyy"}, "tabId": str(uuid.uuid4())})
    tabs["dateSignedTabs"][0]["yPosition"] = str(int(tabs["dateSignedTabs"][0]["yPosition"]) + 8)
    signer["tabs"] = tabs
    d["recipients"]["signers"] = [signer]
    path = OUT + name.replace("/", "-") + ".json"
    json.dump(d, open(path, "w"))
    open(OUT + doc_name + " (blank).pdf", "wb").write(data)
    print(path, {k: len(v) for k, v in tabs.items()})
    return d

REP_N45 = lambda p: [
    ("text", "Rep First Name", p, "txtFirstName[0]", None, 1),
    ("text", "Rep Last Name", p, "txtLastName[0]", None, 1),
    ("text", "Rep LSO Number", p, "txtLSOnumber[0]"),
    ("text", "Rep Company", p, "txtCompanyName[0]"),
    ("text", "Rep Street Number", p, "txtNumber[0]"),
    ("text", "Rep Street Name", p, "txtName[0]"),
    ("text", "Rep Unit", p, "txtUnit[0]"),
    ("text", "Rep City", p, "txtCity[0]"),
    ("text", "Rep Province", p, "txtProvince[0]"),
    ("text", "Rep Postal Code", p, "txtPostalCode[0]"),
    ("text", "Rep Email", p, "txtEmail[0]"),
    ("text", "Rep Phone", p, "txtPhone1[0]", None, 1),
    ("check", "Signed As Landlord", p, "PartyType[0]", "/0"),
    ("check", "Signed As Representative", p, "PartyType[0]", "/1"),
    ("text", "Signer First Name", p, "txtFirstName[0]", None, 0),
    ("text", "Signer Last Name", p, "txtLastName[0]", None, 0),
    ("text", "Signer Phone", p, "txtPhone1[0]", None, 0),
]
ADDR = lambda p: [
    ("text", "Tenant Names", p, "txtTenant[0]"),
    ("text", "Landlord Name", p, "txtLandlord[0]"),
    ("text", "Unit Street Number", p, "txtNumber[0]"),
    ("text", "Unit Street Name", p, "txtName[0]"),
    ("text", "Unit Number", p, "txtUnit[0]"),
    ("text", "Unit City", p, "txtCity[0]"),
    ("text", "Unit Province", p, "txtProvince[0]"),
    ("text", "Unit Postal Code", p, "txtPostalCode[0]"),
]

n4_rows = []
for i in (1, 2, 3):
    n4_rows += [("text", f"Period {i} From", 4, f"DateFrom{i}[0]"), ("text", f"Period {i} To", 4, f"DateTo{i}[0]"),
                ("text", f"Period {i} Charged", 4, f"Charged{i}[0]"), ("text", f"Period {i} Paid", 4, f"Paid{i}[0]"),
                ("text", f"Period {i} Owing", 4, f"Owing{i}[0]")]
build("N4 - Non-Payment of Rent (2026-09)", "deabc073-N4NonPaymentofRent.json", "83b56f2b-N4_new.pdf", [2, 3, 4],
      "N4 - Notice to End your Tenancy Early for Non-payment of Rent (2026-09)", "N4 Notice - [Address]",
      [("text", "Amount Owing", 2, "txtOweMeAmount[0]"), ("text", "Termination Date", 2, "dptPayDate[0]")]
      + ADDR(2) + n4_rows + [("text", "Total Rent Owing", 4, "TotalRentOwing[0]")] + REP_N45(4),
      (4, "Signature[0]"), (4, "dptSignDate[0]"))

n5_events = []
for i in (1, 2, 3):
    n5_events += [("text", f"Event {i} Date Time", 4, f"EventDateTime{i}[0]"), ("text", f"Event {i} Details", 4, f"Event{i}[0]")]
build("N5 - Interfering, Damage or Overcrowding (2026-09)",
      "e91e32be-NoticeN5InterferingwithothersdamageorOvercrowding.json", "b3a364dc-N5_new.pdf", [3, 4, 5, 6],
      "N5 - Notice to End your Tenancy for Interfering with Others, Damage or Overcrowding (2026-09)",
      "N5 Notice - [Address]",
      ADDR(3) + [("text", "Termination Date", 3, "TerminationDate[0]"),
                 ("check", "Reason 1", 3, "Reason1[0]", "/1"),
                 ("check", "Reason 1 First Notice", 3, "Reason1_1[0]", "/0"),
                 ("check", "Reason 1 Second Notice", 3, "Reason1_1[0]", "/1"),
                 ("check", "Reason 2", 3, "Reason2[0]", "/1"),
                 ("check", "Reason 2 First Notice", 3, "Reason2_1[0]", "/0"),
                 ("text", "Repair Cost", 3, "PayMe1[0]"),
                 ("text", "Replace Cost", 4, "PayMe2[0]"),
                 ("check", "Reason 2 Second Notice", 4, "Reason2_2[0]", "/0"),
                 ("check", "Reason 3", 4, "Reason3[0]", "/1"),
                 ("check", "Reason 3 First Notice", 4, "Reason3_1[0]", "/0"),
                 ("text", "Reason 3 Max Occupants", 4, "Reason3Explain[0]"),
                 ("check", "Reason 3 Second Notice", 4, "Reason3_2[0]", "/0")]
      + n5_events + REP_N45(6),
      (6, "Signature[0]"), (6, "dptSignDate[0]"))

build("N1 - Notice of Rent Increase (2022-04)", "a51a974e-N1NoticeofRentIncrease.json", "2acda713-N1_new.pdf", [1, 2],
      "N1 - Notice of Rent Increase (2022-04)", "N1 Notice of Rent Increase - [Address]",
      [("text", "Tenant Names and Address", 1, "To_TenantName[0]"),
       ("text", "Landlord Name and Address", 1, "From_LandlordName[0]"),
       ("text", "Rental Unit Address", 1, "RentUnitAddress[0]"),
       ("text", "Increase Date", 1, "StartDate[0]"),
       ("text", "New Rent", 1, "RentIncAmount1[0]"),
       ("check", "New Rent Per Month", 1, "PaymentPeriodM[0]", "/0", 0),
       ("text", "Increase Amount", 1, "RentIncAmount2[0]"),
       ("check", "Increase Per Month", 1, "PaymentPeriodM[0]", "/0", 1),
       ("text", "Increase Percent", 1, "RentIncPercent[0]"),
       ("check", "At Or Below Guideline", 1, "Check1[0]", "/0"),
       ("check", "Above Guideline", 1, "Check2[0]", "/0"),
       ("check", "Above Guideline Approved", 1, "Check_2_1[0]", "/1"),
       ("check", "Above Guideline Applied For", 1, "Check_2_2[0]", "/1"),
       ("check", "Signed As Landlord", 2, "SelectSign[0]", "/0"),
       ("check", "Signed As Representative", 2, "SelectSign[0]", "/1"),
       ("text", "Signer Name", 2, "SignName[0]"),
       ("text", "Signer Phone", 2, "SignPhoneNum[0]"),
       ("text", "Rep Name", 2, "AgentName[0]"),
       ("text", "Rep LSO Number", 2, "AgentLSUC[0]"),
       ("text", "Rep Company", 2, "AgentCompany[0]"),
       ("text", "Rep Address", 2, "AgentAddress[0]"),
       ("text", "Rep Phone", 2, "AgentPhoneNum[0]"),
       ("text", "Rep City", 2, "AgentMunicipality[0]"),
       ("text", "Rep Province", 2, "AgentProvince[0]"),
       ("text", "Rep Postal Code", 2, "AgentPostCode[0]"),
       ("text", "Rep Fax", 2, "AgentFaxNum[0]")],
      (2, "Signature[0]"), (2, "SignDate[0]"))
