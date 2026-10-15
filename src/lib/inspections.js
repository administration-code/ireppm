import { getBrowserClient } from "@/lib/supabase";
import { randomId, safeFileName } from "@/lib/maintenance";

export const INSPECTION_BUCKET = "inspection-photos";
export const SIGNED_SECONDS = 300;
export const MAX_PHOTO_MB = 25;

export const INSPECTION_KIND = {
  move_in: "Move-in",
  move_out: "Move-out",
  periodic: "Periodic",
};

export const OVERALL_CONDITION = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const ROOM_CONDITION = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  damaged: "Damaged",
};

export const QUICK_ROOMS = [
  "Entrance",
  "Living room",
  "Kitchen",
  "Bathroom",
  "Bedroom 1",
  "Bedroom 2",
  "Bedroom 3",
  "Laundry",
  "Basement",
  "Exterior",
];

export const INSPECTION_FIELDS =
  "id, unit_id, tenancy_id, turnover_id, kind, inspected_on, inspected_by, tenant_present, overall_condition, rooms, keys_returned, notes, created_at, updated_at";

export const INSPECTION_SELECT = `${INSPECTION_FIELDS},
  unit:units(id, label, property:properties(id, address, city)),
  tenancy:tenancies(id, status, start_date, tenancy_tenants(full_name, is_primary, created_at))`;

export function photoPath(inspectionId, fileName) {
  return `${inspectionId}/${randomId()}/${safeFileName(fileName)}`;
}

export async function uploadPhoto(inspectionId, file) {
  const path = photoPath(inspectionId, file.name);
  const { error } = await getBrowserClient()
    .storage.from(INSPECTION_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(`${file.name} didn't upload. Try again.`);
  return { path, name: file.name };
}

export async function signPhotos(paths) {
  if (!paths.length) return {};
  const { data } = await getBrowserClient().storage.from(INSPECTION_BUCKET).createSignedUrls(paths, SIGNED_SECONDS);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

export const allPhotoPaths = (rooms) =>
  (rooms || []).flatMap((r) => (r.photos || []).map((p) => p.path)).filter(Boolean);
