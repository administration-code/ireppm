-- Video walkthroughs on listings: uploaded clips (listing-videos bucket) or links (YouTube, Vimeo, Google Drive…).
-- videos: [{ kind: "upload" | "link", url, title }]

alter table public.listings
  add column if not exists videos jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-videos', 'listing-videos', true, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listing-videos: staff manage" on storage.objects;
create policy "listing-videos: staff manage" on storage.objects
  for all using (bucket_id = 'listing-videos' and public.is_staff())
  with check (bucket_id = 'listing-videos' and public.is_staff());
