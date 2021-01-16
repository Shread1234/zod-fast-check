import fc from "fast-check";
import * as z from "zod";
import { zodInputArbitrary } from "../src/zod-fast-check";

describe("Generate arbitaries for Zod schema input type", () => {
  const schemas = {
    null: z.null(),
    undefined: z.undefined(),
    string: z.string(),
    number: z.number(),
    bigint: z.bigint(),
    boolean: z.boolean(),
    date: z.date(),
    "array of numbers": z.array(z.number()),
    "array of string": z.array(z.string()),
    "array of arrays of booleans": z.array(z.array(z.boolean())),
    "nonempty array": z.array(z.number()).nonempty(),
    // "empty object": z.object({}),
  };

  for (const [name, schema] of Object.entries(schemas)) {
    test(name, () => {
      const arbitrary = zodInputArbitrary<z.infer<typeof schema>>(schema);
      return fc.assert(
        fc.property(arbitrary, (value) => {
          schema.parse(value);
        })
      );
    });
  }
});
