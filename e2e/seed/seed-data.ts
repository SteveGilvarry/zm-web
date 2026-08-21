/**
 * Ids and credentials that e2e/seed/seed.sql loads. Import from specs that
 * run in seeded mode so assertions reference fixture rows by id instead of
 * "whatever comes first". Keep in sync with seed.sql.
 */
export const SEED = {
  admin: { username: 'e2e-admin', password: 'e2e-admin-pass-not-secret' },
  viewer: { username: 'e2e-viewer', password: 'e2e-viewer-pass-not-secret' },

  server: 9001,
  storage: 9001,
  control: 9001,

  monitors: {
    /** 1920x1080, ROTATE_0, Modect. */
    frontDoor: 9001,
    /** 1280x720, ROTATE_90, Modect. */
    driveway: 9002,
    /** 1920x1080, ROTATE_270, Record (no analysis). */
    garage: 9003,
    /** 1280x720, ROTATE_0, Mocord, PTZ via control 9001 with presets 1-3. */
    ptzDome: 9004,
    all: [9001, 9002, 9003, 9004],
  },

  events: {
    /** Ids 9001..9032, newest first, 90 minutes apart. */
    first: 9001,
    last: 9032,
    count: 32,
    /** Continuous event on the garage monitor with no EndDateTime. */
    open: 9001,
    /** Have 10 Frames rows each (frames 4-6 are Alarm). */
    withFrames: [9002, 9003],
    archived: [9005, 9010, 9015, 9020, 9025, 9030],
    /**
     * Unarchived events reserved for specs that mutate (archive, rename,
     * edit notes). Nothing else asserts on them, and `scratchEvent()` in
     * e2e/fixtures.ts hands a different one to each browser project x skin
     * so parallel workers never touch the same row.
     */
    scratch: [9021, 9022, 9023, 9024, 9026, 9027, 9028, 9029],
  },

  tags: { person: 9001, vehicle: 9002, falseAlarm: 9003 },
  groups: { outdoor: 9001, front: 9002 },
  filters: { purgeWhenFull: 9001, motionOnly: 9002 },
  report: 9001,
  states: { night: 9001, away: 9002 },
  montageLayout: 9001,
  /**
   * 200 rows covering every ZoneMinder severity, so the level filter has
   * something to find at each stop. Counts are exact (see seed.sql).
   */
  logs: {
    first: 9001,
    count: 200,
    byCode: { PNC: 10, FAT: 10, ERR: 20, WAR: 40, INF: 100, DBG: 20 },
  },
} as const;
