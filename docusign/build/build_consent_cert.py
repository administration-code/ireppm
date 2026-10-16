import sys
sys.path.insert(0, ".")
from tplkit import Doc, build
U = "/root/.claude/uploads/2381269b-ca4b-59d5-8f40-7d48650787bf/"
OUT = "out/"

c = Doc(1, U + "703a9c8d-Email_Service_Consent.pdf", "Consent to Service by Email (LTB v. 01-04-2022)")
build("Consent to Service by Email (2022-04)",
      "LTB Consent to Service by Email. One copy per tenant. Fields are named so the IRep website can fill them in.",
      "Consent to Service by Email - [Address]", U + "f8aa02fb-MainLease.json", [c], [
    {"role": "Tenant", "type": "signer", "items": [(c, x) for x in [
        ("text", "Tenant Name", 1, "NameTenant[0]"),
        ("text", "Tenant Email", 1, "EmailTenant[0]"),
        ("check", "Consent Rent Increase", 1, "Doc1[0]", "/1"),
        ("check", "Consent Notice Of Entry", 1, "Doc2[0]", "/1"),
        ("check", "Consent LTB Documents", 1, "Doc3[0]", "/1"),
        ("check", "Consent Tenancy Communication", 1, "Doc4[0]", "/1"),
        ("text", "Tenant First Name", 1, "FirstName[0]", None, 0),
        ("text", "Tenant Last Name", 1, "LastName[0]", None, 0),
        ("sign", "Tenant Signature", 1, "Signature[0]", None, 0),
        ("date", "Tenant Date Signed", 1, "DateSigned[0]", None, 0)]]},
    {"role": "Landlord", "type": "signer", "items": [(c, x) for x in [
        ("text", "Landlord Name", 1, "NameLandlord[0]"),
        ("text", "Landlord Email", 1, "EmailLandlord[0]"),
        ("text", "Rental Unit Address", 1, "AddressRentalUnit[0]"),
        ("text", "Landlord First Name", 1, "FirstName[0]", None, 1),
        ("text", "Landlord Last Name", 1, "LastName[0]", None, 1),
        ("sign", "Landlord Signature", 1, "Signature[0]", None, 1),
        ("date", "Landlord Date Signed", 1, "DateSigned[0]", None, 1)]]},
    {"role": "Administration", "type": "cc", "name": "Rishi Bakshi", "email": "ireppm@ireprealty.com"},
], OUT)

s = Doc(1, U + "735dc179-Certificate_Of_Service.pdf", "Certificate of Service (LTB v. 01-04-2022)")
build("Certificate of Service (2022-04)",
      "LTB Certificate of Service. Fields are named so the IRep website can fill them in.",
      "Certificate of Service - [Address]", U + "013e848a-CertificateofService.json", [s], [
    {"role": "Delivery By", "type": "signer", "name": "Zan Greksa", "email": "chuckfixedmyhouse@gmail.com",
     "items": [(s, x) for x in [
        ("text", "File Number", 1, "FileNumber[0]"),
        ("text", "Unit Number", 1, "UnitNum[0]"),
        ("text", "Street Address", 1, "StreetAddress[0]"),
        ("text", "City", 1, "City[0]"),
        ("text", "Postal Code", 1, "PostCode[0]"),
        ("text", "Served By Name", 1, "Name[0]"),
        ("text", "Date Served", 1, "CertifyDate[0]"),
        ("check", "Notice of Termination", 1, "Check1[0]", "/1"),
        ("text", "Notice Form Number", 1, "FormName1[0]"),
        ("check", "Other Document", 1, "Check6[0]", "/1"),
        ("text", "Other Document Name", 1, "FormName3[0]"),
        ("check", "Served To Tenant", 1, "RPerson1[0]", "/0"),
        ("check", "Served To Landlord", 1, "RPerson2[0]", "/0"),
        ("check", "Served To Other", 1, "RPerson3[0]", "/0"),
        ("text", "Served To Names", 1, "PersonNames[0]"),
        ("check", "More Than One Tenant", 1, "RPerson4[0]", "/0"),
        ("check", "Method Handed To Person", 1, "RServiceMethod1[0]", "/0"),
        ("check", "Method Authorized Employee", 1, "RServiceMethod2[0]", "/0"),
        ("check", "Method Adult In Unit", 1, "RServiceMethod3[0]", "/0"),
        ("check", "Method Mailbox", 1, "RServiceMethod4[0]", "/0"),
        ("check", "Method Under Door Or Mail Slot", 1, "RServiceMethod5[0]", "/0"),
        ("check", "Method Courier", 1, "RServiceMethod6[0]", "/0"),
        ("check", "Method Fax", 1, "RServiceMethod7[0]", "/0"),
        ("text", "Fax Number", 1, "FaxNumbe[0]"),
        ("check", "Method Mail", 1, "RServiceMethod8[0]", "/0"),
        ("text", "Mail Address", 1, "PersonAddress[0]"),
        ("check", "Method Other", 1, "RServiceMethod9[0]", "/0"),
        ("text", "Other Method Details", 1, "ProvideDetail[0]"),
        ("check", "Signed As Landlord", 1, "SignPerson[0]", "/0"),
        ("check", "Signed As Tenant", 1, "SignPerson[0]", "/1"),
        ("check", "Signed As Representative", 1, "SignPerson[0]", "/2"),
        ("check", "Signed As Other", 1, "SignPerson[0]", "/3"),
        ("text", "Signer First Name", 1, "SFirstName[0]"),
        ("text", "Signer Last Name", 1, "SLastName[0]"),
        ("text", "Signer Phone", 1, "SDayPhone[0]"),
        ("sign", "Signature", 1, "Signature[0]"),
        ("date", "Date Signed", 1, "SignDate[0]")]]},
    {"role": "Administration", "type": "cc", "name": "Rishi Bakshi", "email": "ireppm@ireprealty.com"},
], OUT)
