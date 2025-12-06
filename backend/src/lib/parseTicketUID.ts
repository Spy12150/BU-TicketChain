export function parseTicketUID(uid: string) {
  if (!uid || !uid.startsWith("TKT-")) return null;

  const parts = uid.split("-");
  if (parts.length !== 3) return null;

  const eventId = parseInt(parts[1], 10);
  const ticketSerial = parseInt(parts[2], 10);

  if (isNaN(eventId) || isNaN(ticketSerial)) return null;

  return { eventId, ticketSerial };
}