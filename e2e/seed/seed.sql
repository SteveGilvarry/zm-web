-- zm-dashboard e2e seed.
--
-- Loads deterministic fixture data into a ZoneMinder schema created by
-- zm_api's `scripts/db-manager.sh` (zm_create.sql.in + db/*.sql). Safe to
-- re-run: every block deletes its own rows first. All seeded rows use ids in
-- the 9000-range and names prefixed `e2e-`, so they never collide with the
-- rows the schema ships (admin user = 1, PurgeWhenFull filter = 1, Default
-- storage = 1, `default` state = 1, preset montage layouts = 1..11, preset
-- Controls, Manufacturers/Models seed lists).
--
-- Timestamps are relative to NOW() so the events always fall inside the
-- dashboard's "last 48 h" windows. Everything else is fixed.
--
-- Companion TypeScript constants: e2e/seed/seed-data.ts. Keep the two in sync.

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Tear down previous seed (reverse dependency order).
-- ---------------------------------------------------------------------------
DELETE FROM Events_Tags      WHERE EventId BETWEEN 9000 AND 9999 OR TagId BETWEEN 9000 AND 9999;
DELETE FROM Frames           WHERE EventId BETWEEN 9000 AND 9999;
DELETE FROM Events_Hour      WHERE EventId BETWEEN 9000 AND 9999;
DELETE FROM Events_Day       WHERE EventId BETWEEN 9000 AND 9999;
DELETE FROM Events_Week      WHERE EventId BETWEEN 9000 AND 9999;
DELETE FROM Events_Month     WHERE EventId BETWEEN 9000 AND 9999;
DELETE FROM Events_Archived  WHERE EventId BETWEEN 9000 AND 9999;
-- event_delete_trigger decrements Event_Summaries; we rebuild it below anyway.
DELETE FROM Events           WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Event_Summaries  WHERE MonitorId BETWEEN 9000 AND 9999;
DELETE FROM Tags             WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Reports          WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Filters          WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Groups_Monitors  WHERE Id BETWEEN 9000 AND 9999 OR GroupId BETWEEN 9000 AND 9999;
DELETE FROM Groups           WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Zones            WHERE Id BETWEEN 9000 AND 9999 OR MonitorId BETWEEN 9000 AND 9999;
DELETE FROM ControlPresets   WHERE MonitorId BETWEEN 9000 AND 9999;
DELETE FROM Monitor_Status   WHERE MonitorId BETWEEN 9000 AND 9999;
DELETE FROM Monitors         WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Controls         WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM MontageLayouts   WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM States           WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Logs             WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Storage          WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Servers          WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Users            WHERE Id BETWEEN 9000 AND 9999;
DELETE FROM Config           WHERE Name LIKE 'ZM_E2E_%' OR Id BETWEEN 9000 AND 9999;

-- ---------------------------------------------------------------------------
-- Users. zm_api verifies passwords with the `bcrypt` crate, which accepts the
-- `$2y$` prefix ZoneMinder's PHP `password_hash()` produces. Login also
-- requires Enabled=1 and APIEnabled=1 (see zm_api src/repo/users.rs).
--
--   e2e-admin  / e2e-admin-pass-not-secret   (full rights)
--   e2e-viewer / e2e-viewer-pass-not-secret  (View only, no System access)
-- ---------------------------------------------------------------------------
INSERT INTO Users
  (Id, Username, Password, Name, Email, Phone, Language, Enabled,
   Stream, Events, Control, Monitors, Groups, Devices, Snapshots, System,
   MaxBandwidth, TokenMinExpiry, APIEnabled, HomeView)
VALUES
  (9001, 'e2e-admin',
   '$2y$10$H53OaWP5MWzEGYrX5vYEI.pMoywUPg5iFrXHw3ySWFgT1q/iT.VAC',
   'E2E Admin', 'e2e-admin@example.test', '', '', 1,
   'View', 'Edit', 'Edit', 'Create', 'Edit', 'Edit', 'Edit', 'Edit',
   '', 0, 1, 'console'),
  (9002, 'e2e-viewer',
   '$2y$10$Z7m43sflnIja8l6fvbEiPubJgqduO1ZCH/keq/MukC23gfzBQZb.a',
   'E2E Viewer', 'e2e-viewer@example.test', '', '', 1,
   'View', 'View', 'None', 'View', 'View', 'None', 'View', 'None',
   '', 0, 1, 'console');

-- ---------------------------------------------------------------------------
-- Server + Storage. Hostnames/paths are documentation-only values (RFC 2606
-- `.test`, RFC 5737 TEST-NET-2 addresses) so nothing can reach a real box.
-- ---------------------------------------------------------------------------
INSERT INTO Servers
  (Id, Protocol, Hostname, Port, PathToIndex, PathToZMS, PathToApi, Name, State_Id, Status,
   CpuLoad, CpuUserPercent, CpuNicePercent, CpuSystemPercent, CpuIdlePercent, CpuUsagePercent,
   TotalMem, FreeMem, TotalSwap, FreeSwap, zmstats, zmaudit, zmtrigger, zmeventnotification)
VALUES
  (9001, 'http', 'zm-e2e.example.test', 80, '/zm/index.php', '/zm/cgi-bin/nph-zms', '/zm/api',
   'e2e-server-1', 1, 'Running',
   0.8, 12.5, 0.0, 4.1, 83.4, 16.6,
   16777216000, 9876543210, 2147483648, 2147483648, 1, 1, 0, 0);

INSERT INTO Storage
  (Id, Path, Name, Type, Url, DiskSpace, Scheme, ServerId, DoDelete, Enabled)
VALUES
  (9001, '/var/cache/zoneminder/events-e2e', 'e2e-events', 'local', NULL, NULL, 'Medium', 9001, 1, 1);

-- ---------------------------------------------------------------------------
-- PTZ control profile: a copy of the stock Ffmpeg/Pelco-D row (positional
-- VALUES, same column order as zm_create.sql.in) with our own id and name.
-- ---------------------------------------------------------------------------
INSERT INTO Controls VALUES
  (9001,'e2e-PTZ Dome (Pelco-D)','Ffmpeg','PelcoD',1,1,0,0,1,1,0,0,1,NULL,NULL,NULL,NULL,1,0,3,1,1,0,0,1,NULL,NULL,NULL,NULL,0,NULL,NULL,1,1,0,1,0,NULL,NULL,NULL,NULL,0,NULL,NULL,0,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,1,1,0,1,0,NULL,NULL,NULL,NULL,0,NULL,NULL,0,0,1,20,1,1,1,1,0,0,0,1,1,NULL,NULL,NULL,NULL,1,0,63,1,254,1,NULL,NULL,NULL,NULL,1,0,63,1,254,0,0);

-- ---------------------------------------------------------------------------
-- Monitors. Four Ffmpeg cameras; 9002 is ROTATE_90 and 9003 is ROTATE_270 for
-- the rotation specs. Stream URLs point at TEST-NET-2 so zmc can never
-- connect even if someone starts it. Columns not listed take schema defaults.
-- ---------------------------------------------------------------------------
INSERT INTO Monitors
  (Id, Name, Deleted, Notes, ServerId, StorageId, ManufacturerId, ModelId,
   Type, `Function`, Capturing, Analysing, Recording, Enabled, DecodingEnabled, Decoding,
   Protocol, Method, Host, Port, Path, Options, User, Pass,
   Width, Height, Colours, Orientation,
   SaveJPEGs, VideoWriter, OutputCodecName, OutputContainer, RecordAudio,
   EventPrefix, LabelFormat, LabelX, LabelY, LabelSize,
   ImageBufferCount, MaxImageBufferCount, WarmupCount, PreEventCount, PostEventCount,
   AlarmFrameCount, SectionLength, MinSectionLength, FrameSkip, MotionFrameSkip,
   AnalysisFPSLimit, MaxFPS, AlarmMaxFPS, FPSReportInterval, RefBlendPerc, AlarmRefBlendPerc,
   Controllable, ControlId, ControlDevice, ControlAddress, AutoStopTimeout, TrackMotion, ReturnLocation,
   DefaultRate, DefaultScale, DefaultCodec, SignalCheckPoints, SignalCheckColour, WebColour,
   Sequence, Importance, Latitude, Longitude)
VALUES
  (9001, 'e2e-Front Door', 0, 'e2e seed: upright 1080p camera over the front door', 9001, 9001,
   (SELECT Id FROM Manufacturers WHERE Name = 'Axis' LIMIT 1), NULL,
   'Ffmpeg', 'Modect', 'Always', 'Always', 'OnMotion', 1, 1, 'Always',
   'rtsp', 'rtpRtsp', NULL, '', 'rtsp://192.0.2.11:554/stream1', NULL, 'e2e', 'e2e',
   1920, 1080, 4, 'ROTATE_0',
   0, 1, 'auto', 'mp4', 0,
   'Event-', '%N - %d/%m/%y %H:%M:%S', 0, 0, 1,
   5, 0, 0, 5, 5,
   1, 600, 10, 0, 0,
   5.00, NULL, NULL, 250, 6, 6,
   0, NULL, NULL, NULL, NULL, 0, -1,
   100, '0', 'auto', 0, '#0000BE', '#00d4ff',
   1, 'Normal', -37.81360000, 144.96310000),
  (9002, 'e2e-Driveway', 0, 'e2e seed: portrait camera, ROTATE_90 — exercises the Safari rotation path', 9001, 9001,
   (SELECT Id FROM Manufacturers WHERE Name = 'Dahua' LIMIT 1), NULL,
   'Ffmpeg', 'Modect', 'Always', 'Always', 'OnMotion', 1, 1, 'Always',
   'rtsp', 'rtpRtsp', NULL, '', 'rtsp://192.0.2.12:554/cam/realmonitor?channel=1&subtype=0', NULL, 'e2e', 'e2e',
   1280, 720, 4, 'ROTATE_90',
   0, 1, 'auto', 'mp4', 0,
   'Event-', '%N - %d/%m/%y %H:%M:%S', 0, 0, 1,
   5, 0, 0, 5, 5,
   1, 600, 10, 0, 0,
   5.00, NULL, NULL, 250, 6, 6,
   0, NULL, NULL, NULL, NULL, 0, -1,
   100, '0', 'auto', 0, '#0000BE', '#ffb000',
   2, 'Normal', NULL, NULL),
  (9003, 'e2e-Garage', 0, 'e2e seed: continuous recording, ROTATE_270, no motion analysis', 9001, 9001,
   (SELECT Id FROM Manufacturers WHERE Name = 'Amcrest' LIMIT 1), NULL,
   'Ffmpeg', 'Record', 'Always', 'None', 'Always', 1, 1, 'KeyFrames',
   'rtsp', 'rtpRtsp', NULL, '', 'rtsp://192.0.2.13:554/h264Preview_01_main', NULL, 'e2e', 'e2e',
   1920, 1080, 4, 'ROTATE_270',
   0, 1, 'auto', 'mp4', 1,
   'Event-', '%N - %d/%m/%y %H:%M:%S', 0, 0, 1,
   5, 0, 0, 5, 5,
   1, 600, 10, 0, 0,
   NULL, NULL, NULL, 250, 6, 6,
   0, NULL, NULL, NULL, NULL, 0, -1,
   100, '0', 'auto', 0, '#0000BE', '#10b981',
   3, 'Less', NULL, NULL),
  (9004, 'e2e-PTZ Dome', 0, 'e2e seed: controllable dome, Pelco-D via Controls 9001, presets 1-3', 9001, 9001,
   (SELECT Id FROM Manufacturers WHERE Name = 'Axis' LIMIT 1), NULL,
   'Ffmpeg', 'Mocord', 'Always', 'Always', 'Always', 1, 1, 'Always',
   'rtsp', 'rtpRtsp', NULL, '', 'rtsp://192.0.2.14:554/axis-media/media.amp', NULL, 'e2e', 'e2e',
   1280, 720, 4, 'ROTATE_0',
   0, 1, 'auto', 'mp4', 0,
   'Event-', '%N - %d/%m/%y %H:%M:%S', 0, 0, 1,
   5, 0, 0, 5, 5,
   1, 600, 10, 0, 0,
   5.00, NULL, NULL, 250, 6, 6,
   1, 9001, '/dev/ttyUSB0', '192.0.2.14:80', 1.00, 0, -1,
   100, '0', 'auto', 0, '#0000BE', '#dc2626',
   4, 'Normal', NULL, NULL);

INSERT INTO Monitor_Status (MonitorId, Status, CaptureFPS, AnalysisFPS, CaptureBandwidth)
VALUES
  (9001, 'Connected',  15.02, 5.00, 2457600),
  (9002, 'Connected',   9.98, 5.00, 1228800),
  (9003, 'Running',    24.96, 0.00, 4096000),
  (9004, 'NotRunning',  0.00, 0.00, 0);

INSERT INTO ControlPresets (MonitorId, Preset, Label) VALUES
  (9004, 1, 'e2e-Home'),
  (9004, 2, 'e2e-Gate'),
  (9004, 3, 'e2e-Driveway');

-- ---------------------------------------------------------------------------
-- Zones: one full-frame Active zone per monitor, in pixel coordinates.
-- Thresholds follow the legacy defaults (3% / 75% of the frame area etc.).
-- Zone_Insert_Trigger maintains Monitors.ZoneCount.
-- ---------------------------------------------------------------------------
INSERT INTO Zones
  (Id, MonitorId, Name, Type, Units, NumCoords, Coords, Area, AlarmRGB, CheckMethod,
   MinPixelThreshold, MaxPixelThreshold, MinAlarmPixels, MaxAlarmPixels,
   FilterX, FilterY, MinFilterPixels, MaxFilterPixels, MinBlobPixels, MaxBlobPixels,
   MinBlobs, MaxBlobs, OverloadFrames, ExtendAlarmFrames)
VALUES
  (9001, 9001, 'e2e-All', 'Active', 'Pixels', 4, '0,0 1919,0 1919,1079 0,1079', 2073600, 16711680, 'Blobs',
   25, NULL, 62208, 1555200, 3, 3, 62208, 1555200, 41472, NULL, 1, NULL, 0, 0),
  (9002, 9002, 'e2e-All', 'Active', 'Pixels', 4, '0,0 1279,0 1279,719 0,719', 921600, 16711680, 'Blobs',
   25, NULL, 27648, 691200, 3, 3, 27648, 691200, 18432, NULL, 1, NULL, 0, 0),
  (9003, 9003, 'e2e-All', 'Inactive', 'Pixels', 4, '0,0 1919,0 1919,1079 0,1079', 2073600, 16711680, 'Blobs',
   25, NULL, 62208, 1555200, 3, 3, 62208, 1555200, 41472, NULL, 1, NULL, 0, 0),
  (9004, 9004, 'e2e-All', 'Active', 'Pixels', 4, '0,0 1279,0 1279,719 0,719', 921600, 16711680, 'Blobs',
   25, NULL, 27648, 691200, 3, 3, 27648, 691200, 18432, NULL, 1, NULL, 0, 0);

-- ---------------------------------------------------------------------------
-- Groups: e2e-Outdoor (9001,9002,9004) with child e2e-Front (9001).
-- ---------------------------------------------------------------------------
INSERT INTO Groups (Id, Name, ParentId) VALUES
  (9001, 'e2e-Outdoor', NULL),
  (9002, 'e2e-Front', 9001);

INSERT INTO Groups_Monitors (Id, GroupId, MonitorId) VALUES
  (9001, 9001, 9001),
  (9002, 9001, 9002),
  (9003, 9001, 9004),
  (9004, 9002, 9001);

-- ---------------------------------------------------------------------------
-- Events: 32 events, ids 9001..9032, newest first, 90 min apart (~46.5 h).
-- Per-row inputs are (id, monitor, minutes ago, length s, cause, archived,
-- notes, avg score, max score); everything else is derived so Width/Height/
-- Orientation always match the monitor. 9001 is still open (no EndDateTime).
-- ---------------------------------------------------------------------------
INSERT INTO Events
  (Id, MonitorId, StorageId, SecondaryStorageId, Name, Cause, StartDateTime, EndDateTime,
   Width, Height, Length, Frames, AlarmFrames, DefaultVideo, SaveJPEGs,
   TotScore, AvgScore, MaxScore, MaxScoreFrameId, Archived, Videoed, Uploaded, Emailed,
   Messaged, Executed, Notes, StateId, Orientation, DiskSpace, Scheme, Locked)
SELECT
  s.id, s.monitor_id, 9001, 0, CONCAT('Event-', s.id), s.cause,
  NOW() - INTERVAL s.minutes_ago MINUTE,
  CASE WHEN s.length_s IS NULL THEN NULL
       ELSE NOW() - INTERVAL s.minutes_ago MINUTE + INTERVAL s.length_s SECOND END,
  m.Width, m.Height,
  COALESCE(s.length_s, 0),
  ROUND(COALESCE(s.length_s, 20) * 10),
  CASE WHEN s.cause = 'Continuous' THEN 0 ELSE ROUND(COALESCE(s.length_s, 20) * 2) END,
  CONCAT(s.id, '-video.mp4'), 0,
  CASE WHEN s.cause = 'Continuous' THEN 0 ELSE s.avg_score * ROUND(COALESCE(s.length_s, 20) * 2) END,
  s.avg_score, s.max_score,
  CASE WHEN s.id IN (9002, 9003) THEN 5 ELSE NULL END,
  s.archived, 1, 0, 0, 0, 0, s.notes, 1, m.Orientation,
  ROUND(COALESCE(s.length_s, 20) * 1572864),
  'Medium', 0
FROM (VALUES
  (9001, 9003,    5, NULL,   'Continuous', 0, NULL, 0, 0),
  (9002, 9001,   95, 12.50,  'Motion',     0, 'e2e: person at door', 45, 120),
  (9003, 9002,  185, 45.00,  'Motion',     0, 'e2e: vehicle in driveway', 38, 210),
  (9004, 9003,  275, 600.00, 'Continuous', 0, NULL, 0, 0),
  (9005, 9004,  365, 8.20,   'Forced Web', 1, 'e2e: archived by operator', 12, 30),
  (9006, 9001,  455, 22.75,  'Motion',     0, 'e2e: vehicle passing', 29, 88),
  (9007, 9002,  545, 3.20,   'Motion',     0, 'e2e: cat', 9, 17),
  (9008, 9003,  635, 600.00, 'Continuous', 0, NULL, 0, 0),
  (9009, 9004,  725, 31.00,  'Motion',     0, 'e2e: PTZ tracked target', 40, 160),
  (9010, 9001,  815, 17.40,  'Motion',     1, 'e2e: archived delivery', 52, 230),
  (9011, 9002,  905, 64.10,  'Motion',     0, NULL, 33, 99),
  (9012, 9003,  995, 600.00, 'Continuous', 0, NULL, 0, 0),
  (9013, 9004, 1085, 5.60,   'Linked',     0, 'e2e: linked from 9001', 15, 41),
  (9014, 9001, 1175, 41.90,  'Motion',     0, 'e2e: person at door', 47, 150),
  (9015, 9002, 1265, 9.30,   'Motion',     1, 'e2e: archived false alarm', 11, 25),
  (9016, 9003, 1355, 600.00, 'Continuous', 0, NULL, 0, 0),
  (9017, 9004, 1445, 120.00, 'Motion',     0, 'e2e: long loiter', 36, 140),
  (9018, 9001, 1535, 6.80,   'Motion',     0, NULL, 18, 52),
  (9019, 9002, 1625, 27.25,  'Motion',     0, 'e2e: vehicle leaving', 31, 97),
  (9020, 9003, 1715, 600.00, 'Continuous', 1, 'e2e: archived night segment', 0, 0),
  (9021, 9004, 1805, 14.00,  'Motion',     0, NULL, 22, 70),
  (9022, 9001, 1895, 58.50,  'Motion',     0, 'e2e: person at door', 44, 180),
  (9023, 9002, 1985, 2.90,   'Motion',     0, 'e2e: headlights', 8, 14),
  (9024, 9003, 2075, 600.00, 'Continuous', 0, NULL, 0, 0),
  (9025, 9004, 2165, 19.75,  'Forced Web', 1, 'e2e: archived manual trigger', 20, 60),
  (9026, 9001, 2255, 33.10,  'Motion',     0, NULL, 27, 91),
  (9027, 9002, 2345, 11.00,  'Motion',     0, 'e2e: vehicle in driveway', 35, 112),
  (9028, 9003, 2435, 600.00, 'Continuous', 0, NULL, 0, 0),
  (9029, 9004, 2525, 7.40,   'Motion',     0, NULL, 14, 38),
  (9030, 9001, 2615, 90.00,  'Motion',     1, 'e2e: archived long event', 50, 250),
  (9031, 9002, 2705, 16.60,  'Motion',     0, NULL, 26, 77),
  (9032, 9003, 2795, 600.00, 'Continuous', 0, NULL, 0, 0)
) AS s(id, monitor_id, minutes_ago, length_s, cause, archived, notes, avg_score, max_score)
JOIN Monitors m ON m.Id = s.monitor_id;

-- Frames for events 9002 and 9003 (10 each; frame 5 is the alarm peak) so
-- the per-frame scrubber has something to scrub.
INSERT INTO Frames (EventId, FrameId, Type, TimeStamp, Delta, Score)
WITH RECURSIVE seq AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM seq WHERE n < 10)
SELECT e.Id, seq.n,
       CASE WHEN seq.n BETWEEN 4 AND 6 THEN 'Alarm' ELSE 'Normal' END,
       e.StartDateTime + INTERVAL (seq.n - 1) * 500000 MICROSECOND,
       (seq.n - 1) * 0.5,
       CASE seq.n WHEN 4 THEN 60 WHEN 5 THEN e.MaxScore WHEN 6 THEN 35 ELSE 0 END
FROM Events e CROSS JOIN seq
WHERE e.Id IN (9002, 9003);

-- Tags
INSERT INTO Tags (Id, Name, CreateDate, CreatedBy, LastAssignedDate) VALUES
  (9001, 'e2e-person',      NOW() - INTERVAL 30 DAY, 9001, NOW() - INTERVAL 95 MINUTE),
  (9002, 'e2e-vehicle',     NOW() - INTERVAL 30 DAY, 9001, NOW() - INTERVAL 185 MINUTE),
  (9003, 'e2e-false-alarm', NOW() - INTERVAL 30 DAY, 9001, NOW() - INTERVAL 1265 MINUTE);

INSERT INTO Events_Tags (TagId, EventId, AssignedDate, AssignedBy) VALUES
  (9001, 9002, NOW() - INTERVAL 95 MINUTE,   9001),
  (9001, 9014, NOW() - INTERVAL 1175 MINUTE, 9001),
  (9001, 9022, NOW() - INTERVAL 1895 MINUTE, 9001),
  (9002, 9003, NOW() - INTERVAL 185 MINUTE,  9001),
  (9002, 9006, NOW() - INTERVAL 455 MINUTE,  9001),
  (9002, 9027, NOW() - INTERVAL 2345 MINUTE, 9001),
  (9003, 9015, NOW() - INTERVAL 1265 MINUTE, 9001);

-- ---------------------------------------------------------------------------
-- Rollup buckets + Event_Summaries. The schema's event_insert_trigger is
-- commented out upstream (zmc/zmstats maintain these), so build them here.
-- ---------------------------------------------------------------------------
INSERT INTO Events_Hour (EventId, MonitorId, StartDateTime, DiskSpace)
  SELECT Id, MonitorId, StartDateTime, DiskSpace FROM Events
  WHERE Id BETWEEN 9000 AND 9999 AND StartDateTime > NOW() - INTERVAL 1 HOUR;
INSERT INTO Events_Day (EventId, MonitorId, StartDateTime, DiskSpace)
  SELECT Id, MonitorId, StartDateTime, DiskSpace FROM Events
  WHERE Id BETWEEN 9000 AND 9999 AND StartDateTime > NOW() - INTERVAL 1 DAY;
INSERT INTO Events_Week (EventId, MonitorId, StartDateTime, DiskSpace)
  SELECT Id, MonitorId, StartDateTime, DiskSpace FROM Events
  WHERE Id BETWEEN 9000 AND 9999 AND StartDateTime > NOW() - INTERVAL 7 DAY;
INSERT INTO Events_Month (EventId, MonitorId, StartDateTime, DiskSpace)
  SELECT Id, MonitorId, StartDateTime, DiskSpace FROM Events
  WHERE Id BETWEEN 9000 AND 9999 AND StartDateTime > NOW() - INTERVAL 1 MONTH;
INSERT INTO Events_Archived (EventId, MonitorId, DiskSpace)
  SELECT Id, MonitorId, DiskSpace FROM Events
  WHERE Id BETWEEN 9000 AND 9999 AND Archived = 1;

INSERT INTO Event_Summaries
  (MonitorId, TotalEvents, TotalEventDiskSpace, HourEvents, HourEventDiskSpace,
   DayEvents, DayEventDiskSpace, WeekEvents, WeekEventDiskSpace,
   MonthEvents, MonthEventDiskSpace, ArchivedEvents, ArchivedEventDiskSpace)
SELECT
  m.Id,
  COUNT(e.Id), COALESCE(SUM(e.DiskSpace), 0),
  SUM(e.StartDateTime > NOW() - INTERVAL 1 HOUR),
  COALESCE(SUM(CASE WHEN e.StartDateTime > NOW() - INTERVAL 1 HOUR THEN e.DiskSpace END), 0),
  SUM(e.StartDateTime > NOW() - INTERVAL 1 DAY),
  COALESCE(SUM(CASE WHEN e.StartDateTime > NOW() - INTERVAL 1 DAY THEN e.DiskSpace END), 0),
  SUM(e.StartDateTime > NOW() - INTERVAL 7 DAY),
  COALESCE(SUM(CASE WHEN e.StartDateTime > NOW() - INTERVAL 7 DAY THEN e.DiskSpace END), 0),
  SUM(e.StartDateTime > NOW() - INTERVAL 1 MONTH),
  COALESCE(SUM(CASE WHEN e.StartDateTime > NOW() - INTERVAL 1 MONTH THEN e.DiskSpace END), 0),
  SUM(e.Archived = 1),
  COALESCE(SUM(CASE WHEN e.Archived = 1 THEN e.DiskSpace END), 0)
FROM Monitors m
LEFT JOIN Events e ON e.MonitorId = m.Id AND e.Id BETWEEN 9000 AND 9999
WHERE m.Id BETWEEN 9000 AND 9999
GROUP BY m.Id;

UPDATE Storage SET DiskSpace = (SELECT COALESCE(SUM(DiskSpace), 0) FROM Events WHERE StorageId = 9001)
WHERE Id = 9001;

-- ---------------------------------------------------------------------------
-- Filters, one per wire format the dashboard has to cope with.
--   9001 `e2e-PurgeWhenFull` — the stock PurgeWhenFull `{"terms":[…]}`
--        query_json verbatim (legacy attr/op/val tokens, obr/cbr brackets),
--        AutoDelete + Background set. This is the format ZoneMinder writes.
--   9002 `e2e-Motion only`   — the dashboard's *old* `{"rules":[…]}` shape.
--        The rule builder no longer reads it: the page must say so and
--        disable Save rather than overwrite it. Keep it as the fixture for
--        that honest-refusal path.
--   9003 `e2e-Recent motion` — a readable `{"terms":[…]}` filter with no
--        destructive action, for the match preview.
-- ---------------------------------------------------------------------------
INSERT INTO Filters
  (Id, Name, UserId, ExecuteInterval, Query_json,
   AutoArchive, AutoUnarchive, AutoVideo, AutoUpload, AutoEmail, EmailTo, EmailSubject, EmailBody,
   EmailServer, EmailFormat, AutoMessage, AutoExecute, AutoExecuteCmd, AutoDelete,
   AutoMove, AutoMoveTo, AutoCopy, AutoCopyTo, UpdateDiskSpace, Background, Concurrent, LockRows)
VALUES
  (9001, 'e2e-PurgeWhenFull', 9001, 60,
   '{"sort_field":"Id","terms":[{"val":0,"attr":"Archived","op":"="},{"cnj":"and","val":95,"attr":"DiskPercent","op":">="},{"cnj":"and","obr":"0","attr":"EndDateTime","op":"IS NOT","val":"NULL","cbr":"0"}],"limit":100,"sort_asc":1}',
   0, 0, 0, 0, 0, '', '', '',
   NULL, 'Individual', 0, 0, '', 1,
   0, 0, 0, 0, 0, 1, 0, 0),
  (9002, 'e2e-Motion only', 9001, 0,
   '{"rules":[{"field":"cause","operator":"=","value":"Motion","conjunction":"and"}],"sort":{"field":"start_date_time","dir":"desc"}}',
   0, 0, 0, 0, 0, '', '', '',
   NULL, 'Individual', 0, 0, '', 0,
   0, 0, 0, 0, 0, 0, 0, 0),
  (9003, 'e2e-Recent motion', 9001, 0,
   '{"sort_field":"StartDateTime","terms":[{"attr":"Cause","op":"LIKE","val":"Motion"}],"limit":50,"sort_asc":0}',
   0, 0, 0, 0, 0, '', '', '',
   NULL, 'Individual', 0, 0, '', 0,
   0, 0, 0, 0, 0, 0, 0, 0);

INSERT INTO Reports (Id, Name, FilterId, StartDateTime, EndDateTime, `Interval`, CreatedBy) VALUES
  (9001, 'e2e-Weekly motion', 9002, NOW() - INTERVAL 7 DAY, NOW(), 10080, 9001);

-- ---------------------------------------------------------------------------
-- Run states. Definition = "MonitorId:Capturing:Analysing:Recording,..."
-- (the 1.37+ triple format). `default` (Id 1) stays the active state.
-- ---------------------------------------------------------------------------
INSERT INTO States (Id, Name, Definition, IsActive) VALUES
  (9001, 'e2e-Night', '9001:Always:Always:OnMotion,9002:Always:Always:OnMotion,9003:Always:None:Always,9004:Always:Always:Always', 0),
  (9002, 'e2e-Away',  '9001:Always:Always:Always,9002:Always:Always:Always,9003:Always:None:Always,9004:None:None:None', 0);

-- ---------------------------------------------------------------------------
-- Montage layout in the legacy gridstack shape: a flat array of
-- {monitor_id,x,y,w,h} on a 12-column grid (see legacy-requirements/montage.md).
-- ---------------------------------------------------------------------------
INSERT INTO MontageLayouts (Id, Name, UserId, Positions) VALUES
  (9001, 'e2e-Wall', 9001,
   '[{"monitor_id":9001,"x":0,"y":0,"w":6,"h":4},{"monitor_id":9002,"x":6,"y":0,"w":3,"h":4},{"monitor_id":9003,"x":9,"y":0,"w":3,"h":4},{"monitor_id":9004,"x":0,"y":4,"w":12,"h":6}]');

-- ---------------------------------------------------------------------------
-- Logs: 200 rows, ids 9001..9200, 37 s apart going back ~2 h.
-- Every ZoneMinder severity is represented so the level filter has rows to
-- find at each stop. Mix per 20 rows: 2 ERR (-2), 4 WAR (-1), 1 FAT (-3),
-- 1 PNC (-4), 2 DBG (1), 10 INF (0) — over 200 rows that is
-- 20 ERR / 40 WAR / 10 FAT / 10 PNC / 20 DBG / 100 INF.
-- ---------------------------------------------------------------------------
INSERT INTO Logs (Id, TimeKey, Component, ServerId, Pid, Level, Code, Message, File, Line)
WITH RECURSIVE seq AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM seq WHERE n < 200)
SELECT
  9000 + n,
  UNIX_TIMESTAMP(NOW()) - n * 37 + (n MOD 1000) / 1000,
  ELT(1 + (n MOD 5), 'zmc_m9001', 'zma_m9002', 'zmdc', 'zmfilter', 'web_js'),
  9001,
  4100 + (n MOD 7),
  CASE n MOD 20
    WHEN 0 THEN -2 WHEN 10 THEN -2
    WHEN 1 THEN -1 WHEN 2 THEN -1 WHEN 11 THEN -1 WHEN 12 THEN -1
    WHEN 3 THEN -3
    WHEN 13 THEN -4
    WHEN 4 THEN 1 WHEN 14 THEN 1
    ELSE 0
  END,
  CASE n MOD 20
    WHEN 0 THEN 'ERR' WHEN 10 THEN 'ERR'
    WHEN 1 THEN 'WAR' WHEN 2 THEN 'WAR' WHEN 11 THEN 'WAR' WHEN 12 THEN 'WAR'
    WHEN 3 THEN 'FAT'
    WHEN 13 THEN 'PNC'
    WHEN 4 THEN 'DBG' WHEN 14 THEN 'DBG'
    ELSE 'INF'
  END,
  CASE n MOD 20
    WHEN 0 THEN CONCAT('e2e #', n, ': Unable to read from socket, retrying (errno 104)')
    WHEN 10 THEN CONCAT('e2e #', n, ': Unable to read from socket, retrying (errno 104)')
    WHEN 1 THEN CONCAT('e2e #', n, ': Buffer overrun at index ', n MOD 50, ', image count ', 50 + (n MOD 200))
    WHEN 11 THEN CONCAT('e2e #', n, ': Buffer overrun at index ', n MOD 50, ', image count ', 50 + (n MOD 200))
    WHEN 2 THEN CONCAT('e2e #', n, ': Capture FPS dropped below 5 on monitor 900', 1 + (n MOD 4))
    WHEN 12 THEN CONCAT('e2e #', n, ': Capture FPS dropped below 5 on monitor 900', 1 + (n MOD 4))
    WHEN 3 THEN CONCAT('e2e #', n, ': Shared memory not valid, cannot continue')
    WHEN 13 THEN CONCAT('e2e #', n, ': Failed to allocate image buffer, aborting')
    WHEN 4 THEN CONCAT('e2e #', n, ': Queued packet at ', n MOD 60, 's, queue depth ', n MOD 12)
    WHEN 14 THEN CONCAT('e2e #', n, ': Queued packet at ', n MOD 60, 's, queue depth ', n MOD 12)
    ELSE CONCAT('e2e #', n, ': Monitor 900', 1 + (n MOD 4), ' capture ', 10 + (n MOD 20), '.0 fps, analysis 5.0 fps')
  END,
  ELT(1 + (n MOD 4), 'zm_monitor.cpp', 'zm_ffmpeg_camera.cpp', 'zmdc.pl', 'zm_event.cpp'),
  100 + (n MOD 800)
FROM seq;

-- ---------------------------------------------------------------------------
-- A few Config rows so /settings has something to show. PK is Name.
-- ---------------------------------------------------------------------------
INSERT INTO Config (Id, Name, Value, Type, DefaultValue, Hint, Pattern, Format, Prompt, Help, Category, Readonly, Private, System, Requires) VALUES
  (9001, 'ZM_E2E_TIMEZONE', 'Australia/Melbourne', 'string', '', 'Olson timezone', NULL, NULL, 'Timezone used by the e2e seed', 'e2e seed row; mirrors ZM_TIMEZONE', 'system', 0, 0, 1, NULL),
  (9002, 'ZM_E2E_LANG_DEFAULT', 'en_gb', 'string', 'en_gb', 'language code', NULL, NULL, 'Default language', 'e2e seed row; mirrors ZM_LANG_DEFAULT', 'system', 0, 0, 0, NULL),
  (9003, 'ZM_E2E_OPT_USE_AUTH', '1', 'boolean', '1', 'yes|no', NULL, NULL, 'Authenticate user logins', 'e2e seed row; mirrors ZM_OPT_USE_AUTH', 'system', 0, 0, 1, NULL),
  (9004, 'ZM_E2E_WEB_EVENT_DISK_SPACE', '1', 'boolean', '0', 'yes|no', NULL, NULL, 'Show disk space used by each event', 'e2e seed row; mirrors ZM_WEB_EVENT_DISK_SPACE', 'web', 0, 0, 0, NULL),
  (9005, 'ZM_E2E_DIR_EVENTS', '/var/cache/zoneminder/events-e2e', 'directory', 'events', 'relative/path/to/events', NULL, NULL, 'Directory where events are stored', 'e2e seed row; mirrors ZM_DIR_EVENTS', 'paths', 0, 0, 1, NULL);

SET FOREIGN_KEY_CHECKS = 1;
