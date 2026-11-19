/**
 * iMessage tapbacks sometimes arrive on SMS as their own texts.
 * They are not a customer asking for help, and they are not a reply.
 */
const REACTION = new RegExp(
  [
    "^(liked|loved|disliked|laughed at|emphasized|questioned)\\s+[\\u201c\\u201d\"'].*[\\u201c\\u201d\"']\\s*$",
    "^(liked|loved|disliked|laughed at|emphasized|questioned)\\s+an?\\s+(image|photo|picture|message|audio|video|attachment)\\s*$",
    "^reacted\\s+.+\\s+to\\s+[\\u201c\\u201d\"'].*[\\u201c\\u201d\"']\\s*$",
    "^removed\\s+(a\\s+|an\\s+)?(like|love|heart|dislike|laugh|ha ha|haha|emphasis|exclamation|question|reaction)\\b.*$",
  ].join("|"),
  "i",
);

export function isReactionMessage(body: string): boolean {
  return REACTION.test(body.trim());
}
