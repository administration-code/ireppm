"use client";

import { getBrowserClient } from "@/lib/supabase";
import { joinNames, splitStreet } from "@/lib/docusign-templates";

const PROPERTY =
  "id, address, city, postal_code, owner_id, owner_name, owner_email, owner_phone, agreement_start, agreement_renewal, unit_count, custom_fee, monthly_fee, promo_discount, promo_start, promo_end";
const UNIT = `id, label, market_rent, listing_id, property:properties(${PROPERTY})`;

// Loads the records a send form prefills from. Query params: tenancy, unit, property, application.
export async function loadSignatureContext({ tenancy, unit, property, application }) {
  const sb = getBrowserClient();
  const ctx = { tenancy: null, unit: null, property: null, application: null, owner: null };

  if (tenancy) {
    const { data } = await sb
      .from("tenancies")
      .select(`id, unit_id, start_date, end_date, rent, rent_due_day, last_month_deposit, key_deposit, unit:units(${UNIT}), tenancy_tenants(full_name, email, phone, is_primary)`)
      .eq("id", tenancy)
      .maybeSingle();
    ctx.tenancy = data;
    ctx.unit = data?.unit || null;
  }
  if (!ctx.unit && unit) {
    const { data } = await sb.from("units").select(UNIT).eq("id", unit).maybeSingle();
    ctx.unit = data;
  }
  if (application) {
    const { data } = await sb
      .from("applications")
      .select("id, applicant_name, applicant_email, applicant_phone, listing_id")
      .eq("id", application)
      .maybeSingle();
    ctx.application = data;
    if (!ctx.unit && data?.listing_id) {
      const { data: u } = await sb.from("units").select(UNIT).eq("listing_id", data.listing_id).limit(1).maybeSingle();
      ctx.unit = u;
    }
  }
  ctx.property = ctx.unit?.property || null;
  if (!ctx.property && property) {
    const { data } = await sb.from("properties").select(PROPERTY).eq("id", property).maybeSingle();
    ctx.property = data;
  }
  if (ctx.property?.owner_id) {
    const { data } = await sb.from("owners").select("id, name, email, phone, mailing_address").eq("id", ctx.property.owner_id).maybeSingle();
    ctx.owner = data;
  }
  return ctx;
}

export function placeOf(ctx) {
  return [ctx.property?.address, ctx.unit?.label].filter(Boolean).join(", ");
}

// Address, ids and landlord fields shared by every form.
export function baseFields(ctx) {
  const street = splitStreet(ctx.property?.address);
  const landlord = ctx.owner?.name || ctx.property?.owner_name || "";
  return {
    place: placeOf(ctx),
    tenancy_id: ctx.tenancy?.id || null,
    unit_id: ctx.unit?.id || null,
    property_id: ctx.property?.id || null,
    owner_id: ctx.property?.owner_id || null,
    application_id: ctx.application?.id || null,
    street_number: street.number,
    street_name: street.name,
    unit_label: ctx.unit?.label || "",
    city: ctx.property?.city || "",
    postal_code: ctx.property?.postal_code || "",
    landlord_name: landlord,
  };
}

export function tenantsOf(ctx) {
  const list = (ctx.tenancy?.tenancy_tenants || []).map((t) => ({ full_name: t.full_name || "", email: t.email || "" }));
  if (!list.length && ctx.application) list.push({ full_name: ctx.application.applicant_name || "", email: ctx.application.applicant_email || "" });
  return list.length ? list : [{ full_name: "", email: "" }];
}

export const tenantNamesOf = (ctx) => joinNames(tenantsOf(ctx).map((t) => t.full_name));
