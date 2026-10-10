import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvWithHeader, toCsv } from "@/lib/contacts/csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines inside fields", () => {
    const text = 'name,note\n"Sharma, Priya","She said ""yes!""\nCall after 5"\nRohan,plain';
    expect(parseCsv(text)).toEqual([
      ["name", "note"],
      ["Sharma, Priya", 'She said "yes!"\nCall after 5'],
      ["Rohan", "plain"],
    ]);
  });

  it("handles CRLF, a UTF-8 BOM, empty fields and blank lines", () => {
    expect(parseCsv("﻿a,b,c\r\n1,,3\r\n\r\n,,\r\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("maps rows to headers, padding missing cells", () => {
    const { headers, rows } = parseCsvWithHeader(" First Name ,Email\nPriya\n");
    expect(headers).toEqual(["First Name", "Email"]);
    expect(rows).toEqual([{ "First Name": "Priya", Email: "" }]);
  });
});

describe("toCsv", () => {
  it("quotes only when needed and round-trips", () => {
    const rows = [
      ["name", "note"],
      ["Sharma, Priya", 'said "hi"\nbye'],
    ];
    const csv = toCsv(rows);
    expect(csv).toBe('name,note\r\n"Sharma, Priya","said ""hi""\nbye"');
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("neutralises spreadsheet formulas (CSV injection)", () => {
    expect(toCsv([["=HYPERLINK(\"http://evil\")", "+1415", "-2", "@SUM(A1)", "ok"]])).toBe(
      `"'=HYPERLINK(""http://evil"")",'+1415,'-2,'@SUM(A1),ok`,
    );
  });
});
