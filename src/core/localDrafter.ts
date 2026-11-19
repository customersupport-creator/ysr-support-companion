import { PHOTO_REWARD, SPOTHERO_FAQ, SPOTHERO_PHONE } from "../shared/constants";
import type { CustomerMood, DraftBundle, DraftOption, FacilityFacts, SopRecord } from "../shared/types";
import type { DraftInput, Drafter } from "./draftTypes";
import { collectDisagreementNotes } from "./disagreement";
import { extractFacilityFacts } from "./facilityFacts";
import { matchSops } from "./sopMatch";
import { scrubGeneratedDraft } from "./safety";
import { classifyUrgency } from "./urgency";

function shorten(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 2) return text;
  return sentences.slice(0, 2).join(" ");
}

function withSignature(text: string, signature: string): string {
  const sig = signature.trim();
  if (!sig || text.includes(sig)) return text;
  return `${text}\n${sig}`;
}

function nameOf(input: DraftInput): string {
  return input.reservation?.customerName?.trim() ?? "";
}

function lead(input: DraftInput, sentence: string): string {
  const name = nameOf(input);
  if (!name) return sentence;
  if (sentence.toLowerCase().startsWith(name.toLowerCase())) return sentence;
  return `${name}, ${sentence}`;
}

function directAnswer(latest: string): string | null {
  if (/will i (get |be )?towed|am i going to be towed|gonna get towed/i.test(latest)) {
    return "You won't be towed as long as you park in the correct spot, during your reservation, with the correct plate.";
  }
  if (/is this spothero|are you spothero/i.test(latest)) {
    return "We're Your Spot Rented, the operator of the spot. We list it on SpotHero, like an Airbnb host.";
  }
  if (/is my car back/i.test(latest)) return "I don't have a live location on the car. [CHECK: whether the car is back]";
  if (/can i leave\b/i.test(latest)) return "Yes. You can leave once you're clear of the spot.";
  return null;
}

function ensureDirectAnswer(body: string, latest: string): string {
  const answer = directAnswer(latest);
  if (!answer) return body;
  if (body.toLowerCase().includes(answer.slice(0, 28).toLowerCase())) return body;
  const splitAt = body.indexOf(". ");
  if (splitAt === -1) return `${answer} ${body}`;
  return `${body.slice(0, splitAt + 1)} ${answer} ${body.slice(splitAt + 2)}`;
}

function rentalLine(input: DraftInput): string | null {
  if (input.reservation?.rentalId) return null;
  return "Text me the rental ID if you have it.";
}

function applyStyle(text: string, summary: string): string {
  let next = text;
  if (summary.includes("Prefers shorter replies.")) next = shorten(next);
  if (summary.includes("Adds warmer wording.") && !/^(sorry|i'm sorry|hey|i hear you)/i.test(next)) {
    next = `Hey, ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
  }
  return next;
}

function finish(text: string, input: DraftInput, latest: string, violations: string[]): string {
  let next = text;
  if (!input.edit) {
    next = applyStyle(next, input.correctionSummary);
    next = ensureDirectAnswer(next, latest);
    const ask = rentalLine(input);
    const thanks = /^(thanks|thank you)\b/i.test(latest);
    if (ask && !thanks && !next.toLowerCase().includes("rental id")) next = `${next} ${ask}`;
    next = withSignature(next, input.signature);
  }
  const scrubbed = scrubGeneratedDraft(next);
  violations.push(...scrubbed.violations);
  return scrubbed.text.replace(/[ \t]+\n/g, "\n").trim();
}

function moodOf(text: string): CustomerMood {
  if (/lawyer|attorney|sue|chargeback|scam|furious|pissed|worst|unacceptable|ridiculous|are you a bot|idiot/i.test(text)) {
    return "angry";
  }
  if (/frustrat|annoyed|still waiting|come on/i.test(text)) return "frustrated";
  if (/worried|afraid|scared|unsafe|hurt|injur|towed/i.test(text)) return "worried";
  if (/where|which|how do|confused|don't understand|dont understand|is this|\?/i.test(text)) return "confused";
  return "calm";
}

function codeOrCheck(facts: FacilityFacts): string {
  return facts.gateCode ?? "[CHECK: gate code]";
}

function directionsOrCheck(facts: FacilityFacts): string {
  return facts.directions ?? "[CHECK: directions link]";
}

type Pair = { a: string; b: string; c?: string };

function templates(input: DraftInput, latest: string, facts: FacilityFacts, sop: SopRecord | null): Pair {
  const thread = input.thread.messages.map((m) => m.body).join("\n");
  const n = sop?.number;
  const say = (sentence: string) => lead(input, sentence);

  if (n === 1) {
    return {
      a: say(
        "sorry we missed you. We're Your Spot Rented, the operator of the spot. We list it on SpotHero, like an Airbnb host. Having trouble finding the spot, or is it taken?",
      ),
      b: say("hey, sorry we missed you! Finding the spot, or is someone in it?"),
      c: "Are you at the lot right now?",
    };
  }
  if (n === 2) {
    return {
      a: say(
        `sorry your spot was taken when you got there. Can you send a wide photo that shows the car and its plate? Photos that lead to a tow earn a ${PHOTO_REWARD} reward. If they can move in the next 5-10 minutes, are you able to wait?`,
      ),
      b: say(
        "ugh, sorry someone is in your spot. I can look for a nearby spot if waiting doesn't work. A wide photo with their plate helps, and there's a $25 reward if it leads to a tow.",
      ),
      c: "Are you at the lot right now, and is the other car still there?",
    };
  }
  if (n === 3) {
    return {
      a: say("sorry the spot is blocked. Can you send a photo? Do you still need parking tonight, or did you already park somewhere else?"),
      b: say("that's on us. Send a photo if you can, and I'll look for a nearby spot. If nothing is open, we'll refund you."),
      c: "Are you still looking for a spot, or have you parked somewhere else?",
    };
  }
  if (n === 4) {
    const access = facts.accessPoint ?? "[CHECK: access point]";
    return {
      a: say(`sorry the spot is hard to find. Directions with photos: ${directionsOrCheck(facts)}. Use this access point: ${access}.`),
      b: say(`still stuck? Send a wide photo of where you are, plus a landmark, and I can jump on a call. Directions: ${directionsOrCheck(facts)}.`),
      c: "What street are you on right now?",
    };
  }
  if (n === 5) {
    return refundTemplates(input, thread, say);
  }
  if (n === 11) {
    return {
      a: say(
        `sorry the gate isn't letting you in. The code on file is ${codeOrCheck(facts)}. Which code did you try? If it still fails, send a short video and I'll get Sales on it.`,
      ),
      b: say(
        `try code ${codeOrCheck(facts)} once more. If the keypad just beeps, don't keep fighting it. I can look for another spot so you're not stuck outside.`,
      ),
      c: "Which code did you enter, and did the keypad beep or stay dark?",
    };
  }
  if (n === 13) {
    return {
      a: say(
        "I'm sorry your car was towed. We're looking into it now, and I can't promise a reimbursement until that review is done. Please send a photo of where you parked and the tow receipt (address, date and time, plate, and the company).",
      ),
      b: say("that's a rotten surprise. I'm sorry. We're checking what happened and we won't guess at a payout. Can you send the tow receipt and a photo of the spot?"),
      c: "Are you somewhere safe right now, and do you have the tow receipt with you?",
    };
  }
  if (n === 15) {
    const ended = input.reservation?.status === "ended";
    return {
      a: ended
        ? say("that booking has already ended, so the app won't extend it. How long do you need? If a spot is open I can set it up outside the app. If not, you'll need to move.")
        : say("how long do you need? If the booking is still open in the app: Parking Pass, tap the end time, change it, check availability, then update. If the app errors, tell me and we'll do it another way."),
      b: say("tell me the extra time you want and I'll check whether it's actually open. I won't guess."),
      c: "How much longer do you need, and are you still inside the original end time?",
    };
  }
  if (n === 9) {
    return {
      a: "You're welcome! If you need anything else, just let us know. Have a great day!",
      b: "Glad that worked. Text us if anything else comes up.",
    };
  }
  if (n === 16) {
    return {
      a: say(`I hear how frustrating this is. Let's find the spot. Directions: ${directionsOrCheck(facts)}. If the pin dropped you in the wrong place, tell me what you see and I'll correct it.`),
      b: say("sorry, this has been a mess. Send a wide photo of where you are and I'll walk you in. I'm not going to argue about it."),
      c: "Are you on foot at the lot, or still in the car?",
    };
  }
  if (n === 19) {
    return {
      a: say("you won't be towed as long as you park in the correct spot, during your reservation, with the correct plate. If you can, send a wide photo and I'll compare it to the listing."),
      b: say("if your photo matches the listing, you're all set. If it's tight or unclear, send a wider one and I'll look before you worry about a tow."),
      c: "Can you send a wide photo that shows the spot and your car?",
    };
  }
  if (n === 23) {
    return {
      a: say("I'm sorry that happened. I can't say whose fault it is, and I won't guess at a payout. Please send photos, the time, the spot, your plate, and the rental ID. We'll review it and I'll tell you what happens next."),
      b: say("sorry you're dealing with that. You're safe to send photos when you can. We review damage and injury before anyone talks about money, and I won't place blame in a text."),
      c: "Are you hurt, or is this damage to the car?",
    };
  }
  if (n === 25) {
    return {
      a: say("I hear you, and I want to help. I'm not going to argue. Tell me what's going on with the spot and I'll work the next step with you. A call works too if that's easier."),
      b: say("we can keep this to the parking problem. What do you need right now: the spot, a refund review, or a person on the phone?"),
      c: "Do you want to keep going by text, or would a call be easier?",
    };
  }
  if (n === 18) {
    return {
      a: say("a wrong plate can get the car towed, so let's fix it. What plate, make, model, and state should be on the booking? In the app: Parking Pass, edit next to the vehicle, save."),
      b: say("text me the plate, make, model, and state. If the app won't save it, we'll notify the tow partner ourselves."),
      c: "What is the plate, and what state is it from?",
    };
  }
  if (n === 26) {
    const limit = facts.sizeLimit ?? "[CHECK: size limit]";
    return {
      a: say(`the size limit on file is ${limit}. What are the width and length, and can you send a wide photo? If it doesn't fit we'll relocate you or refund and resell. I won't leave you stuck.`),
      b: say(`send a wide photo plus width and length. Limit on file: ${limit}. If you're over it, we'll still help you find somewhere to put the vehicle.`),
      c: "About how wide and long is the vehicle?",
    };
  }

  const step = firstStep(sop);
  const opener = say(openerFor(latest, sop));
  return {
    a: [opener, step, "What would you like to do next?"].filter(Boolean).join(" "),
    b: [opener, "I'll keep this short.", step].filter(Boolean).join(" "),
    c: "What's going on right now, in one line?",
  };
}

function refundTemplates(input: DraftInput, thread: string, say: (sentence: string) => string): Pair {
  if (/was towed|got towed|tow truck|lawyer|attorney|damage|injur/i.test(thread)) {
    return {
      a: say(
        `I can't promise a refund or a reimbursement from a text. We'll review what happened first, and I won't guess an amount. SpotHero can also be reached at ${SPOTHERO_PHONE}.`,
      ),
      b: say("once someone reviews it, we'll tell you if any money is due. I won't put a number in this text."),
      c: "Is this about a tow, or a separate refund question?",
    };
  }
  const ours = /spot taken|blocked|barricade|reloc|dumpster|can't find|cant find/i.test(thread);
  const notStarted =
    input.reservation?.status === "upcoming" || /haven'?t started|not started|before (the )?start/i.test(thread);
  if (notStarted && !ours) {
    return {
      a: say("you can still cancel this one for a full refund since it hasn't started. Do it in the SpotHero app or website, or on the self-service line. Want the steps?"),
      b: say(`it hasn't started, so a full refund is the normal path. Cancel in the app, or call SpotHero at ${SPOTHERO_PHONE}.`),
      c: "Has the reservation started yet, or are you still before the start time?",
    };
  }
  if (
    !ours &&
    (input.reservation?.status === "active" ||
      input.reservation?.status === "ended" ||
      /don'?t need|no longer|change of mind|plans changed/i.test(thread))
  ) {
    return {
      a: say(
        `sorry this didn't work out. Once a reservation has started we can't cancel it for a refund. You can resell the leftover time, and if it sells we'll refund that resale amount. Policy: ${SPOTHERO_FAQ}`,
      ),
      b: say("I hear you. After the start time a refund isn't something we can do, but we can try to resell the rest and refund you if it sells. Want me to try?"),
      c: "Did the reservation already start, or are you still before the start time?",
    };
  }
  if (!ours) {
    return {
      a: say("I don't want to guess the refund path. Has the reservation started, and was the problem the spot itself or a change of plans?"),
      b: say(`if it hasn't started, cancel in the app for a full refund, or call SpotHero at ${SPOTHERO_PHONE}. If it has started, we can talk resale.`),
      c: "Has the booking started yet?",
    };
  }
  return {
    a: say(
      `sorry, this one's on us. [CHECK: amount we receive] is what we receive. SpotHero charges a fee. Was your total around [CHECK: customer total]? After you confirm, send the name on Zelle, a phone number, and an email, or call SpotHero at ${SPOTHERO_PHONE} for the original payment or SpotHero credit.`,
    ),
    b: say(
      `sorry this fell on us. I won't send a refund until the amount is confirmed ([CHECK: refund amount]). Do you want Zelle, or SpotHero at ${SPOTHERO_PHONE}?`,
    ),
    c: "Was the problem the spot itself, or a change of plans?",
  };
}

function openerFor(latest: string, sop: SopRecord | null): string {
  if (/refund|money back|cancel/i.test(latest)) return "sorry you're dealing with a refund.";
  if (/extend|more time/i.test(latest)) return "sorry you're tight on time.";
  if (/thank/i.test(latest)) return "you're welcome.";
  const short = latest.replace(/\s+/g, " ").trim().slice(0, 70);
  if (short) return `sorry about this: "${short}".`;
  return `sorry about the ${sop?.name.toLowerCase() ?? "parking"} issue.`;
}

function firstStep(sop: SopRecord | null): string | null {
  if (!sop) return null;
  const line = sop.steps.split(/\n|\.\s+/)[0]?.trim();
  if (!line) return null;
  return line.endsWith(".") ? line : `${line}.`;
}

function concernFor(input: DraftInput, mood: CustomerMood, matchedNames: string, latest: string): string {
  const who = nameOf(input) || "The customer";
  const question = latest.includes("?") ? " They asked a direct question." : "";
  const booking = input.reservation?.rentalId
    ? ` Reservation ${input.reservation.rentalId} at ${input.reservation.facility ?? "an unnamed facility"} is ${input.reservation.status}.`
    : " No rental ID in the thread yet.";
  return `${who} sounds ${mood}. Matched ${matchedNames || "no SOP"}.${question}${booking} Latest text: “${latest.replace(/\s+/g, " ").slice(0, 180)}”`;
}

function applyEdit(previous: string, changes: string): string {
  let text = previous;
  if (/shorter|briefer|cut it|keep it short/i.test(changes)) text = shorten(text);
  if (/warmer|kinder|softer|more empath/i.test(changes) && !/^i hear you/i.test(text)) {
    text = `I hear you. ${text}`;
  }
  const drop = changes.match(/(?:don'?t|do not)\s+mention\s+(?:the\s+)?([^.]+)/i)?.[1]?.trim();
  if (drop) {
    const token = drop.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
    const kept = text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !sentence.toLowerCase().includes(token.slice(0, 18)));
    if (kept.length > 0) text = kept.join(" ");
  }
  const amount = changes.match(/\$\d+(?:\.\d{2})?/);
  if (amount && /amount|refund|total|tell|say/i.test(changes)) {
    if (/\[CHECK:[^\]]*(?:amount|total)[^\]]*\]/i.test(text)) {
      text = text.replace(/\[CHECK:[^\]]*(?:amount|total)[^\]]*\]/i, amount[0]);
    } else {
      text = `${text} The amount to use is ${amount[0]}.`;
    }
  }
  const quoted = changes.match(/say\s+(?:that\s+)?[“"](.+?)[”"]/i);
  if (quoted) text = quoted[1];
  if (text.trim() === previous.trim()) {
    const ask = changes.replace(/^ask (them|the customer|her|him)\s+(to\s+)?/i, "");
    if (/^ask /i.test(changes)) text = `${previous} Can you ${ask.replace(/[?.]$/, "")}?`;
    else text = `${previous} ${changes.trim().replace(/\.$/, "")}.`;
  }
  return text.replace(/\s+/g, " ").replace(/\s+\?/g, "?").trim();
}

function bundleFrom(
  input: DraftInput,
  latestId: string,
  latest: string,
  pair: Pair,
  violations: string[],
): DraftBundle {
  const matched = matchSops(input.thread.messages, input.sops);
  const mood = moodOf(input.thread.messages.filter((m) => m.direction === "inbound").map((m) => m.body).join("\n"));
  const urgency = classifyUrgency(input.thread.messages);
  const primary = matched[0]?.sop.number;
  const escalate = urgency.urgent || primary === 13 || primary === 23 || primary === 25 || mood === "angry";
  const names = matched.map((item) => `SOP ${item.sop.number} ${item.sop.name}`);
  const sopNote = names.length >= 2 ? `Two SOPs apply: ${names.slice(0, 2).join(" and ")}. Using both.` : names[0] ? `Using ${names[0]}.` : "No SOP keyword match. Draft is a careful general reply.";
  const options: DraftOption[] = [
    { id: "A", label: "Recommended", text: finish(pair.a, input, latest, violations) },
    { id: "B", label: "Warmer or shorter", text: finish(pair.b, input, latest, violations) },
  ];
  if (pair.c) options.push({ id: "C", label: "Clarifying question", text: finish(pair.c, input, latest, violations) });
  const disagreement = collectDisagreementNotes(matched.map((item) => item.sop));
  const agentBits = [
    escalate ? "Escalate. Marked urgent." : "",
    violations.length ? `Removed a hard-rule problem from the draft (${[...new Set(violations)].join(", ")}).` : "",
    input.reservation ? "" : "Ask for the rental ID. It was not in the thread.",
  ].filter(Boolean);
  return {
    threadId: input.thread.id,
    basedOnMessageId: latestId,
    concern: concernFor(input, mood, names.join(" and "), latest),
    mood,
    reservation: input.reservation,
    facilityName: input.facility?.name ?? null,
    matchedSops: matched,
    disagreementNotes: disagreement,
    sopNote,
    options,
    agentQuestion: agentBits.join(" "),
    urgent: urgency.urgent || primary === 13 || primary === 23 || primary === 25,
    escalate,
    createdAt: input.nowIso,
    engine: "local",
  };
}

export function draftLocally(input: DraftInput): DraftBundle {
  const latestMessage = input.thread.messages.find((m) => m.id === input.latestCustomerMessageId);
  const latest = latestMessage?.body.trim() ?? "";
  const facts = extractFacilityFacts(input.facility?.notes ?? "");
  const violations: string[] = [];
  if (input.edit) {
    const edited = applyEdit(input.edit.previousText, input.edit.changes);
    const shorter = shorten(edited);
    const pair: Pair = {
      a: edited,
      b: shorter === edited ? `Hey, ${edited.charAt(0).toLowerCase()}${edited.slice(1)}` : shorter,
      c: input.edit.previous.options.find((option) => option.id === "C")?.text,
    };
    const bundle = bundleFrom(input, input.latestCustomerMessageId, latest, pair, violations);
    bundle.agentQuestion = ["Redraft after your edit. The old approval does not carry over.", bundle.agentQuestion]
      .filter(Boolean)
      .join(" ");
    return bundle;
  }
  const matched = matchSops(input.thread.messages, input.sops);
  const pair = templates(input, latest, facts, matched[0]?.sop ?? null);
  if (matched.length >= 2 && matched[1].sop.number !== matched[0].sop.number) {
    const second = templates(input, latest, facts, matched[1].sop);
    pair.b = second.a;
  }
  return bundleFrom(input, input.latestCustomerMessageId, latest, pair, violations);
}

export function createLocalDrafter(): Drafter {
  return {
    draft(input) {
      return Promise.resolve(draftLocally(input));
    },
  };
}
