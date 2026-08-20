/**
 * `query_json` strings copied verbatim from `GET /api/v3/filters` on the dev
 * box (192.168.0.45, 2026-08-21). These are ZoneMinder's own stock filters;
 * the round-trip tests assert we reproduce them byte-for-byte.
 */
export const PURGE_WHEN_FULL_QUERY_JSON =
  '{"terms":[{"obr":"0","attr":"Archived","op":"=","val":"0","cbr":"0"},{"cnj":"and","obr":"0","attr":"DiskPercent","op":">=","val":"80","cbr":"0"},{"cnj":"and","obr":"0","attr":"EndDateTime","op":"IS NOT","val":"NULL","cbr":"0"}],"sort_field":"Id","sort_asc":"1","skip_locked":"0","limit":"100"}';

export const UPDATE_DISK_SPACE_QUERY_JSON =
  '{"terms":[{"attr":"DiskSpace","op":"IS","val":"NULL"},{"cnj":"and","obr":"0","attr":"EndDateTime","op":"IS NOT","val":"NULL","cbr":"0"}]}';

/** The full rows, as returned live (minus nothing). */
export const PURGE_WHEN_FULL_ROW = {
  id: 1,
  name: 'PurgeWhenFull',
  user_id: 1,
  execute_interval: 60,
  query_json: PURGE_WHEN_FULL_QUERY_JSON,
  auto_archive: 0, auto_unarchive: 0, auto_video: 0, auto_upload: 0, auto_email: 0,
  email_to: '', email_subject: '', email_body: '', email_server: null, email_format: 'Individual',
  auto_message: 0, auto_execute: 0, auto_execute_cmd: '', auto_delete: 1,
  auto_move: 0, auto_move_to: 0, auto_copy: 0, auto_copy_to: 0,
  update_disk_space: 0, background: 1, concurrent: 0, lock_rows: 0,
};

export const UPDATE_DISK_SPACE_ROW = {
  id: 2,
  name: 'Update DiskSpace',
  user_id: 1,
  execute_interval: 60,
  query_json: UPDATE_DISK_SPACE_QUERY_JSON,
  auto_archive: 0, auto_unarchive: 0, auto_video: 0, auto_upload: 0, auto_email: 0,
  email_to: '', email_subject: '', email_body: '', email_server: null, email_format: 'Individual',
  auto_message: 0, auto_execute: 0, auto_execute_cmd: '', auto_delete: 0,
  auto_move: 0, auto_move_to: 0, auto_copy: 0, auto_copy_to: 0,
  update_disk_space: 1, background: 1, concurrent: 0, lock_rows: 0,
  filter: {
    where: {
      match: 'all',
      rules: [
        { field: 'disk_space', op: 'is_null', value: null },
        { field: 'end_time', op: 'is_not_null', value: null },
      ],
    },
    sort: null,
    limit: null,
  },
};
