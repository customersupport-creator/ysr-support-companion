import { AIRTABLE, SUPPORT_LINE_E164 } from "../../shared/constants";
import { toE164 } from "../../core/format";
import type { FacilityRecord, SmsMessage, SopRecord } from "../../shared/types";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface ListResponse {
  records?: AirtableRecord[];
  offset?: string;
}


function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export class AirtableClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

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
