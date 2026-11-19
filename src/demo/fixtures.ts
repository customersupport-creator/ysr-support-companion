import { INTRO_TEXT } from "../core/clicksend";
import { SUPPORT_LINE_E164 } from "../shared/constants";
import type { Booking, ConsentWarning, FacilityRecord, SmsMessage } from "../shared/types";

export const DEMO_PHONES = {
  taken: "+16479895702",
  towed: "+13125550144",
  refund: "+17735550120",
  thanks: "+13125550177",
  reactionDone: "+13125550188",
  gate: "+16475550110",
  consent: "+14165550199",
  spothero: "+13125550166",
  extension: "+17735550999",
  answered: "+13125550001",
  followUp: "+13125550222",
  endorse: "+13125550223",
  refundOld: "+17735550111",
  refundSent: "+17735550112",
  alertA: "+13125550301",
  alertB: "+13125550302",
  clicksendOpen: "+13125550181",
  clicksendIntro: "+13125550182",
  clicksendStop: "+13125550183",
} as const;

export const DEMO_CONSENT: ConsentWarning[] = [
  {
    phone: DEMO_PHONES.consent,
    reason: "Consent warning on file. Do not text this number.",
  },
  {
    phone: DEMO_PHONES.clicksendStop,
    reason: "Opted out — do not text",
  },
];

export const DEMO_FACILITIES: FacilityRecord[] = [
  {
    id: "recRAY17",
    name: "17 Raymond St. - Spot #4 or 5 Only",
    address: "17 Raymond St, Chicago, IL",
    facilityId: "RAY-17",
    status: "IN OPERATION",
    notes:
      "Gate Code: (2 4 6 8)\nTo ENTER the lot, enter the code, then press the LEFT ARROW button. Size limit: standard cars only. Directions: https://yourspotrented.com/d/ray17",
    gps: "41.8901, -87.6305",
    stallCount: 2,
    stallsByPlatform: "SpotHero 2",
    towingCompany: "City Tow",
    salesTowAuthorization: "Required",
    landlord: "Raymond Holdings",
    doNotTowPlates: "ABC123",
    doNotTowVehicles: "",
    contactPerson: "Front desk",
    phone: "(312) 555-0170",
    email: "ray17@example.com",
  },
  {
    id: "recWABASH",
    name: "500 Wabash Lot",
    address: "500 Wabash Ave, Chicago, IL",
    facilityId: "WAB-500",
    status: "IN OPERATION",
    notes: "No gate. Monthly and transient. Size limit not listed.",
    gps: "41.8920, -87.6260",
    stallCount: 6,
    stallsByPlatform: "SpotHero 4, ParkWhiz 2",
    towingCompany: "Lake Tow",
    salesTowAuthorization: "Not required",
    landlord: "Wabash LLC",
    doNotTowPlates: "",
    doNotTowVehicles: "",
    contactPerson: "",
    phone: "",
    email: "",
  },
  {
    id: "recSAMPLE",
    name: "78 Sample St. - Garage",
    address: "78 Sample St, Chicago, IL",
    facilityId: "SMP-78",
    status: "IN OPERATION",
    notes: "",
    gps: "",
    stallCount: 4,
    stallsByPlatform: "SpotHero 4",
    towingCompany: "CODED GARAGE - lookup tool not set up. On call only provide the garage code.",
    salesTowAuthorization: "",
    landlord: "Sample Holdings",
    doNotTowPlates: "",
    doNotTowVehicles: "",
    contactPerson: "",
    phone: "",
    email: "",
  },
  {
    id: "recCLOSED",
    name: "9 Archive Ave. - Gate",
    address: "9 Archive Ave, Chicago, IL",
    facilityId: "ARC-9",
    status: "PERMANENTLY CLOSED",
    notes: "Garage code: 9091",
    gps: "",
    stallCount: 1,
    stallsByPlatform: "",
    towingCompany: "",
    salesTowAuthorization: "",
    landlord: "",
    doNotTowPlates: "",
    doNotTowVehicles: "",
    contactPerson: "",
    phone: "",
    email: "",
  },
];

function monthsAgo(now: Date, months: number): string {
  return new Date(now.getFullYear(), now.getMonth() - months, 6, 15, 0, 0).toISOString();
}

/** Synthetic bookings only. No real customer or facility codes. */
export function buildDemoBookings(now: Date): Booking[] {
  const rows: Booking[] = [
    {
      id: "M500100",
      source: "monthly",
      facilityName: "17 Raymond St. - Spot #4 or 5 Only",
      platform: "SpotHero",
      start: monthsAgo(now, 8),
      end: new Date(now.getFullYear() + 1, now.getMonth(), 1).toISOString(),
      status: "Active",
      plate: "GATE1",
      phone: DEMO_PHONES.gate,
    },
  ];
  for (let index = 0; index < 4; index += 1) {
    rows.push({
      id: `PW700100${index}`,
      source: "transient",
      facilityName: "500 Wabash Lot",
      platform: "Parkwhiz",
      start: monthsAgo(now, 8 - index),
      end: monthsAgo(now, 8 - index),
      status: "Ended",
      plate: "QL77",
      phone: DEMO_PHONES.refund,
    });
  }
  for (let index = 0; index < 16; index += 1) {
    rows.push({
      id: `WY80010${String(index).padStart(2, "0")}`,
      source: "transient",
      facilityName: "500 Wabash Lot",
      platform: index % 2 === 0 ? "Way.com" : "Parkwhiz",
      start: monthsAgo(now, 16 - index),
      end: monthsAgo(now, 16 - index),
      status: "Ended",
      plate: "EXT100",
      phone: DEMO_PHONES.extension,
    });
  }
  return rows;
}

export const DEMO_BOOKINGS: Booking[] = buildDemoBookings(new Date("2026-11-19T18:00:00.000Z"));

function sms(
  id: string,
  phone: string,
  direction: "inbound" | "outbound",
  body: string,
  sentAt: string,
): SmsMessage {
  return {
    id,
    threadId: phone,
    direction,
    body,
    sentAt,
    fromPhone: direction === "inbound" ? phone : SUPPORT_LINE_E164,
    toPhone: direction === "inbound" ? SUPPORT_LINE_E164 : phone,
    source: "demo",
  };
}

function reservation(now: Date, facility: string, rentalId: string, plate: string, name: string): string {
  const start = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const end = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  return [
    "Chatbot reservation",
    `Rental ID: ${rentalId}`,
    `Facility: ${facility}`,
    `Name: ${name}`,
    `Start: ${start}`,
    `End: ${end}`,
    `Plate: ${plate}`,
  ].join("\n");
}

export function buildDemoMessages(now: Date): SmsMessage[] {
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
  const taken = DEMO_PHONES.taken;
  const towed = DEMO_PHONES.towed;
  const refund = DEMO_PHONES.refund;
  const thanks = DEMO_PHONES.thanks;
  const reactionDone = DEMO_PHONES.reactionDone;
  const gate = DEMO_PHONES.gate;
  const consent = DEMO_PHONES.consent;
  const spothero = DEMO_PHONES.spothero;
  const extension = DEMO_PHONES.extension;
  const answered = DEMO_PHONES.answered;
  const followUp = DEMO_PHONES.followUp;
  const endorse = DEMO_PHONES.endorse;
  const checking = sms("fu-out", followUp, "outbound", "Checking on it. I'll update you.", at(20));
  checking.agentName = "Avery";
  const endorsing = sms("en-out", endorse, "outbound", "I will endorse this for a refund.", at(10));
  endorsing.agentName = "Avery";
  const refundSent = sms("refund-sent", DEMO_PHONES.refundSent, "outbound", "Your refund was sent.", at(3 * 24 * 60));
  refundSent.agentName = "Avery";

  return [
    sms("taken-res", taken, "inbound", reservation(now, "17 Raymond St", "136244125", "M4PL8", "Sam"), at(40)),
    sms(
      "taken-now",
      taken,
      "inbound",
      "I'm here at 17 Raymond and someone is in my spot. I can't park. reservation 138424128. The other plate looks like BXTL902.",
      at(8),
    ),
    sms(
      "towed-now",
      towed,
      "inbound",
      "My car was towed from the lot. This is ridiculous. Call me at (312) 555-0144. Gate code 4821. I want a lawyer and my money back.",
      at(11),
    ),
    sms("refund-old", refund, "inbound", "I can't find the entrance. Where do I park?", at(100 * 24 * 60)),
    sms("refund-old-a", refund, "outbound", "Use the alley door.", at(100 * 24 * 60 - 10)),
    sms("refund-res", refund, "inbound", reservation(now, "500 Wabash Lot", "136244125", "QL77", "Priya"), at(50)),
    sms(
      "refund-now",
      refund,
      "inbound",
      "Hi, I need to cancel. I don't need the spot anymore. The reservation already started.",
      at(14),
    ),
    sms("thanks-in", thanks, "inbound", "Thanks, that worked!", at(9)),
    sms("react-q", reactionDone, "inbound", "Will I get towed if I stay in this spot?", at(30)),
    sms(
      "react-a",
      reactionDone,
      "outbound",
      "You won't be towed as long as you park in the correct spot, during your reservation, with the correct plate.",
      at(28),
    ),
    sms("react-tap", reactionDone, "inbound", "Loved “You won't be towed as long as you park in the correct spot.”", at(27)),
    sms("gate-full-1", gate, "inbound", "The lot was full and someone was in my spot at 17 Raymond.", at(40 * 24 * 60)),
    sms("gate-full-a", gate, "outbound", "I moved you to another open spot.", at(40 * 24 * 60 - 20)),
    sms("gate-full-2", gate, "inbound", "Lot full again at 17 Raymond. All spots taken.", at(20 * 24 * 60)),
    sms("gate-full-b", gate, "outbound", "Use spot 5 today.", at(20 * 24 * 60 - 15)),
    sms("gate-res", gate, "inbound", reservation(now, "17 Raymond St", "138420011", "GATE1", "Jon"), at(25)),
    sms("gate-old", gate, "inbound", "The gate code isn't working.", at(20)),
    sms("gate-ask", gate, "outbound", "Which code did you try?", at(18)),
    sms("gate-like", gate, "inbound", "Liked “Which code did you try?”", at(17)),
    sms("gate-now", gate, "inbound", "I tried 1234 and the keypad just beeps. I'm stuck outside and I can't get in.", at(3)),
    sms("consent-now", consent, "inbound", "Can you send me the gate code again?", at(6)),
    sms("sh-now", spothero, "inbound", "Hey is this SpotHero? I called and nobody picked up.", at(22)),
    sms("ext-now", extension, "inbound", "Can I extend 2 more hours? My reservation ends soon.", at(5)),
    sms("ans-q", answered, "inbound", "Where do I park at 17 Raymond?", at(60)),
    sms("ans-a", answered, "outbound", "Spots 4 or 5 only. Directions: https://yourspotrented.com/d/ray17", at(55)),
    sms("ans-thanks", answered, "inbound", "Thanks!", at(54)),
    sms("ans-close", answered, "outbound", "You're welcome! If you need anything else, just let us know. Have a great day!", at(53)),
    sms("fu-in", followUp, "inbound", "Any update on the gate?", at(40)),
    checking,
    sms("en-in", endorse, "inbound", "Can I get a refund for this reservation? Name: Pat", at(30)),
    endorsing,
    sms("refund-old-ask", DEMO_PHONES.refundOld, "inbound", "Please refund $18 to Zelle. Name: Pat", at(50 * 60)),
    sms("refund-sent-ask", DEMO_PHONES.refundSent, "inbound", "I need a refund for rental 136200111.", at(4 * 24 * 60)),
    refundSent,
    sms("alert-a", DEMO_PHONES.alertA, "inbound", "The gate code isn't working at 17 Raymond and I can't get in.", at(50)),
    sms("alert-b", DEMO_PHONES.alertB, "inbound", "Can't get in at 17 Raymond. The keypad won't open.", at(40)),
    clicksend("cs-open", DEMO_PHONES.clicksendOpen, "The gate will not open at 17 Raymond. I can't get in.", at(7)),
    clicksend("cs-thanks", DEMO_PHONES.clicksendIntro, "Thanks!", at(9)),
    {
      ...sms("cs-intro", DEMO_PHONES.clicksendIntro, "outbound", INTRO_TEXT, at(8)),
      source: "ringcentral" as const,
    },
    clicksend("cs-stop", DEMO_PHONES.clicksendStop, "STOP", at(12)),
  ];
}

function clicksend(id: string, phone: string, body: string, sentAt: string): SmsMessage {
  return { ...sms(id, phone, "inbound", body, sentAt), source: "clicksend" };
}

/** A fresh RED inbound used by the Simulate button. Not part of the seeded queue. */
export function simulatedInbound(now: Date): SmsMessage {
  const phone = "+13125550199";
  return sms(
    `sim-${now.getTime()}`,
    phone,
    "inbound",
    "I'm at the gate right now and it won't open. I can't get in.",
    now.toISOString(),
  );
}
