import { AIRTABLE, SUPPORT_LINE_E164 } from "../../shared/constants";
import { toE164 } from "../../core/format";
import type { Correction, FacilityRecord, SmsMessage, SopRecord } from "../../shared/types";

const PROTECTED_TABLES = new Set<string>([
  AIRTABLE.sopsTableId,
  AIRTABLE.messagesTableId,
  AIRTABLE.qaTableId,
  AIRTABLE.facilityTableId,
]);

const CORRECTION_FIELDS = [
  "Correction",
  "Agent",
  "Thread ID",
  "Customer Phone",
  "Before",
  "After",
  "Change Kinds",
  "Created At",
] as const;

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface ListResponse {
  records?: AirtableRecord[];
  offset?: string;
}

interface TableSchema {
  id: string;
  name: string;
  fields?: Array<{ name: string }>;
}

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export class AirtableClient {
  private correctionsTableId: string | null = null;

  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  setCorrectionsTableId(id: string | null): void {
    this.correctionsTableId = id;
  }

  async listSops(): Promise<SopRecord[]> {
    const records = await this.listAll(AIRTABLE.qaBaseId, AIRTABLE.sopsTableId);
    return records.map((record) => ({
      id: record.id,
      number: Number(record.fields["SOP Number"] ?? 0),
      name: text(record.fields["SOP Name"]),
      triggerKeywords: text(record.fields["Trigger Keywords"]),
      matchKeywords: text(record.fields["Match Keywords"]),
      lookups: text(record.fields.Lookups),
      steps: text(record.fields.Steps),
      suggestedReplies: text(record.fields["Suggested Replies"]),
      escalateTo: text(record.fields["Escalate To"]),
      notes: text(record.fields.Notes),
      status: text(record.fields.Status),
      source: "airtable" as const,
    }));
  }

  async listRecentMessages(maxPages = 3): Promise<SmsMessage[]> {
    const records = await this.listAll(AIRTABLE.qaBaseId, AIRTABLE.messagesTableId, maxPages, {
      "sort[0][field]": "Timestamp",
      "sort[0][direction]": "desc",
    });
    const messages: SmsMessage[] = [];
    for (const record of records) {
      const phone = toE164(text(record.fields["Customer Phone"]));
      const body = text(record.fields["Message Body"]);
      const sentAt = text(record.fields.Timestamp);
      const directionRaw = text(record.fields.Direction).toLowerCase();
      if (!phone || !sentAt) continue;
      const direction = directionRaw.startsWith("out") ? "outbound" : "inbound";
      messages.push({
        id: `airtable:${record.id}`,
        threadId: phone,
        direction,
        body,
        sentAt,
        fromPhone: direction === "inbound" ? phone : SUPPORT_LINE_E164,
        toPhone: direction === "inbound" ? SUPPORT_LINE_E164 : phone,
        source: "airtable",
      });
    }
    return messages;
  }

  async listFacilities(): Promise<FacilityRecord[]> {
    const records = await this.listAll(AIRTABLE.facilityBaseId, AIRTABLE.facilityTableId, 40);
    return records.map((record) => {
      const stalls = [
        ["SpotHero", record.fields["SPOTHERO # of Stalls"]],
        ["ParkWhiz", record.fields["PARKWHIZ # OF STALL"]],
        ["Way.com", record.fields["WAY.COM # OF STALL"]],
        ["Neighbor", record.fields["NEIGHBOR # OF STALL"]],
        ["Spacer", record.fields["SPACER # OF STALL"]],
      ]
        .map(([label, value]) => (text(value) ? `${label} ${text(value)}` : ""))
        .filter(Boolean)
        .join(", ");
      const stallCount = record.fields["NO. OF STALLS"];
      return {
        id: record.id,
        name: text(record.fields["FACILITY NAME"]),
        address: text(record.fields["FACILITY ADDRESS"]),
        facilityId: text(record.fields["FACILITY ID"]),
        status: text(record.fields["FACILITY STATUS"]),
        notes: text(record.fields["FACILITY NOTES"]),
        gps: text(record.fields["GPS COORDINATES"]),
        stallCount: typeof stallCount === "number" ? stallCount : null,
        stallsByPlatform: stalls,
        towingCompany: text(record.fields["TOWING COMPANY"]),
        salesTowAuthorization: text(record.fields["SALES TEAM TOW AUTHORIZATION"]),
        landlord: text(record.fields.LANDLORD) || text(record.fields["LANDLORD INFO"]),
        doNotTowPlates: text(record.fields["DO NOT TOW-PLATES"]),
        doNotTowVehicles: text(record.fields["DO NOT TOW-MAKE AND MODEL"]),
        contactPerson: text(record.fields["CONTACT PERSON"]),
        phone: text(record.fields["PHONE NUMBER"]),
        email: text(record.fields["EMAIL ADDRESS"]),
      };
    });
  }

  /**
   * Looks for AGENT_CORRECTIONS and reports missing columns.
   * Does not create, rename, or alter any table.
   */
  async inspectCorrectionsTable(): Promise<{ id: string; missingFields: string[] } | null> {
    const table = await this.findTable(AIRTABLE.qaBaseId, AIRTABLE.correctionsTableName);
    if (!table) {
      this.correctionsTableId = null;
      return null;
    }
    const names = new Set((table.fields ?? []).map((field) => field.name));
    const missingFields = CORRECTION_FIELDS.filter((field) => !names.has(field));
    this.correctionsTableId = missingFields.length === 0 ? table.id : null;
    return { id: table.id, missingFields };
  }

  /**
   * Creates AGENT_CORRECTIONS only when that exact table is absent.
   * Refuses to update an existing table, even one with the same name.
   */
  async createCorrectionsTable(): Promise<string> {
    const existing = await this.findTable(AIRTABLE.qaBaseId, AIRTABLE.correctionsTableName);
    if (existing) {
      const names = new Set((existing.fields ?? []).map((field) => field.name));
      const missing = CORRECTION_FIELDS.filter((field) => !names.has(field));
      if (missing.length > 0) {
        throw new Error(
          `AGENT_CORRECTIONS already exists and is missing: ${missing.join(", ")}. This app will not modify it. Add those fields by hand, or remove the empty table and create it again here.`,
        );
      }
      this.correctionsTableId = existing.id;
      return existing.id;
    }
    const response = await this.fetchImpl(`https://api.airtable.com/v0/meta/bases/${AIRTABLE.qaBaseId}/tables`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        name: AIRTABLE.correctionsTableName,
        description:
          "Opt-in log of YSR Desk agent edits. Created by the desktop app. Not part of the original BeeTexting tables.",
        fields: CORRECTION_FIELDS.map((name) => ({
          name,
          type: name === "Before" || name === "After" ? "multilineText" : "singleLineText",
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Could not create AGENT_CORRECTIONS (${response.status}). The token needs schema.bases:write and base-creator access.`);
    }
    const json = (await response.json()) as { id?: string };
    if (!json.id) throw new Error("Airtable did not return a table id.");
    this.correctionsTableId = json.id;
    return json.id;
  }

  async addCorrection(correction: Correction): Promise<void> {
    if (!this.correctionsTableId) throw new Error("AGENT_CORRECTIONS is not ready.");
    this.assertWritable(this.correctionsTableId);
    const response = await this.fetchImpl(
      `https://api.airtable.com/v0/${AIRTABLE.qaBaseId}/${this.correctionsTableId}`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          records: [
            {
              fields: {
                Correction: `${correction.agent} ${correction.at}`.slice(0, 200),
                Agent: correction.agent,
                "Thread ID": correction.threadId,
                "Customer Phone": correction.customerPhone,
                Before: correction.before,
                After: correction.after,
                "Change Kinds": correction.kinds.join(", "),
                "Created At": correction.at,
              },
            },
          ],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Could not append a correction (${response.status}).`);
    }
  }

  private assertWritable(tableId: string): void {
    if (PROTECTED_TABLES.has(tableId)) {
      throw new Error("Refusing to write to an existing BeeTexting or facility table.");
    }
    if (tableId !== this.correctionsTableId) {
      throw new Error("Refusing to write to a table that is not AGENT_CORRECTIONS.");
    }
  }

  private async findTable(baseId: string, name: string): Promise<TableSchema | null> {
    const response = await this.fetchImpl(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`Airtable schema request failed (${response.status}).`);
    const json = (await response.json()) as { tables?: TableSchema[] };
    return json.tables?.find((table) => table.name === name) ?? null;
  }

  private async listAll(
    baseId: string,
    tableId: string,
    maxPages = 20,
    extra: Record<string, string> = {},
  ): Promise<AirtableRecord[]> {
    const records: AirtableRecord[] = [];
    let offset = "";
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({ pageSize: "100", ...extra });
      if (offset) params.set("offset", offset);
      const response = await this.fetchImpl(`https://api.airtable.com/v0/${baseId}/${tableId}?${params.toString()}`, {
        headers: this.headers(),
      });
      if (!response.ok) throw new Error(`Airtable read failed (${response.status}) for ${tableId}.`);
      const json = (await response.json()) as ListResponse;
      records.push(...(json.records ?? []));
      if (!json.offset) break;
      offset = json.offset;
    }
    return records;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }
}
