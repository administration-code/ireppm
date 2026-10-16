"""Small kit for turning fillable PDFs into DocuSign template JSON with named fields."""
import base64, copy, io, json, uuid
import pypdf
from pypdf.generic import NameObject, ArrayObject

H = 792
DATE_FORMAT = "dd/MM/yyyy"

def _open(path):
    r = pypdf.PdfReader(path)
    if r.is_encrypted:
        r.decrypt("")
    return r

def widgets(path):
    r = _open(path)
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
            on = [] if "/BBox" in n else [k for k in n.keys() if k != "/Off"]
            found.setdefault((pi + 1, str(name), on[0] if on else None), []).append([float(x) for x in a["/Rect"]])
    return found

def clean_pdf(path, keep_pages=None):
    r = _open(path)
    w = pypdf.PdfWriter()
    for i in (keep_pages or range(1, len(r.pages) + 1)):
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

class Doc:
    def __init__(self, doc_id, path, name, keep_pages=None):
        self.id = str(doc_id)
        self.path = path
        self.name = name
        self.keep = keep_pages
        self.data = clean_pdf(path, keep_pages)
        self.pages = len(pypdf.PdfReader(io.BytesIO(self.data)).pages)
        self.w = widgets(path)
        self.newpage = {old: i + 1 for i, old in enumerate(keep_pages)} if keep_pages else None

    def rect(self, page, field, on=None, idx=0):
        rs = self.w.get((page, field, on))
        if not rs:
            raise SystemExit(f"{self.name}: missing {page} {field} {on}; have {[k for k in self.w if k[1] == field]}")
        return rs[idx]

    def pg(self, page):
        return self.newpage[page] if self.newpage else page

def _pos(doc, page, rid, x, top):
    return {"documentId": doc.id, "recipientId": rid, "pageNumber": str(doc.pg(page)),
            "xPosition": str(round(x)), "yPosition": str(round(top))}

def add(tabs, doc, rid, item):
    """item: (kind, label, page, field[, on[, idx]]) or (kind, label, page, None, x, top[, w, h]) for free placement."""
    kind, label, page, field = item[:4]
    if field is None:
        x, top = item[4], item[5]
        wdt, hgt = (item[6], item[7]) if len(item) > 7 else (150, 14)
        r = [x - 1, H - top - hgt - 1, x + wdt + 1, H - top + 1]
    else:
        on = item[4] if len(item) > 4 else None
        idx = item[5] if len(item) > 5 else 0
        r = doc.rect(page, field, on, idx)
    x, top, wdt, hgt = r[0] + 1, H - r[3] + 1, r[2] - r[0] - 2, r[3] - r[1] - 2
    base = _pos(doc, page, rid, x, top)
    tid = str(uuid.uuid4())
    if kind == "label":
        tabs.setdefault("textTabs", []).append({**base, "tabLabel": label, "value": item[8], "required": "false",
            "locked": "true", "shared": "false", "font": "helvetica", "fontColor": "black", "fontSize": "size8",
            "width": str(round(wdt)), "height": str(round(hgt)), "tabId": tid})
    elif kind in ("text", "lockedtext"):
        tabs.setdefault("textTabs", []).append({**base, "tabLabel": label, "value": "", "required": "false",
            "locked": "true" if kind == "lockedtext" else "false", "shared": "false",
            "concealValueOnDocument": "false", "disableAutoSize": "false", "maxLength": "4000",
            "font": "helvetica", "fontColor": "black", "fontSize": "size9" if hgt < 22 else "size10",
            "width": str(round(wdt)), "height": str(round(hgt)), "tabId": tid})
    elif kind in ("check", "lockedcheck"):
        tabs.setdefault("checkboxTabs", []).append({**base, "tabLabel": label, "name": label, "selected": "false",
            "required": "false", "locked": "true" if kind == "lockedcheck" else "false", "shared": "false", "tabId": tid})
    elif kind == "sign":
        base["yPosition"] = str(max(0, round(top) - 12))
        tabs.setdefault("signHereTabs", []).append({**base, "tabLabel": label, "name": "SignHere",
            "stampType": "signature", "scaleValue": "0.6", "optional": "false", "tabId": tid})
    elif kind == "date":
        base["yPosition"] = str(round(top + max(0, hgt - 12)))
        tabs.setdefault("dateSignedTabs", []).append({**base, "tabLabel": label, "name": "DateSigned", "value": "",
            "font": "helvetica", "fontColor": "black", "fontSize": "size10",
            "localePolicy": {"customDateFormat": DATE_FORMAT}, "tabId": tid})
    else:
        raise SystemExit("unknown kind " + kind)

def build(name, description, subject, base_json, docs, roles, out_dir):
    """roles: list of dicts {role, type: signer|cc, name, email, routing, items: [(docObj, item), ...]}"""
    d = json.load(open(base_json))
    for k in ("templateId", "uri", "created", "lastModified", "lastModifiedBy", "lastUsed", "owner",
              "folderId", "folderName", "folderIds"):
        d.pop(k, None)
    d["name"] = name
    d["description"] = description
    d["emailSubject"] = subject
    d["pageCount"] = str(sum(x.pages for x in docs))
    d["documents"] = [{"documentId": x.id, "name": x.name + ".pdf", "order": str(i + 1), "pages": str(x.pages),
        "display": "inline", "includeInDownload": "true", "signerMustAcknowledge": "no_interaction",
        "templateLocked": "false", "templateRequired": "false",
        "documentBase64": base64.b64encode(x.data).decode()} for i, x in enumerate(docs)]
    signer_proto = copy.deepcopy(d["recipients"]["signers"][0])
    signer_proto.pop("tabs", None)
    cc_proto = copy.deepcopy((d["recipients"].get("carbonCopies") or [None])[0])
    signers, ccs = [], []
    for i, r in enumerate(roles):
        rid = str(10000001 + i)
        vis = [{"documentId": x.id, "visible": "true"} for x in docs]
        if r["type"] == "signer":
            s = copy.deepcopy(signer_proto)
            s.update({"roleName": r["role"], "name": r.get("name", ""), "email": r.get("email", ""),
                      "recipientId": rid, "routingOrder": str(r.get("routing", 1)), "documentVisibility": vis})
            s.pop("recipientIdGuid", None)
            tabs = {}
            for doc, item in r.get("items", []):
                add(tabs, doc, rid, item)
            s["tabs"] = tabs
            signers.append(s)
        else:
            c = copy.deepcopy(cc_proto)
            c.update({"roleName": r["role"], "name": r.get("name", ""), "email": r.get("email", ""),
                      "recipientId": rid, "routingOrder": str(r.get("routing", 1)), "documentVisibility": vis})
            c.pop("recipientIdGuid", None)
            ccs.append(c)
    rec = d["recipients"]
    for k in list(rec.keys()):
        if isinstance(rec[k], list):
            rec[k] = []
    rec["signers"] = signers
    rec["carbonCopies"] = ccs
    rec["recipientCount"] = str(len(signers) + len(ccs))
    path = out_dir + name.replace("/", "-") + ".json"
    json.dump(d, open(path, "w"))
    print(path, [(s["roleName"], {k: len(v) for k, v in s.get("tabs", {}).items()}) for s in signers],
          [c["roleName"] for c in ccs])
    return d
