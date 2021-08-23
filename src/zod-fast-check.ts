import fc, { Arbitrary } from "fast-check";
import {
  // ZodDef,
  ZodSchema,
  ZodTypeDef,
  // ZodTypes,
  ZodArrayDef,
  ZodEnumDef,
  ZodLiteralDef,
  ZodMapDef,
  ZodNativeEnumDef,
  ZodNullableDef,
  ZodObjectDef,
  ZodOptionalDef,
  ZodRecordDef,
  ZodTupleDef,
  ZodUnionDef,
  // ZodTransformerDef,
  ZodPromiseDef,
  ZodFunctionDef,
  ZodString,
  ZodNumber,
  ZodBigInt,
  ZodBoolean,
  ZodUndefined,
  ZodNull,
  ZodArray,
  ZodObject,
  ZodUnion,
  ZodTuple,
  ZodRecord,
  ZodMap,
  ZodFunction,
  ZodDate,
  ZodIntersection,
  ZodLazy,
  ZodLiteral,
  ZodEnum,
  ZodNativeEnum,
  ZodPromise,
  ZodAny,
  ZodUnknown,
  ZodNever,
  ZodVoid,
  ZodOptional,
  ZodNullable,
  ZodNumberDef,
  ZodEffects,
  ZodEffectsDef,
} from "zod";

const MIN_SUCCESS_RATE = 0.01;

type ZodSchemaToArbitrary = (
  schema: ZodSchema<unknown, ZodTypeDef, unknown>
) => Arbitrary<unknown>;

// type ArbitraryBuilder = {
//   [TypeName in ZodTypes]: (
//     def: Extract<ZodDef, { t: TypeName }>,
//     recurse: ZodSchemaToArbitrary
//   ) => Arbitrary<unknown>;
// };

const ZOD_TYPES = [
  [ZodString, "string"],
  [ZodNumber, "number"],
  [ZodBigInt, "bigint"],
  [ZodBoolean, "boolean"],
  [ZodDate, "date"],
  [ZodUndefined, "undefined"],
  [ZodNull, "null"],
  [ZodArray, "array"],
  [ZodObject, "object"],
  [ZodUnion, "union"],
  [ZodIntersection, "intersection"],
  [ZodTuple, "tuple"],
  [ZodRecord, "record"],
  [ZodMap, "map"],
  [ZodFunction, "function"],
  [ZodLazy, "lazy"],
  [ZodLiteral, "literal"],
  [ZodEnum, "enum"],
  [ZodNativeEnum, "nativeEnum"],
  [ZodPromise, "promise"],
  [ZodAny, "any"],
  [ZodUnknown, "unknown"],
  [ZodNever, "never"],
  [ZodVoid, "void"],
  [ZodOptional, "optional"],
  [ZodNullable, "nullable"],
  [ZodEffects, "effects"],
] as const;

class _ZodFastCheck {
  private overrides = new Map<
    ZodSchema<unknown, ZodTypeDef, unknown>,
    Arbitrary<unknown>
  >();

  private clone(): ZodFastCheck {
    const cloned = new _ZodFastCheck();
    this.overrides.forEach((arbitrary, schema) => {
      cloned.overrides.set(schema, arbitrary);
    });
    return cloned;
  }

  /**
   * Creates an arbitrary which will generate valid inputs to the schema.
   */
  inputOf<Input>(
    zodSchema: ZodSchema<unknown, ZodTypeDef, Input>
  ): Arbitrary<Input> {
    const def = zodSchema._def;

    let preEffectsArbitrary: Arbitrary<Input>;

    const override = this.overrides.get(zodSchema);

    if (override) {
      preEffectsArbitrary = override as Arbitrary<Input>;
    } else {
      const builder = findArbitraryBuilder(zodSchema);
      preEffectsArbitrary = builder(def, this.inputOf.bind(this));
    }

    return preEffectsArbitrary;
  }

  /**
   * Creates an arbitrary which will generate valid parsed outputs of
   * the schema.
   */
  outputOf<Output, Input>(
    zodSchema: ZodSchema<Output, ZodTypeDef, Input>
  ): Arbitrary<Output> {
    throw "TODO";
    // const def: ZodDef = zodSchema._def as ZodDef;

    // let preEffectsArbitrary: Arbitrary<Input>;

    // const override = this.overrides.get(zodSchema);

    // if (override) {
    //   preEffectsArbitrary = override as Arbitrary<Input>;
    // } else {
    //   const builder = arbitraryBuilder[def.t] as (
    //     def: ZodDef,
    //     recurse: ZodSchemaToArbitrary
    //   ) => Arbitrary<Input>;

    //   preEffectsArbitrary = builder(def, this.outputOf.bind(this));
    // }

    // // Applying the effects is quite slow, so we can skip that if
    // // there are no effects.
    // if ((def.effects ?? []).length === 0) {
    //   return preEffectsArbitrary as Arbitrary<any>;
    // }

    // return preEffectsArbitrary
    //   .map((value) => zodSchema.safeParse(value))
    //   .filter(
    //     throwIfSuccessRateBelow(
    //       MIN_SUCCESS_RATE,
    //       isUnionMember({ success: true })
    //     )
    //   )
    //   .map((parsed) => parsed.data);
  }

  /**
   * Returns a new `ZodFastCheck` instance which will use the provided
   * arbitrary when generating inputs for the given schema.
   */
  override<Input>(
    schema: ZodSchema<unknown, ZodTypeDef, Input>,
    arbitrary: Arbitrary<Input>
  ): ZodFastCheck {
    const withOverride = this.clone();
    withOverride.overrides.set(schema, arbitrary);
    return withOverride;
  }
}

export type ZodFastCheck = _ZodFastCheck;

// Wrapper function to allow instantiation without "new"
export function ZodFastCheck(): ZodFastCheck {
  return new _ZodFastCheck();
}

// Reassign the wrapper function's prototype to ensure
// "instanceof" works as expected.
ZodFastCheck.prototype = _ZodFastCheck.prototype;

function findArbitraryBuilder<Input>(
  zodSchema: ZodSchema<unknown, ZodTypeDef, Input>
): (def: ZodTypeDef, recurse: ZodSchemaToArbitrary) => Arbitrary<Input> {
  // Could we use the `typeName` property of the def to do this
  // lookup more efficiently?

  for (const [zodType, name] of ZOD_TYPES) {
    if (zodSchema instanceof zodType) {
      return arbitraryBuilders[name] as (
        def: ZodTypeDef,
        recurse: ZodSchemaToArbitrary
      ) => Arbitrary<any>;
    }
  }
  throw Error(`Unsupported schema type: ${zodSchema.constructor.name}.`);
}

// TODO add return type definitions to arbitrary builders.
const arbitraryBuilders = {
  string() {
    return fc.string();
  },
  number(def: ZodNumberDef) {
    let min = -(2 ** 64);
    let max = 2 ** 64;
    let isInt = false;

    for (const check of def.checks) {
      switch (check.kind) {
        case "min":
          min = Math.max(
            min,
            check.inclusive ? check.value : check.value + 0.001
          );
          break;
        case "max":
          max = Math.min(
            max,
            check.inclusive ? check.value : check.value - 0.001
          );
        case "int":
          isInt = true;
      }
    }

    if (isInt) {
      return fc.integer(min, max);
    } else {
      return fc.double(min, max);
    }
  },
  bigint() {
    return fc.bigInt();
  },
  boolean() {
    return fc.boolean();
  },
  date() {
    return fc.date();
  },
  undefined() {
    return fc.constant(undefined);
  },
  null() {
    return fc.constant(null);
  },
  array(def: ZodArrayDef, recurse: ZodSchemaToArbitrary) {
    const minLength = def.minLength?.value ?? 0;
    const maxLength = Math.min(def.maxLength?.value ?? 10, 10);
    return fc.array(recurse(def.type), minLength, maxLength);
  },
  object(def: ZodObjectDef, recurse: ZodSchemaToArbitrary) {
    const propertyArbitraries = objectFromEntries(
      Object.entries(def.shape()).map(([property, propSchema]) => [
        property,
        recurse(propSchema),
      ])
    );
    return fc.record(propertyArbitraries);
  },
  union(def: ZodUnionDef, recurse: ZodSchemaToArbitrary) {
    return fc.oneof(...def.options.map(recurse));
  },
  intersection() {
    throw Error("Intersection schemas are not yet supported.");
  },
  tuple(def: ZodTupleDef, recurse: ZodSchemaToArbitrary) {
    return fc.genericTuple(def.items.map(recurse));
  },
  record(def: ZodRecordDef, recurse: ZodSchemaToArbitrary) {
    return fc.dictionary(fc.string(), recurse(def.valueType));
  },
  map(def: ZodMapDef, recurse: ZodSchemaToArbitrary) {
    const key = recurse(def.keyType);
    const value = recurse(def.valueType);
    return fc.array(fc.tuple(key, value)).map((entries) => new Map(entries));
  },
  function(def: ZodFunctionDef, recurse: ZodSchemaToArbitrary) {
    return recurse(def.returns).map((returnValue) => () => returnValue);
  },
  lazy() {
    throw Error("Lazy schemas are not yet supported.");
  },
  literal(def: ZodLiteralDef) {
    return fc.constant(def.value);
  },
  enum(def: ZodEnumDef) {
    return fc.oneof(...def.values.map(fc.constant));
  },
  nativeEnum(def: ZodNativeEnumDef) {
    const enumValues = getValidEnumValues(def.values);
    return fc.oneof(...enumValues.map(fc.constant));
  },
  promise(def: ZodPromiseDef, recurse: ZodSchemaToArbitrary) {
    return recurse(def.type).map((value) => Promise.resolve(value));
  },
  any() {
    return fc.anything();
  },
  unknown() {
    return fc.anything();
  },
  never() {
    throw Error("A runtime value cannot be generated for a 'never' schema.");
  },
  void() {
    return fc.constant(undefined);
  },
  optional(def: ZodOptionalDef, recurse: ZodSchemaToArbitrary) {
    const nil = undefined;
    return fc.option(recurse(def.innerType), { nil, freq: 2 });
  },
  nullable(def: ZodNullableDef, recurse: ZodSchemaToArbitrary) {
    const nil = null;
    return fc.option(recurse(def.innerType), { nil, freq: 2 });
  },
  effects(def: ZodEffectsDef, recurse: ZodSchemaToArbitrary) {
    const preEffectsArbitrary = recurse(def.schema);

    const effectsSchema = new ZodEffects(def);

    return preEffectsArbitrary.filter(
      throwIfSuccessRateBelow(
        MIN_SUCCESS_RATE,
        (value): value is typeof value => effectsSchema.safeParse(value).success
      )
    );
  },
};

export class ZodFastCheckError extends Error {}

export class ZodFastCheckGenerationError extends ZodFastCheckError {}

/**
 * Returns a type guard which filters one member from a union type.
 */
const isUnionMember = <T, Filter extends Partial<T>>(filter: Filter) => (
  value: T
): value is Extract<T, Filter> => {
  return Object.entries(filter).every(
    ([key, expected]) => value[key as keyof T] === expected
  );
};

function throwIfSuccessRateBelow<Value, Refined extends Value>(
  rate: number,
  predicate: (value: Value) => value is Refined
): (value: Value) => value is Refined {
  const MIN_RUNS = 1000;

  let successful = 0;
  let total = 0;

  return (value: Value): value is Refined => {
    const isSuccess = predicate(value);

    total += 1;
    if (isSuccess) successful += 1;

    if (total > MIN_RUNS && successful / total < rate) {
      throw new ZodFastCheckGenerationError(
        "Unable to generate valid values for Zod schema. " +
          "An override is must be provided."
      );
    }

    return isSuccess;
  };
}

function objectFromEntries<Value>(
  entries: Array<[string, Value]>
): Record<string, Value> {
  const object: Record<string, Value> = {};
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    object[key] = value;
  }
  return object;
}

export const getValidEnumValues = (obj: any) => {
  const validKeys = Object.keys(obj).filter(
    (k: any) => typeof obj[obj[k]] !== "number"
  );
  const filtered: any = {};
  for (const k of validKeys) {
    filtered[k] = obj[k];
  }
  return getValues(filtered);
};

export const getValues = (obj: any) => {
  return Object.keys(obj).map(function (e) {
    return obj[e];
  });
};
