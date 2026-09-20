/** A run of plain text, or an `event NNN` reference legacy turns into a link. */
export interface LogMessagePart {
  text: string;
  eventId?: number;
}

/**
 * Legacy `views/js/log.js:125` rewrites every `event NNN` in a log message
 * into a link to that event before the table renders it:
 *
 *     .replace(/event (\d+)/g, '<a href="?view=event&eid=$1">event $1</a>')
 *
 * Same pattern, same casing, same greediness — the point is that "Closing
 * event 1234" is one click from the event, which is most of what the log is
 * for. Text is returned as parts rather than HTML because nothing here goes
 * near `dangerouslySetInnerHTML`.
 */
export function splitEventRefs(message: string): LogMessagePart[] {
  const parts: LogMessagePart[] = [];
  const re = /event (\d+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(message)) !== null) {
    if (match.index > last) parts.push({ text: message.slice(last, match.index) });
    parts.push({ text: match[0], eventId: Number(match[1]) });
    last = match.index + match[0].length;
  }
  if (last < message.length) parts.push({ text: message.slice(last) });
  return parts;
}
