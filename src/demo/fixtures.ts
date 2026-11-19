import { SUPPORT_LINE_E164 } from "../shared/constants";
import type { ConsentWarning, FacilityRecord, SmsMessage } from "../shared/types";

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
} as const;

export const DEMO_CONSENT: ConsentWarning[] = [
  {
    phone: DEMO_PHONES.consent,
    reason: "Consent warning on file. Do not text this number.",
  },
];

export const DEMO_FACILITIES: FacilityRecord[] = [
  {
    id: "recRAY17",
    name: "17 Raymond St. - Spot #4 or 5 Only",
    address: "17 Raymond St, Chicago, IL",
    facilityId: "RAY-17",
    status: "Active",
    notes:
      "Gate code 4821. Size limit: standard cars only, max 72 in wide. Access point: alley behind the building. Directions: https://yourspotrented.com/d/ray17. Spots 4 or 5 only.",
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
    status: "Active",
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
];

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
  ];
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
