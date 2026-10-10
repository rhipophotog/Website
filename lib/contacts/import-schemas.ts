import { z } from "zod";
import { IMPORT_FIELD_KEYS } from "./import-mapping";

/**
 * Input checks for the import server actions (kept out of the "use server" file so they can be tested).
 * partialRecord, not record: in Zod 4 a record keyed by an enum requires every key to be present,
 * and a mapped CSV row only carries the columns the file has.
 */

export const IMPORT_BATCH_SIZE = 250;

export const mappedRowSchema = z.partialRecord(z.enum(IMPORT_FIELD_KEYS), z.string().max(10_000));
export const rowsSchema = z.array(mappedRowSchema).max(IMPORT_BATCH_SIZE);
export const stageMappingSchema = z.record(z.string().max(200), z.string().regex(/^[a-z_]*$/).max(40));
