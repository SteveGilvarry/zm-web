/**
 * The classic skin's monitor-editor catalogue: legacy `monitor.php`
 * (ZoneMinder 1.39.41) tab by tab — the same tab order, field order,
 * English labels and widget per row as the PHP form renders, so an
 * operator moving from the PHP UI finds every control where it was.
 *
 * Same field keys as the modern catalogue in `fields.ts` (both edit one
 * draft); only the presentation differs. Rows the backend cannot serve yet
 * are left out and listed at the end of this comment, so the gap is
 * visible rather than faked:
 *
 *  - Encoder Template + Apply (zm-api#144)
 *  - Encoder HW Accel Name / Device, Use Wallclock Timestamps, Show,
 *    Go2RTC Live Stream, Stream source, Default Player (zm-api#159: the
 *    response has them, no request accepts them)
 *  - Current Level audio meter, Actions tab, Probe (no endpoint)
 *  - Id on a new monitor (`CreateMonitorRequest` has no `id`)
 *
 * Labels are built through `t` with literal keys like `buildTabs`.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isSet, encoderFitsCodec,
  type FieldDef, type FieldValue, type FieldVisibility, type TabDef, type Translate,
} from './fields';

/** `fourcc('G','R','E','Y')` — the V4L2 palette ids `monitor.php` builds. */
const fourcc = (code: string) =>
  code.charCodeAt(0) | (code.charCodeAt(1) << 8) | (code.charCodeAt(2) << 16) | (code.charCodeAt(3) << 24);

/** Encoder names `monitor.php` offers, in its order. */
const ENCODERS = [
  'libx264', 'h264', 'h264_nvenc', 'h264_omx', 'h264_qsv', 'h264_vaapi', 'h264_v4l2m2m',
  'libx265', 'hevc_nvenc', 'hevc_qsv', 'hevc_vaapi',
  'libvpx-vp9', 'vp9-qsv', 'libsvtav1', 'libaom-av1', 'av1_qsv', 'av1_vaapi', 'av1_nvenc',
];

/** Decoder names `monitor.php` offers, in its order (`vp9_qsv` is labelled `vp9-qsv` there). */
const DECODERS: Array<[string, string]> = [
  ['libx264', 'libx264'], ['h264', 'h264'], ['h264_cuvid', 'h264_cuvid'], ['h264_nvmpi', 'h264_nvmpi'],
  ['h264_mmal', 'h264_mmal'], ['h264_omx', 'h264_omx'], ['h264_qsv', 'h264_qsv'], ['h264_vaapi', 'h264_vaapi'],
  ['h264_v4l2m2m', 'h264_v4l2m2m'], ['libx265', 'libx265'], ['hevc', 'hevc'], ['hevc_cuvid', 'hevc_cuvid'],
  ['hevc_nvmpi', 'hevc_nvmpi'], ['hevc_qsv', 'hevc_qsv'], ['hevc_vaapi', 'hevc_vaapi'], ['vp8_nvmpi', 'vp8_nvmpi'],
  ['libvpx-vp9', 'libvpx-vp9'], ['vp9_qsv', 'vp9-qsv'], ['vp9_cuvid', 'vp9_cuvid'], ['vp9_nvmpi', 'vp9_nvmpi'],
  ['vp9_v4l2m2m', 'vp9_v4l2m2m'], ['libsvtav1', 'libsvtav1'], ['libaom-av1', 'libaom-av1'], ['libdav1d', 'libdav1d'],
  ['av1', 'av1'], ['av1_qsv', 'av1_qsv'], ['av1_cuvid', 'av1_cuvid'],
];

/** The legacy page builds its tab list from these (`monitor.php` `$tabs`). */
const notWebSite = (d: Record<string, FieldValue>) => d.type !== 'WebSite';
const notSpeaker = (d: Record<string, FieldValue>) => d.device_class !== 'Speaker';
const hasSecondPath = (d: Record<string, FieldValue>) => isSet(d.second_path);
const encodes = (d: Record<string, FieldValue>) => Number(d.video_writer) === 1;
const janusOn = (d: Record<string, FieldValue>) => Number(d.janus_enabled) === 1;

export function buildClassicTabs(t: Translate): TabDef[] {
  const ENABLED_DISABLED = [
    { value: 1, label: t('Enabled') },
    { value: 0, label: t('Disabled') },
  ];
  const STREAMING: FieldVisibility = { types: ['Ffmpeg', 'Libvlc'] };
  const SECONDS = t('seconds');
  const FRAMES = t('frames');

  const V4L2_FORMATS: Array<[number, string]> = [
    [0x000000ff, 'PAL'], [0x0000b000, 'NTSC'], [0x00000001, 'PAL B'], [0x00000002, 'PAL B1'], [0x00000004, 'PAL G'],
    [0x00000008, 'PAL H'], [0x00000010, 'PAL I'], [0x00000020, 'PAL D'], [0x00000040, 'PAL D1'], [0x00000080, 'PAL K'],
    [0x00000100, 'PAL M'], [0x00000200, 'PAL N'], [0x00000400, 'PAL Nc'], [0x00000800, 'PAL 60'], [0x00001000, 'NTSC M'],
    [0x00002000, 'NTSC M JP'], [0x00004000, 'NTSC 443'], [0x00008000, 'NTSC M KR'], [0x00010000, 'SECAM B'],
    [0x00020000, 'SECAM D'], [0x00040000, 'SECAM G'], [0x00080000, 'SECAM H'], [0x00100000, 'SECAM K'],
    [0x00200000, 'SECAM K1'], [0x00400000, 'SECAM L'], [0x00800000, 'SECAM LC'], [0x01000000, 'ATSC 8 VSB'],
    [0x02000000, 'ATSC 16 VSB'],
  ];
  const V4L2_PALETTES: Array<[number, string]> = [
    [0, t('Auto')], [fourcc('GREY'), t('Grey')], [fourcc('BGR4'), 'BGR32'], [fourcc('RGB4'), 'RGB32'],
    [fourcc('BGR3'), 'BGR24'], [fourcc('RGB3'), 'RGB24'], [fourcc('YUYV'), '*YUYV'], [fourcc('JPEG'), '*JPEG'],
    [fourcc('MJPG'), '*MJPEG'], [fourcc('RGB1'), 'RGB332'], [fourcc('R444'), '*RGB444'], [fourcc('RGBO'), '*RGB555'],
    [fourcc('RGBP'), '*RGB565'], [fourcc('UYVY'), '*UYVY'], [fourcc('422P'), '*YUV422P'], [fourcc('411P'), '*YUV411P'],
    [fourcc('Y444'), '*YUV444'], [fourcc('NV12'), 'NV12'], [fourcc('YUV9'), '*YUV410'], [fourcc('YU12'), '*YUV420'],
  ];

  const DEINTERLACE = [
    { value: 0x00000000, label: t('Disabled') },
    { value: 0x00001E04, label: t('Four field motion adaptive - Soft') },
    { value: 0x00001404, label: t('Four field motion adaptive - Medium') },
    { value: 0x00000A04, label: t('Four field motion adaptive - Hard') },
    { value: 0x00000001, label: t('Discard') },
    { value: 0x00000002, label: t('Linear') },
    { value: 0x00000003, label: t('Blend') },
    { value: 0x00000205, label: t('Blend (25%)') },
  ];
  const DEINTERLACE_V4L2 = [
    ...DEINTERLACE,
    { value: 0x02000000, label: 'V4L2: Capture top field only' },
    { value: 0x03000000, label: 'V4L2: Capture bottom field only' },
    { value: 0x07000000, label: 'V4L2: Alternate fields (Bob)' },
    { value: 0x01000000, label: 'V4L2: Progressive' },
    { value: 0x04000000, label: 'V4L2: Interlaced' },
  ];

  /** `$fastblendopts` / `$fastblendopts_alarm` — the box has ZM_FAST_IMAGE_BLENDS on. */
  const BLEND = [
    { value: 0, label: t('No blending') }, { value: 1, label: '1.5625%' }, { value: 3, label: '3.125%' },
    { value: 6, label: t('6.25% (Indoor)') }, { value: 12, label: t('12.5% (Outdoor)') },
    { value: 25, label: '25%' }, { value: 50, label: '50%' },
  ];
  const ALARM_BLEND = [
    { value: 0, label: t('No blending (Alarm lasts forever)') }, { value: 1, label: '1.5625%' },
    { value: 3, label: '3.125%' }, { value: 6, label: '6.25%' }, { value: 12, label: '12.5%' },
    { value: 25, label: '25%' }, { value: 50, label: t('50% (Alarm lasts a moment)') },
  ];

  const SYSTEM_EDIT = { feature: 'system', level: 'Edit', reason: t('Requires System edit permission') } as const;
  const CAUTION = t('CAUTION: See the help text');

  const sectionWarn: FieldDef = { kind: 'checkbox', key: 'section_length_warn', label: t('Warn if exceeded') };

  return [
    {
      id: 'general',
      label: t('General'),
      fields: [
        { kind: 'undelete', key: 'deleted', label: t('Monitor is Deleted, Undelete?'),
          visibleIf: (_d, stored) => isSet(stored.deleted) },
        { kind: 'text', key: 'name', label: t('Name'), required: true },
        { kind: 'textarea', key: 'notes', label: t('Notes') },
        { kind: 'select', key: 'device_class', label: t('Device Class'),
          options: [{ value: 'Camera', label: t('Camera') }, { value: 'Speaker', label: t('Speaker') }] },
        { kind: 'manufacturer-select', key: 'manufacturer_id', label: t('Manufacturer') },
        { kind: 'model-select', key: 'model_id', label: t('Model') },
        { kind: 'server-select', key: 'server_id', label: t('Server') },
        { kind: 'select', key: 'type', label: t('Source Type'),
          options: [
            { value: 'Local', label: t('Local') }, { value: 'Remote', label: t('Remote') },
            { value: 'File', label: t('File') }, { value: 'Ffmpeg', label: t('Ffmpeg') },
            { value: 'WebSite', label: t('Web Site') }, { value: 'VNC', label: t('VNC') },
          ],
          storedOnlyOptions: [
            { value: 'Libvlc', label: t('Libvlc (removed)') },
            { value: 'cURL', label: t('cURL (removed)') },
          ] },
        { kind: 'groups', key: '_groups', label: t('Groups'), virtual: true },
        { kind: 'triggers', key: '_triggers', label: t('Triggers'), virtual: true },
      ],
    },
    {
      id: 'source',
      label: t('Source'),
      fields: [
        { kind: 'select', key: 'capturing', label: t('Capturing'), helpLink: true,
          help: t('None: no capture process. On Demand: the process waits for a viewer (live view, thumbnail or RTSP server client) before connecting to the camera. Always: it connects at once and stays connected.'),
          options: [
            { value: 'None', label: t('None') }, { value: 'Ondemand', label: t('On Demand') },
            { value: 'Always', label: t('Always') },
          ] },

        // Local (V4L2)
        { kind: 'text', key: 'device', label: t('Device Path'), show: { types: ['Local'] },
          pattern: /^(|\/dev\/[\w/.-]+)$/, patternHelp: t('Device must be set to a valid value') + ' (e.g. /dev/video0)' },
        { kind: 'select', key: 'channel', label: t('Device Channel'), show: { types: ['Local'] },
          options: Array.from({ length: 32 }, (_, i) => ({ value: i, label: String(i) })) },
        { kind: 'select', key: 'format', label: t('Device Format'), show: { types: ['Local'] },
          options: V4L2_FORMATS.map(([value, label]) => ({ value, label })) },
        { kind: 'select', key: 'palette', label: t('Capture Palette'), show: { types: ['Local'] },
          options: V4L2_PALETTES.map(([value, label]) => ({ value, label })) },
        { kind: 'radio', key: 'v4l_multi_buffer', label: t('Multi Buffering'), show: { types: ['Local'] },
          options: [{ value: 1, label: t('Yes') }, { value: 0, label: t('No') }], nullOption: t('Use Config Value') },
        { kind: 'number', key: 'v4l_captures_per_frame', label: t('Captures Per Frame'), show: { types: ['Local'] },
          min: 1, integer: true },

        // VNC
        { kind: 'text', key: 'host', label: t('Host Name'), show: { types: ['VNC'] } },
        { kind: 'text', key: 'port', label: t('Port'), show: { types: ['VNC'] },
          pattern: /^(|\d{1,5})$/, patternHelp: t('Source -> Port must be set to a valid number') },
        { kind: 'text', key: 'user', label: t('Username'), show: { types: ['VNC'] } },
        { kind: 'password', key: 'pass', label: t('Password'), show: { types: ['VNC'] } },

        // Remote
        { kind: 'text', key: 'user', label: t('Username'), show: { types: ['Remote'] } },
        { kind: 'password', key: 'pass', label: t('Password'), show: { types: ['Remote'] } },
        { kind: 'select', key: 'protocol', label: t('Protocol'), show: { types: ['Remote'] },
          options: [{ value: 'http', label: 'HTTP' }],
          storedOnlyOptions: [{ value: 'rtsp', label: 'RTSP (' + t('removed') + ')' }],
          storedOnlyWarning: t('ZoneMinder’s own RTSP support has been removed in favour of Ffmpeg. This monitor will not capture until you change it to Type Ffmpeg, putting the full rtsp:// URL in Source Path. The capture log names the exact URL to use.') },
        { kind: 'select', key: 'method', label: t('Method'), show: { types: ['Remote'], protocols: ['http', ''] },
          options: [{ value: 'simple', label: 'Simple' }, { value: 'regexp', label: 'Regexp' }] },
        { kind: 'select', key: 'method', label: t('Method'), show: { types: ['Remote'], protocols: ['rtsp'] },
          options: [
            { value: 'rtpUni', label: 'RTP/Unicast' }, { value: 'rtpMulti', label: 'RTP/Multicast' },
            { value: 'rtpRtsp', label: 'RTP/RTSP' }, { value: 'rtpRtspHttp', label: 'RTP/RTSP/HTTP' },
          ] },
        { kind: 'text', key: 'host', label: t('Host Name'), show: { types: ['Remote'] } },
        { kind: 'text', key: 'port', label: t('Port'), show: { types: ['Remote'] },
          pattern: /^(|\d{1,5})$/, patternHelp: t('Source -> Port must be set to a valid number') },
        { kind: 'text', key: 'path', label: t('Path'), show: { types: ['Remote'] } },

        // File
        { kind: 'text', key: 'path', label: t('Source Path'), show: { types: ['File'] } },

        // Web Site
        { kind: 'text', key: 'path', label: t('Website URL'), show: { types: ['WebSite'] } },
        { kind: 'number', key: 'width', label: t('Width') + ' (' + t('pixels') + ')', show: { types: ['WebSite'] },
          min: 1, integer: true },
        { kind: 'number', key: 'height', label: t('Height') + ' (' + t('pixels') + ')', show: { types: ['WebSite'] },
          min: 1, integer: true },
        { kind: 'number', key: 'refresh', label: t('Web Site Refresh (Optional)'), show: { types: ['WebSite'] },
          min: 1, integer: true },

        // Ffmpeg (Libvlc kept for monitors still stored with it)
        { kind: 'text', key: 'path', label: t('Source Path'), show: STREAMING },
        { kind: 'text', key: 'user', label: t('Username'), show: STREAMING },
        { kind: 'password', key: 'pass', label: t('Password'), show: STREAMING },
        { kind: 'select', key: 'method', label: t('Method'), show: STREAMING, helpLink: true,
          help: t('The RTSP transport FFmpeg uses. TCP interleaves within the RTSP control channel. Higher resolution cameras can smear over UDP; if so, try TCP. HTTP tunnelling passes proxies.'),
          options: [
            { value: 'rtpRtsp', label: 'TCP' }, { value: 'rtpUni', label: 'UDP' },
            { value: 'rtpMulti', label: 'UDP Multicast' }, { value: 'rtpRtspHttp', label: 'HTTP Tunnel' },
          ] },
        { kind: 'textarea', key: 'options', label: t('Options'), show: STREAMING, helpLink: true,
          help: t('Passed on to FFmpeg, separated by commas, e.g. allowed_media_types=video or reorder_queue_size=nnn.') },

        { kind: 'select', key: 'decoding', label: t('Decoding'), helpLink: true,
          help: t('Always decodes every frame. On Demand decodes only while someone is watching. KeyFrames Only decodes keyframes, so the viewing frame rate is low. Not decoding saves a lot of CPU when there is no motion detection and recording is passthrough without JPEGs.'),
          options: [
            { value: 'None', label: t('None') }, { value: 'Ondemand', label: t('On Demand') },
            { value: 'KeyFrames', label: t('KeyFrames Only') }, { value: 'KeyFrames+Ondemand', label: t('Keyframes + Ondemand') },
            { value: 'Always', label: t('Always') },
          ] },

        { kind: 'text', key: 'second_path', label: t('Source Second Path'), show: STREAMING },
        { kind: 'select', key: 'decoder', label: t('Decoder'), show: STREAMING,
          options: [{ value: 'auto', label: t('Auto') }, ...DECODERS.map(([value, label]) => ({ value, label }))] },
        { kind: 'text', key: 'decoder_hw_accel_name', label: t('Decoder HW Accel Name'), show: STREAMING, helpLink: true,
          help: t('The ffmpeg -hwaccel option: vaapi for Intel graphics, cuda for NVIDIA. Run ffmpeg -hwaccels to see what is supported.') },
        { kind: 'text', key: 'decoder_hw_accel_device', label: t('Decoder HW Accel Device'), show: STREAMING, helpLink: true,
          help: t('The ffmpeg -hwaccel_device option. Only needed with several GPUs; Intel VAAPI is typically /dev/dri/renderD128.') },

        { kind: 'select', key: 'colours', label: t('Target colorspace'), show: { notTypes: ['WebSite'] },
          note: '(' + t('Deprecated - will be auto-detected in a future release') + ')',
          options: [
            { value: 1, label: t('8 bit greyscale') }, { value: 3, label: t('24 bit colour') },
            { value: 4, label: t('32 bit colour') },
          ] },
        { kind: 'resolution', key: 'width', label: t('Capture Resolution') + ' (' + t('pixels') + ')',
          show: { notTypes: ['WebSite'] } },
        { kind: 'select', key: 'orientation', label: t('Orientation'), show: { notTypes: ['WebSite'] },
          options: [
            { value: 'ROTATE_0', label: t('Normal') }, { value: 'ROTATE_90', label: t('Rotate Right') },
            { value: 'ROTATE_180', label: t('Inverted') }, { value: 'ROTATE_270', label: t('Rotate Left') },
            { value: 'FLIP_HORI', label: t('Flipped Horizontally') }, { value: 'FLIP_VERT', label: t('Flipped Vertically') },
          ] },
        { kind: 'select', key: 'deinterlacing', label: t('Deinterlacing'), show: { types: ['Local'] }, options: DEINTERLACE_V4L2 },
        { kind: 'select', key: 'deinterlacing', label: t('Deinterlacing'), show: { notTypes: ['Local', 'WebSite'] },
          options: DEINTERLACE },
        { kind: 'number', key: 'max_fps', label: t('Maximum FPS'), min: 0, helpLink: true,
          help: t('For streaming IP cameras, set the frame rate in the camera instead. Limiting it here delays live video, skips frames irregularly and misses events.'),
          cautionWhenSet: CAUTION },
        { kind: 'number', key: 'alarm_max_fps', label: t('Alarm Maximum FPS'), min: 0, helpLink: true,
          help: t('Overrides Maximum FPS while in alarm, with the same limitations. Blank means no limit.'),
          cautionWhenSet: CAUTION },
      ],
    },
    {
      id: 'analysis',
      label: t('Analysis'),
      visibleIf: notWebSite,
      fields: [
        { kind: 'group', key: '_motion', label: t('Motion detection') },
        { kind: 'select', key: 'analysing', label: t('Motion Detection'),
          options: [{ value: 'None', label: t('None') }, { value: 'Always', label: t('Always') }] },
        { kind: 'select', key: 'analysis_source', label: t('Analysis Source'), visibleIf: hasSecondPath,
          options: [{ value: 'Primary', label: t('Primary') }, { value: 'Secondary', label: t('Secondary') }] },
        { kind: 'select', key: 'analysis_image', label: t('Analysis Image'), visibleIf: notSpeaker,
          options: [{ value: 'FullColour', label: t('Full Colour') }, { value: 'YChannel', label: t('Y-Channel (Greyscale)') }] },
        { kind: 'number', key: 'analysis_fps_limit', label: t('Analysis FPS'), min: 0 },
        { kind: 'select', key: 'ref_blend_perc', label: t('Reference Image Blend %ge'), visibleIf: notSpeaker, options: BLEND },
        { kind: 'select', key: 'alarm_ref_blend_perc', label: t('Alarm Reference Image Blend %ge'), visibleIf: notSpeaker,
          options: ALARM_BLEND },
        { kind: 'group', key: '_audio', label: t('Audio detection') },
        { kind: 'checkbox', key: 'audio_detection', label: t('Audio Detection'), show: { types: ['Ffmpeg'] },
          help: t('Score the monitor on how loud its audio is, alongside motion.') },
        { kind: 'number', key: 'audio_threshold', label: t('Audio Threshold'), min: 0, max: 100, integer: true,
          help: t('Level, 0-100, at or above which the monitor alarms. 0 turns audio detection off. Measure the device’s quiet level first and set this above it.') },
        { kind: 'number', key: 'audio_alarm_score', label: t('Audio Alarm Score'), min: 0, max: 255, integer: true,
          help: t('Score contributed to a frame while the audio level is over the threshold.') },
        { kind: 'group', key: '_other', label: t('Other') },
        { kind: 'linked-monitors', key: 'linked_monitors', label: t('Linked Monitors'), helpLink: true,
          help: t('Other monitors that act as triggers for this one: while one of them detects motion, this monitor records too. Avoid circular links, which make alarms that never end.') },
        { kind: 'radio', key: 'use_amcrest_api', label: t('Use Amcrest API'), options: ENABLED_DISABLED },
      ],
    },
    {
      id: 'recording',
      label: t('Recording'),
      visibleIf: notWebSite,
      fields: [
        { kind: 'select', key: 'recording', label: t('Recording'),
          options: [
            { value: 'None', label: t('None') }, { value: 'OnMotion', label: t('On Motion / Trigger / etc') },
            { value: 'Always', label: t('Always') },
          ] },
        { kind: 'select', key: 'recording_source', label: t('Recording Source'), visibleIf: hasSecondPath,
          options: [
            { value: 'Primary', label: t('Primary') }, { value: 'Secondary', label: t('Secondary') },
            { value: 'Both', label: t('Both') },
          ] },
        { kind: 'storage-select', key: 'storage_id', label: t('Storage Area'), zeroOption: t('Unspecified') },
        { kind: 'select', key: 'save_jpe_gs', label: t('Save JPEGs'),
          options: [
            { value: 0, label: t('Disabled') }, { value: 1, label: t('Frames only') },
            { value: 2, label: t('Analysis images only (if available)') },
            { value: 3, label: t('Frames + Analysis images (if available)') },
          ] },
        { kind: 'select', key: 'video_writer', label: t('Video Writer'),
          options: [
            { value: 0, label: t('Disabled') }, { value: 1, label: t('Encode') },
            { value: 2, label: t('Camera Passthrough') },
          ],
          // Passthrough copies the camera's stream, which only FFmpeg captures have.
          disabledOption: (v, d) => Number(v) === 2 && d.type !== 'Ffmpeg' },
        { kind: 'select', key: 'output_codec', label: t('Output Codec'), visibleIf: encodes,
          options: [
            { value: 0, label: t('Auto') }, { value: 27, label: 'h264' }, { value: 173, label: 'h265/hevc' },
            { value: 167, label: 'vp9' }, { value: 226, label: 'av1' },
          ] },
        { kind: 'select', key: 'encoder', label: t('Encoder'), visibleIf: encodes,
          options: [{ value: 'auto', label: t('Auto') }, ...ENCODERS.map((e) => ({ value: e, label: e }))],
          disabledOption: (v, d) => !encoderFitsCodec(v, d.output_codec) },
        { kind: 'textarea', key: 'encoder_parameters', label: t('Optional Encoder Parameters'), helpLink: true,
          help: t('Passed to the encoder as name=value, separated by commas or newlines. For quality use crf: 1 is best, 51 worst, 23 the default.') },
        { kind: 'select', key: 'output_container', label: t('Output Container'),
          options: [
            { value: 'auto', label: t('Auto') }, { value: 'mp4', label: 'mp4' },
            { value: 'mkv', label: 'mkv' }, { value: 'webm', label: 'webm' },
          ] },
        { kind: 'checkbox', key: 'record_audio', label: t('Record Audio'), show: { types: ['Ffmpeg'] } },
        { kind: 'text', key: 'event_start_command', label: t('Event Start Command'), requires: SYSTEM_EDIT },
        { kind: 'text', key: 'event_end_command', label: t('Event End Command'), requires: SYSTEM_EDIT },
      ],
    },
    {
      id: 'viewing',
      label: t('Viewing'),
      visibleIf: notWebSite,
      fields: [
        { kind: 'checkbox', key: 'rtsp_server', label: t('RTSPServer'), helpLink: true,
          help: t('Re-stream this monitor from ZoneMinder’s own RTSP server, so clients do not each pull from the camera. Ports start at Options > Network > MIN_RTSP_PORT.') },
        { kind: 'text', key: 'rtsp_stream_name', label: t('RTSP Stream Name'), helpLink: true,
          help: t('The endpoint the RTSP server publishes this monitor at: monitor 6 with MIN_RTSP_PORT 20000 and the name my_camera is rtsp://ZM_HOST:20006/my_camera.') },
        { kind: 'checkbox', key: 'rtsp2_web_enabled', label: t('RTSP2Web Live Stream'),
          help: t('Attempt to use RTSP2Web streaming server for h264/h265 live view. Experimental, but allows for significantly better performance.') },
        { kind: 'checkbox', key: 'janus_enabled', label: t('Janus Live Stream'),
          help: t('Attempt to use Janus streaming server for h264/h265 live view. Experimental, but allows for significantly better performance.') },
        { kind: 'checkbox', key: 'janus_audio_enabled', label: t('Janus Live Stream Audio'), visibleIf: janusOn,
          help: t('Attempt to enable audio in the Janus stream. Has no effect for cameras without audio support, but can prevent a stream playing if your camera sends an audio format unsupported by the browser.') },
        { kind: 'text', key: 'janus_profile_override', label: t('Janus Profile-ID Override'), visibleIf: janusOn,
          help: t('Manually set a Profile-ID, which can force a browser to try to play a given stream. Try "42e01f" for a universally supported value, or leave this blank to use the Profile-ID specified by the source.') },
        { kind: 'number', key: 'janus_rtsp_session_timeout', label: t('Janus RTSP Session Timeout Override'), visibleIf: janusOn,
          integer: true,
          help: t('Override or set a timeout period in seconds for the RTSP session. Useful if you see a lot of 401 Unauthorized responses in janus logs. Set to 0 to use the timeout (if sent) from the source.') },
        { kind: 'checkbox', key: 'restream', label: t('Use RTSP Restream'),
          help: t('Enable this to use the ZoneMinder RTSP restream as the source for streaming services (Janus, Go2RTC, RTSP2Web) instead of the camera directly.') },
        { kind: 'user-select', key: 'rtsp_user', label: t('User for RTSP Server Auth'),
          visibleIf: (d) => Number(d.restream) === 1 },
        { kind: 'select', key: 'default_rate', label: t('Default Rate'),
          options: [
            { value: 0, label: t('Stop') }, { value: 25, label: '1/4x' }, { value: 50, label: '1/2x' },
            { value: 100, label: '1x' }, { value: 200, label: '2x' }, { value: 500, label: '5x' },
            { value: 1000, label: '10x' }, { value: 1600, label: '16x' },
          ] },
        { kind: 'select', key: 'default_scale', label: t('Default Scale'),
          options: [
            { value: '0', label: t('Auto') }, { value: '100', label: t('Actual') },
            { value: 'fit_to_width', label: t('Fit to width') }, { value: '480px', label: t('Max 480px') },
            { value: '640px', label: t('Max 640px') }, { value: '800px', label: t('Max 800px') },
            { value: '1024px', label: t('Max 1024px') }, { value: '1280px', label: t('Max 1280px') },
            { value: '1600px', label: t('Max 1600px') },
          ] },
        { kind: 'select', key: 'default_codec', label: t('Default Method For Event View'),
          options: [
            { value: 'auto', label: t('Auto') }, { value: 'MP4', label: t('MP4') }, { value: 'MJPEG', label: t('MJPEG') },
          ] },
      ],
    },
    {
      id: 'onvif',
      label: t('ONVIF'),
      visibleIf: notWebSite,
      fields: [
        { kind: 'text', key: 'onvif_url', label: t('ONVIF URL') },
        { kind: 'text', key: 'onvif_events_path', label: t('ONVIF Events Path') },
        { kind: 'text', key: 'onvif_username', label: t('Username') },
        { kind: 'password', key: 'onvif_password', label: t('Password') },
        { kind: 'text', key: 'onvif_options', label: t('ONVIF Options') },
        { kind: 'text', key: 'onvif_alarm_text', label: t('ONVIF Alarm Text'), helpLink: true,
          help: t('Only ONVIF events whose text contains this string raise an alarm. Blank = any event.') },
        { kind: 'checkbox', key: 'soap_wsa_compl', label: t('SOAP WSA Compliance'), helpLink: true,
          help: t('Some cameras need WS-Addressing headers on every SOAP call.') },
        { kind: 'radio', key: 'onvif_event_listener', label: t('ONVIF Event Listener'), options: ENABLED_DISABLED },
      ],
    },
    {
      id: 'timestamp',
      label: t('Timestamp'),
      visibleIf: (d) => notWebSite(d) && notSpeaker(d),
      fields: [
        { kind: 'text', key: 'label_format', label: t('Timestamp Label Format'),
          placeholder: t('Python strftime format. %f for hundredths, %N for Monitor Name, %Q for show text.') },
        { kind: 'number', key: 'label_x', label: t('Timestamp Label X'), min: 0, integer: true },
        { kind: 'number', key: 'label_y', label: t('Timestamp Label Y'), min: 0, integer: true },
        { kind: 'select', key: 'label_size', label: t('Font Size'),
          options: [
            { value: 1, label: t('Small') }, { value: 2, label: t('Default') },
            { value: 3, label: t('Large') }, { value: 4, label: t('Extra Large') },
          ] },
      ],
    },
    {
      id: 'buffers',
      label: t('Buffers'),
      visibleIf: notWebSite,
      fields: [
        { kind: 'number', key: 'image_buffer_count', label: t('Image Buffer Size (frames)'), min: 1, integer: true,
          helpLink: true, help: t('Raw images kept in /dev/shm for live viewing. 3-5 is the usual range.') },
        { kind: 'number', key: 'max_image_buffer_count', label: t('Maximum Image Buffer Size (frames)'), min: 0, integer: true,
          helpLink: true, help: t('The most video packets held in the packet queue. A limit saves RAM, but events lose frames when the camera’s keyframe interval is longer than it. 0 = no limit.') },
        { kind: 'number', key: 'warmup_count', label: t('Warmup Frames'), min: 0, integer: true },
        { kind: 'number', key: 'pre_event_count', label: t('Pre Event Image Count'), min: 0, integer: true },
        { kind: 'number', key: 'post_event_count', label: t('Post Event Image Count'), min: 0, integer: true },
        { kind: 'number', key: 'stream_replay_buffer', label: t('Stream Replay Image Buffer'), min: 0, integer: true },
        { kind: 'number', key: 'alarm_frame_count', label: t('Alarm Frame Count'), min: 1, integer: true },
        { kind: 'ram-estimate', key: '_ram', label: t('Estimated Ram Use'), virtual: true },
      ],
    },
    {
      id: 'control',
      label: t('Control'),
      visibleIf: (d, can) => notWebSite(d) && can('control', 'View'),
      fields: [
        { kind: 'checkbox', key: 'controllable', label: t('Controllable') },
        { kind: 'control-select', key: 'control_id', label: t('Control Type'),
          link: { to: '/settings/ptz-controls', label: t('List') } },
        { kind: 'text', key: 'control_device', label: t('Control Device') },
        { kind: 'text', key: 'control_address', label: t('Control Address'), placeholder: 'user:pass@ip' },
        { kind: 'checkbox', key: 'modect_during_ptz', label: t('Do motion detection during PTZ motion') },
        { kind: 'number', key: 'auto_stop_timeout', label: t('Auto Stop Timeout'), min: 0 },
        { kind: 'checkbox', key: 'track_motion', label: t('Track Motion') },
        { kind: 'number', key: 'track_delay', label: t('Track Delay'), min: 0, integer: true },
        { kind: 'return-location-select', key: 'return_location', label: t('Return Location') },
        { kind: 'number', key: 'return_delay', label: t('Return Delay'), min: 0, integer: true },
      ],
    },
    {
      id: 'misc',
      label: t('Misc'),
      visibleIf: notWebSite,
      fields: [
        { kind: 'text', key: 'event_prefix', label: t('Event Prefix') },
        { kind: 'number', key: 'section_length', label: t('Section length'), min: 0, integer: true,
          suffix: SECONDS, companion: sectionWarn },
        { kind: 'number', key: 'min_section_length', label: t('Minimum section length'), min: 0, integer: true, suffix: SECONDS },
        { kind: 'radio', key: 'event_close_mode', label: t('Event Close Mode'),
          note: t('When continuous events are closed.'),
          options: [
            { value: 'system', label: t('System') }, { value: 'time', label: t('Time') },
            { value: 'duration', label: t('Duration') }, { value: 'idle', label: t('Idle') },
            { value: 'alarm', label: t('Alarm') },
          ] },
        { kind: 'number', key: 'motion_frame_skip', label: t('Motion Frame Skip'), min: 0, integer: true, suffix: FRAMES },
        { kind: 'number', key: 'analysis_update_delay', label: t('Analysis Update Delay'), min: 0, integer: true, suffix: SECONDS },
        { kind: 'number', key: 'fps_report_interval', label: t('FPS Report Interval'), min: 0, integer: true, suffix: FRAMES },
        { kind: 'number', key: 'signal_check_points', label: t('Signal Check Points'), min: 0, integer: true },
        { kind: 'color', key: 'signal_check_colour', label: t('Signal Check Colour') },
        { kind: 'color', key: 'web_colour', label: t('Web Colour') },
        { kind: 'checkbox', key: 'exif', label: t('Embed EXIF data into image'), helpLink: true,
          help: t('Embed EXIF data into each JPEG frame.') },
        { kind: 'select', key: 'importance', label: t('Importance'),
          options: [
            { value: 'Normal', label: t('Normal') }, { value: 'Less', label: t('Less important') },
            { value: 'Not', label: t('Not important') },
          ] },
        { kind: 'number', key: 'startup_delay', label: t('Startup Delay'), min: 0, integer: true, suffix: SECONDS },
      ],
    },
    {
      id: 'zones',
      label: t('Zones'),
      visibleIf: (d) => notWebSite(d) && notSpeaker(d),
      navigatesTo: 'zones',
      fields: [],
    },
    {
      id: 'mqtt',
      label: t('MQTT'),
      visibleIf: notWebSite,
      fields: [
        { kind: 'radio', key: 'mqtt_enabled', label: t('MQTT Enabled'), options: ENABLED_DISABLED },
        { kind: 'text', key: 'mqtt_subscriptions', label: t('MQTT Subscriptions') },
      ],
    },
  ];
}

/** Classic catalogue in the active language. */
export { encoderFitsCodec };

export function useClassicMonitorTabs(): TabDef[] {
  const { t } = useTranslation();
  return useMemo(() => buildClassicTabs((key) => t(key)), [t]);
}

/** English snapshot for structure lookups and the contract test. */
export const CLASSIC_TABS: TabDef[] = buildClassicTabs((key) => key);

/** Legacy `human_filesize` (`skin.js`): steps up while the next unit is above 0.9, two decimals. */
export function humanFilesize(size: number, precision = 2): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
  let n = size;
  let i = 0;
  while (n / 1024 > 0.9 && i < units.length - 1) { n /= 1024; i++; }
  const factor = 10 ** precision;
  return `${Math.round(n * factor) / factor}${units[i]}`;
}

/**
 * Legacy `update_estimated_ram_use` (`monitor.js:762`): the shared-memory
 * ring is (ImageBufferCount + PreEventCount) frames of Width × Height ×
 * Colours bytes; the packet queue can add MaxImageBufferCount more, or
 * grow without limit when that is 0.
 */
export function estimatedRamUse(draft: Record<string, FieldValue>): { min: string; max: string | null } | null {
  const w = Number(draft.width);
  const h = Number(draft.height);
  const c = Number(draft.colours);
  if (!(w > 0 && h > 0 && c > 0)) return null;
  const minCount = (Number(draft.image_buffer_count) || 0) + (Number(draft.pre_event_count) || 0);
  const frame = w * h * c;
  const maxCount = Number(draft.max_image_buffer_count) || 0;
  return {
    min: humanFilesize(minCount * frame),
    max: maxCount ? humanFilesize((minCount + maxCount) * frame) : null,
  };
}

