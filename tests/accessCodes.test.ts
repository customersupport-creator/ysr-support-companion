import { describe, expect, it } from "vitest";
import { parseFacilityAccess } from "../src/core/accessCodes";

describe("facility access codes", () => {
  it("reads spaced and dashed digits", () => {
    const spaced = parseFacilityAccess({ notes: "Gate Code: (9 1 8 2)" });
    expect(spaced?.codes.map((entry) => entry.code)).toEqual(["9182"]);
    expect(spaced?.accessType).toMatch(/gate/i);
    expect(spaced?.confidence).toBe("high");

    const dashed = parseFacilityAccess({ notes: "Keypad code is 6-1-4-0 then ENTER." });
    expect(dashed?.codes[0]?.code).toBe("6140");
    expect(dashed?.instructions.toLowerCase()).toContain("enter");
  });

  it("keeps labels for backup, doors, and garage numbers", () => {
    const backup = parseFacilityAccess({
      notes: "Press 4321\nThen enter\nIF BATTERY DIES\nCode is 7788\nbackup lockbox",
    });
    expect(backup?.codes.map((entry) => entry.code)).toEqual(expect.arrayContaining(["4321", "7788"]));

    const doors = parseFacilityAccess({
      notes: "LEFT GARAGE: 1010 then press Enter\nMiddle Garage: 2020 then press enter\nRight Garage: 3030 then Press Enter",
    });
    expect(doors?.codes.map((entry) => `${entry.label}:${entry.code}`)).toEqual([
      "left:1010",
      "middle:2020",
      "right:3030",
    ]);
    expect(doors?.confidence).toBe("high");

    const garage = parseFacilityAccess({ notes: "Garage code\n5151\nfor all the garage doors.\nGARAGE 2 - 6161" });
    expect(garage?.codes.map((entry) => entry.code)).toEqual(expect.arrayContaining(["5151", "6161"]));
    expect(garage?.codes.some((entry) => entry.label === "Garage 2" && entry.code === "6161")).toBe(true);
  });

  it("keeps a leading zero, a hash instruction, and arrow text", () => {
    const zero = parseFacilityAccess({ notes: "Garage code (0707)" });
    expect(zero?.codes[0]?.code).toBe("0707");
    const hashed = parseFacilityAccess({
      notes: "Main gate code: 2468# Pedestrian gate code: 1357. Press # after the code. Then press the LEFT ARROW.",
    });
    expect(hashed?.codes.map((entry) => entry.code)).toEqual(expect.arrayContaining(["2468", "1357"]));
    expect(hashed?.instructions.toLowerCase()).toContain("left arrow");
    const lot = parseFacilityAccess({ notes: "PERMANENT PASSCODE: 314159" });
    expect(lot?.codes[0]?.code).toBe("314159");
    expect(lot?.accessType).toMatch(/lot|passcode/i);
  });

  it("marks placeholders and alternatives as medium, and flags a coded garage with no code", () => {
    expect(parseFacilityAccess({ notes: "Keypad Code 1234" })?.confidence).toBe("medium");
    expect(parseFacilityAccess({ notes: "Keypad code #3551 or 5551" })?.confidence).toBe("medium");
    const missing = parseFacilityAccess({
      notes: "",
      towingCompany: "CODED GARAGE - lookup tool not set up",
    });
    expect(missing?.codedGarageNoCode).toBe(true);
    expect(missing?.codes).toEqual([]);
    expect(missing?.instructions).toMatch(/no code on file/i);
  });
});
